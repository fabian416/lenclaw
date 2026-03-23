#!/usr/bin/env python3
"""
Lenclaw ZK Credit Prover CLI

Generates zero-knowledge proofs attesting to an AI agent's creditworthiness.
The prover takes private agent data (revenue, code, reputation) and public
thresholds, then generates a proof using Noir/Nargo that can be verified
on-chain by ZKCreditVerifier.sol.

Usage:
    python prove.py generate \
        --agent-id 42 \
        --revenue 500000000 \
        --code-file ./agent_code.py \
        --reputation 800 \
        --revenue-threshold 100000000 \
        --min-reputation 600 \
        --registered-code-hash 0x... \
        --output proof.json

    python prove.py hash-code --code-file ./agent_code.py

    python prove.py prepare-calldata --proof-file proof.json
"""

import json
import os
import subprocess
import sys
import hashlib
import struct
from pathlib import Path
from dataclasses import dataclass, asdict
from typing import Optional

try:
    import click
    from rich.console import Console
    from rich.table import Table
    HAS_RICH = True
except ImportError:
    HAS_RICH = False
    click = None

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

# Path to the Noir circuit project (relative to this file)
CIRCUITS_DIR = Path(__file__).parent.parent / "circuits"
PROVER_TOML = CIRCUITS_DIR / "Prover.toml"
PROOF_DIR = CIRCUITS_DIR / "proofs"

# Maximum code size in field elements (must match circuit constant)
MAX_CODE_FIELDS = 256

# BN254 scalar field modulus
BN254_SCALAR_FIELD = (
    21888242871839275222246405745257275088548364400416034343698204186575808495617
)


# ---------------------------------------------------------------------------
# Data Structures
# ---------------------------------------------------------------------------

@dataclass
class AgentData:
    """Private agent data used as witness inputs to the circuit."""
    agent_id: int
    actual_revenue: int        # In USDT with 6 decimals
    code_fields: list[int]     # Code packed into field elements
    code_length: int           # Number of valid code fields
    actual_reputation: int     # 0-1000


@dataclass
class PublicInputs:
    """Public inputs visible to the verifier."""
    revenue_threshold: int     # Minimum revenue to prove
    registered_code_hash: str  # Hex string of the code hash (BN254 field element)
    min_reputation: int        # Minimum reputation to prove
    agent_id: int              # Agent NFT ID


@dataclass
class ProofResult:
    """Output of the proof generation process."""
    proof_hex: str             # Hex-encoded proof bytes
    public_inputs: PublicInputs
    revenue_tier: int          # 0-4
    reputation_band: int       # 0-3
    proof_file: str            # Path to the proof file


# ---------------------------------------------------------------------------
# Code Packing
# ---------------------------------------------------------------------------

def pack_code_to_fields(code_bytes: bytes) -> tuple[list[int], int]:
    """
    Pack code bytes into field elements for the circuit.

    Each field element holds up to 31 bytes (to stay within the BN254 scalar
    field). We pad the array to MAX_CODE_FIELDS with zeros.

    Args:
        code_bytes: Raw bytes of the agent's source code.

    Returns:
        Tuple of (field_elements, code_length) where code_length is the
        number of non-zero field elements.
    """
    # For simplicity, we pack one byte per field element.
    # This is less efficient but matches the circuit's expectation.
    if len(code_bytes) > MAX_CODE_FIELDS:
        raise ValueError(
            f"Code too large: {len(code_bytes)} bytes exceeds "
            f"maximum {MAX_CODE_FIELDS} field elements"
        )

    fields = [0] * MAX_CODE_FIELDS
    for i, byte in enumerate(code_bytes):
        fields[i] = int(byte)

    return fields, len(code_bytes)


def compute_code_hash(fields: list[int]) -> str:
    """
    Compute a deterministic hash of the code fields for the MVP.

    This uses SHA-256 reduced modulo the BN254 scalar field to produce a
    single Field element.  The same function MUST be used both when
    registering the agent in AgentRegistry and when generating the proof,
    so that the hashes match during on-chain verification.

    In production, replace this with the Poseidon hash computed by the Noir
    circuit (run ``nargo execute`` and read the hash from the witness).
    For the hackathon MVP, SHA-256 is used consistently across registration
    and proving to keep the end-to-end flow working without a native
    Poseidon implementation in Python.

    Args:
        fields: List of field elements representing the code (one byte per
                field element, padded to MAX_CODE_FIELDS).

    Returns:
        Hex string of the hash, fitting within the BN254 scalar field.
    """
    hasher = hashlib.sha256()
    for f in fields:
        hasher.update(f.to_bytes(32, "big"))
    digest = hasher.hexdigest()
    # Reduce to fit in BN254 scalar field (single Field element)
    value = int(digest, 16) % BN254_SCALAR_FIELD
    return hex(value)


# ---------------------------------------------------------------------------
# Revenue Tier / Reputation Band Computation
# ---------------------------------------------------------------------------

def compute_revenue_tier(revenue: int) -> int:
    """Compute revenue tier (0-4), matching the circuit logic."""
    if revenue >= 10_000_000_000:
        return 4
    elif revenue >= 100_000_000:
        return 3
    elif revenue >= 1_000_000:
        return 2
    elif revenue >= 10_000:
        return 1
    else:
        return 0


def compute_reputation_band(score: int) -> int:
    """Compute reputation band (0-3), matching the circuit logic."""
    if score >= 750:
        return 3
    elif score >= 500:
        return 2
    elif score >= 250:
        return 1
    else:
        return 0


# ---------------------------------------------------------------------------
# Prover.toml Generation
# ---------------------------------------------------------------------------

def generate_prover_toml(agent: AgentData, public: PublicInputs) -> str:
    """
    Generate a Prover.toml file for Nargo.

    Nargo reads private and public inputs from this file when generating proofs.

    Args:
        agent: Private agent data.
        public: Public input values.

    Returns:
        TOML string content for Prover.toml.
    """
    lines = []
    lines.append("# Lenclaw ZK Credit Proof - Prover Inputs")
    lines.append("# Generated by prove.py")
    lines.append("")

    # Private inputs
    lines.append("# Private inputs (witness only, not revealed)")
    lines.append(f'actual_revenue = "{agent.actual_revenue}"')

    # Code fields as array
    code_strs = [f'"{f}"' for f in agent.code_fields]
    lines.append(f"code_fields = [{', '.join(code_strs)}]")
    lines.append(f'code_length = "{agent.code_length}"')
    lines.append(f'actual_reputation = "{agent.actual_reputation}"')
    lines.append("")

    # Public inputs
    lines.append("# Public inputs (revealed to verifier)")
    lines.append(f'revenue_threshold = "{public.revenue_threshold}"')
    lines.append(f'registered_code_hash = "{public.registered_code_hash}"')
    lines.append(f'min_reputation = "{public.min_reputation}"')
    lines.append(f'agent_id = "{public.agent_id}"')

    return "\n".join(lines) + "\n"


# ---------------------------------------------------------------------------
# Nargo Integration
# ---------------------------------------------------------------------------

def check_nargo_installed() -> bool:
    """Check if nargo CLI is available."""
    try:
        result = subprocess.run(
            ["nargo", "--version"],
            capture_output=True,
            text=True,
            timeout=10,
        )
        return result.returncode == 0
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return False


def run_nargo_compile() -> bool:
    """Compile the Noir circuit."""
    print("[*] Compiling circuit...")
    result = subprocess.run(
        ["nargo", "compile"],
        cwd=str(CIRCUITS_DIR),
        capture_output=True,
        text=True,
        timeout=120,
    )
    if result.returncode != 0:
        print(f"[!] Compilation failed:\n{result.stderr}")
        return False
    print("[+] Circuit compiled successfully")
    return True


def run_nargo_prove(proof_name: str = "credit_proof") -> Optional[str]:
    """
    Generate a proof using nargo.

    Args:
        proof_name: Name for the proof file.

    Returns:
        Path to the generated proof file, or None on failure.
    """
    print("[*] Generating proof (this may take a moment)...")
    result = subprocess.run(
        ["nargo", "prove", "-p", proof_name],
        cwd=str(CIRCUITS_DIR),
        capture_output=True,
        text=True,
        timeout=300,
    )
    if result.returncode != 0:
        print(f"[!] Proof generation failed:\n{result.stderr}")
        return None

    proof_path = PROOF_DIR / f"{proof_name}.proof"
    if proof_path.exists():
        print(f"[+] Proof generated: {proof_path}")
        return str(proof_path)

    # Some nargo versions output to a different location
    alt_proof_path = CIRCUITS_DIR / "target" / f"{proof_name}.proof"
    if alt_proof_path.exists():
        print(f"[+] Proof generated: {alt_proof_path}")
        return str(alt_proof_path)

    print("[!] Proof file not found after generation")
    return None


def run_nargo_execute() -> Optional[dict]:
    """
    Execute the circuit to compute witness values without generating a proof.
    Useful for computing the Poseidon hash.

    Returns:
        Dictionary of return values, or None on failure.
    """
    print("[*] Executing circuit to compute witness...")
    result = subprocess.run(
        ["nargo", "execute"],
        cwd=str(CIRCUITS_DIR),
        capture_output=True,
        text=True,
        timeout=60,
    )
    if result.returncode != 0:
        print(f"[!] Execution failed:\n{result.stderr}")
        return None

    print("[+] Circuit executed successfully")
    # Parse output for return values
    return {"stdout": result.stdout, "stderr": result.stderr}


# ---------------------------------------------------------------------------
# Proof Output
# ---------------------------------------------------------------------------

def read_proof_file(proof_path: str) -> str:
    """Read a proof file and return hex-encoded bytes."""
    with open(proof_path, "rb") as f:
        return f.read().hex()


def generate_proof_json(
    proof_hex: str,
    public: PublicInputs,
    revenue_tier: int,
    reputation_band: int,
    proof_path: str,
) -> dict:
    """
    Generate the JSON output containing the proof and public inputs.

    This JSON can be used to submit the proof on-chain via ZKCreditVerifier.

    Args:
        proof_hex: Hex-encoded proof bytes.
        public: Public input values.
        revenue_tier: Computed revenue tier (0-4).
        reputation_band: Computed reputation band (0-3).
        proof_path: Path to the proof file.

    Returns:
        Dictionary suitable for JSON serialization.
    """
    return {
        "proof": f"0x{proof_hex}",
        "publicInputs": {
            "revenueThreshold": public.revenue_threshold,
            "registeredCodeHash": public.registered_code_hash,
            "minReputation": public.min_reputation,
            "agentId": public.agent_id,
        },
        "outputs": {
            "revenueTier": revenue_tier,
            "reputationBand": reputation_band,
        },
        "metadata": {
            "circuit": "lenclaw_credit_proof",
            "proofSystem": "UltraPlonk",
            "proofFile": proof_path,
        },
    }


def generate_calldata(proof_json: dict) -> str:
    """
    Generate Solidity calldata for ZKCreditVerifier.verifyCredit().

    This encodes the ProofData struct for on-chain submission.

    Args:
        proof_json: The proof JSON output from generate_proof_json.

    Returns:
        Hex-encoded calldata string.
    """
    try:
        from eth_abi import encode

        proof_bytes = bytes.fromhex(proof_json["proof"][2:])
        revenue_threshold = proof_json["publicInputs"]["revenueThreshold"]
        registered_code_hash = bytes.fromhex(
            proof_json["publicInputs"]["registeredCodeHash"][2:]
            if proof_json["publicInputs"]["registeredCodeHash"].startswith("0x")
            else proof_json["publicInputs"]["registeredCodeHash"]
        )
        min_reputation = proof_json["publicInputs"]["minReputation"]
        agent_id = proof_json["publicInputs"]["agentId"]
        revenue_tier = proof_json["outputs"]["revenueTier"]
        reputation_band = proof_json["outputs"]["reputationBand"]

        # ABI encode the ProofData struct
        # struct ProofData {
        #     bytes proof;
        #     uint64 revenueThreshold;
        #     bytes32 registeredCodeHash;
        #     uint64 minReputation;
        #     uint256 agentId;
        #     uint8 revenueTier;
        #     uint8 reputationBand;
        # }
        encoded = encode(
            ["(bytes,uint64,bytes32,uint64,uint256,uint8,uint8)"],
            [(
                proof_bytes,
                revenue_threshold,
                registered_code_hash.rjust(32, b"\x00"),
                min_reputation,
                agent_id,
                revenue_tier,
                reputation_band,
            )],
        )

        # Function selector for verifyCredit(ProofData)
        from eth_utils import keccak
        selector = keccak(
            b"verifyCredit((bytes,uint64,bytes32,uint64,uint256,uint8,uint8))"
        )[:4]

        return f"0x{selector.hex()}{encoded.hex()}"

    except ImportError:
        print("[!] eth_abi and eth_utils required for calldata generation")
        print("    Install with: pip install eth-abi eth-utils")
        return ""


# ---------------------------------------------------------------------------
# CLI (with click) or Standalone
# ---------------------------------------------------------------------------

def _do_generate(
    agent_id: int,
    revenue: int,
    code_file: Optional[str],
    reputation: int,
    revenue_threshold: int,
    min_reputation: int,
    registered_code_hash: Optional[str],
    output: str,
    skip_nargo: bool = False,
) -> int:
    """Core proof generation logic."""
    print("=" * 60)
    print("  Lenclaw ZK Credit Prover")
    print("=" * 60)
    print()

    # Load and pack code
    if code_file:
        code_path = Path(code_file)
        if not code_path.exists():
            print(f"[!] Code file not found: {code_file}")
            return 1
        code_bytes = code_path.read_bytes()
        print(f"[*] Loaded code file: {code_file} ({len(code_bytes)} bytes)")
    else:
        # Use empty code placeholder
        code_bytes = b"\x00"
        print("[*] No code file specified, using placeholder")

    code_fields, code_length = pack_code_to_fields(code_bytes)

    # Compute or use provided code hash
    if registered_code_hash:
        code_hash = registered_code_hash
    else:
        code_hash = compute_code_hash(code_fields)
        print(f"[*] Computed code hash: {code_hash}")

    # Build data structures
    agent = AgentData(
        agent_id=agent_id,
        actual_revenue=revenue,
        code_fields=code_fields,
        code_length=code_length,
        actual_reputation=reputation,
    )

    public = PublicInputs(
        revenue_threshold=revenue_threshold,
        registered_code_hash=code_hash,
        min_reputation=min_reputation,
        agent_id=agent_id,
    )

    # Pre-flight checks
    print()
    print("[*] Pre-flight checks:")
    if revenue < revenue_threshold:
        print(f"[!] FAIL: Revenue ({revenue}) < threshold ({revenue_threshold})")
        print("    The proof will fail to generate. Increase revenue or lower threshold.")
        return 1
    print(f"    Revenue check: {revenue} >= {revenue_threshold} OK")

    if reputation < min_reputation:
        print(f"[!] FAIL: Reputation ({reputation}) < minimum ({min_reputation})")
        return 1
    print(f"    Reputation check: {reputation} >= {min_reputation} OK")

    if reputation > 1000:
        print(f"[!] FAIL: Reputation ({reputation}) exceeds max (1000)")
        return 1
    print(f"    Reputation range: 0 <= {reputation} <= 1000 OK")

    revenue_tier = compute_revenue_tier(revenue)
    reputation_band = compute_reputation_band(reputation)
    print(f"    Revenue tier: {revenue_tier}")
    print(f"    Reputation band: {reputation_band}")

    # Generate Prover.toml
    print()
    toml_content = generate_prover_toml(agent, public)
    PROVER_TOML.write_text(toml_content)
    print(f"[+] Written Prover.toml to {PROVER_TOML}")

    proof_hex = ""
    proof_path = ""

    if not skip_nargo:
        # Check nargo
        if not check_nargo_installed():
            print("[!] nargo not found. Install with:")
            print("    curl -L https://raw.githubusercontent.com/noir-lang/noirup/main/install | bash")
            print("    noirup")
            print()
            print("[*] Generating Prover.toml only (use --skip-nargo to suppress this warning)")
            skip_nargo = True

    if not skip_nargo:
        # Compile and prove
        if not run_nargo_compile():
            return 1
        proof_file = run_nargo_prove()
        if not proof_file:
            return 1
        proof_hex = read_proof_file(proof_file)
        proof_path = proof_file
    else:
        print("[*] Skipping nargo (--skip-nargo). Generating placeholder proof.")
        # Generate a deterministic placeholder proof for testing
        placeholder = hashlib.sha256(
            json.dumps(asdict(agent), sort_keys=True).encode()
            + json.dumps(asdict(public), sort_keys=True).encode()
        ).hexdigest()
        # Pad to minimum proof size (608 bytes = 1216 hex chars)
        proof_hex = (placeholder * 20)[:1216]
        proof_path = "placeholder"

    # Generate output JSON
    proof_json = generate_proof_json(
        proof_hex, public, revenue_tier, reputation_band, proof_path
    )

    output_path = Path(output)
    output_path.write_text(json.dumps(proof_json, indent=2))
    print()
    print(f"[+] Proof written to {output_path}")
    print()

    # Summary
    print("=" * 60)
    print("  Proof Summary")
    print("=" * 60)
    print(f"  Agent ID:          {agent_id}")
    print(f"  Revenue Tier:      {revenue_tier} (threshold: {revenue_threshold})")
    print(f"  Reputation Band:   {reputation_band} (minimum: {min_reputation})")
    print(f"  Code Hash:         {code_hash[:20]}...")
    print(f"  Proof Size:        {len(proof_hex) // 2} bytes")
    print(f"  Output File:       {output_path}")
    print("=" * 60)

    return 0


def _do_hash_code(code_file: str) -> int:
    """Compute the code hash for a given file."""
    code_path = Path(code_file)
    if not code_path.exists():
        print(f"[!] Code file not found: {code_file}")
        return 1

    code_bytes = code_path.read_bytes()
    fields, length = pack_code_to_fields(code_bytes)
    code_hash = compute_code_hash(fields)

    print(f"Code file:   {code_file}")
    print(f"Code size:   {len(code_bytes)} bytes")
    print(f"Fields used: {length}/{MAX_CODE_FIELDS}")
    print(f"Hash:        {code_hash}")
    print()
    print("Use this hash when registering the agent in AgentRegistry.")
    print("The same SHA-256-based hash is used during proof generation")
    print("so the values will match on-chain.")

    return 0


def _do_prepare_calldata(proof_file: str) -> int:
    """Generate Solidity calldata from a proof JSON file."""
    proof_path = Path(proof_file)
    if not proof_path.exists():
        print(f"[!] Proof file not found: {proof_file}")
        return 1

    proof_json = json.loads(proof_path.read_text())
    calldata = generate_calldata(proof_json)

    if calldata:
        print(f"Calldata ({len(calldata) // 2 - 1} bytes):")
        print(calldata)
    return 0 if calldata else 1


# ---------------------------------------------------------------------------
# CLI Entry Points
# ---------------------------------------------------------------------------

if click is not None:
    @click.group()
    def cli():
        """Lenclaw ZK Credit Prover - Generate privacy-preserving credit proofs."""
        pass

    @cli.command()
    @click.option("--agent-id", required=True, type=int, help="Agent NFT ID")
    @click.option("--revenue", required=True, type=int, help="Actual revenue (USDT 6 decimals)")
    @click.option("--code-file", type=str, default=None, help="Path to agent code file")
    @click.option("--reputation", required=True, type=int, help="Actual reputation (0-1000)")
    @click.option("--revenue-threshold", required=True, type=int, help="Revenue threshold to prove")
    @click.option("--min-reputation", required=True, type=int, help="Minimum reputation to prove")
    @click.option("--registered-code-hash", type=str, default=None, help="On-chain code hash (hex)")
    @click.option("--output", default="proof.json", help="Output file path")
    @click.option("--skip-nargo", is_flag=True, help="Skip nargo and generate placeholder proof")
    def generate(agent_id, revenue, code_file, reputation, revenue_threshold,
                 min_reputation, registered_code_hash, output, skip_nargo):
        """Generate a ZK credit proof for an agent."""
        sys.exit(_do_generate(
            agent_id, revenue, code_file, reputation,
            revenue_threshold, min_reputation,
            registered_code_hash, output, skip_nargo,
        ))

    @cli.command("hash-code")
    @click.option("--code-file", required=True, type=str, help="Path to agent code file")
    def hash_code(code_file):
        """Compute the code hash for a given file."""
        sys.exit(_do_hash_code(code_file))

    @cli.command("prepare-calldata")
    @click.option("--proof-file", required=True, type=str, help="Path to proof JSON file")
    def prepare_calldata(proof_file):
        """Generate Solidity calldata from a proof JSON."""
        sys.exit(_do_prepare_calldata(proof_file))

    def main():
        cli()

else:
    # Fallback CLI without click
    def main():
        import argparse

        parser = argparse.ArgumentParser(description="Lenclaw ZK Credit Prover")
        subparsers = parser.add_subparsers(dest="command")

        # generate
        gen_parser = subparsers.add_parser("generate", help="Generate a ZK credit proof")
        gen_parser.add_argument("--agent-id", required=True, type=int)
        gen_parser.add_argument("--revenue", required=True, type=int)
        gen_parser.add_argument("--code-file", type=str, default=None)
        gen_parser.add_argument("--reputation", required=True, type=int)
        gen_parser.add_argument("--revenue-threshold", required=True, type=int)
        gen_parser.add_argument("--min-reputation", required=True, type=int)
        gen_parser.add_argument("--registered-code-hash", type=str, default=None)
        gen_parser.add_argument("--output", default="proof.json")
        gen_parser.add_argument("--skip-nargo", action="store_true")

        # hash-code
        hash_parser = subparsers.add_parser("hash-code", help="Compute code hash")
        hash_parser.add_argument("--code-file", required=True, type=str)

        # prepare-calldata
        cd_parser = subparsers.add_parser("prepare-calldata", help="Generate calldata")
        cd_parser.add_argument("--proof-file", required=True, type=str)

        args = parser.parse_args()

        if args.command == "generate":
            sys.exit(_do_generate(
                args.agent_id, args.revenue, args.code_file, args.reputation,
                args.revenue_threshold, args.min_reputation,
                args.registered_code_hash, args.output, args.skip_nargo,
            ))
        elif args.command == "hash-code":
            sys.exit(_do_hash_code(args.code_file))
        elif args.command == "prepare-calldata":
            sys.exit(_do_prepare_calldata(args.proof_file))
        else:
            parser.print_help()
            sys.exit(1)


if __name__ == "__main__":
    main()
