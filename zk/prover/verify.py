#!/usr/bin/env python3
"""
Lenclaw ZK Credit Proof Verifier (Local)

Verifies ZK credit proofs locally without submitting to the blockchain.
This is useful for:
  - Testing proof generation before on-chain submission
  - Debugging failed proofs
  - Offline verification in development

For on-chain verification, submit the proof to ZKCreditVerifier.sol.

Usage:
    python verify.py --proof-file proof.json
    python verify.py --proof-file proof.json --verbose
    python verify.py --proof-file proof.json --nargo-verify
"""

import json
import subprocess
import sys
import hashlib
from pathlib import Path
from dataclasses import dataclass
from typing import Optional

try:
    import click
    HAS_CLICK = True
except ImportError:
    HAS_CLICK = False
    click = None

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

CIRCUITS_DIR = Path(__file__).parent.parent / "circuits"
MAX_CODE_FIELDS = 256
BN254_SCALAR_FIELD = (
    21888242871839275222246405745257275088548364400416034343698204186575808495617
)

# Revenue tier boundaries (must match circuit)
REVENUE_TIER_BOUNDS = [0, 10_000, 1_000_000, 100_000_000, 10_000_000_000]

# Reputation band boundaries (must match circuit)
REPUTATION_BAND_BOUNDS = [0, 250, 500, 750]


# ---------------------------------------------------------------------------
# Verification Result
# ---------------------------------------------------------------------------

@dataclass
class VerificationResult:
    """Result of a local proof verification."""
    valid: bool
    checks_passed: list[str]
    checks_failed: list[str]
    warnings: list[str]


# ---------------------------------------------------------------------------
# Local Verification
# ---------------------------------------------------------------------------

def verify_proof_structure(proof_json: dict) -> VerificationResult:
    """
    Verify the structural integrity of a proof JSON file.

    This performs all checks that can be done without the actual ZK verification:
      - Proof format and size
      - Public input ranges
      - Revenue tier consistency
      - Reputation band consistency
      - Field element bounds

    Args:
        proof_json: Parsed proof JSON.

    Returns:
        VerificationResult with details of all checks.
    """
    passed = []
    failed = []
    warnings = []

    # 1. Check required fields exist
    required_keys = ["proof", "publicInputs", "outputs", "metadata"]
    for key in required_keys:
        if key in proof_json:
            passed.append(f"Required field '{key}' present")
        else:
            failed.append(f"Missing required field '{key}'")

    if failed:
        return VerificationResult(False, passed, failed, warnings)

    # 2. Check proof format
    proof_hex = proof_json["proof"]
    if not isinstance(proof_hex, str):
        failed.append("Proof must be a hex string")
    elif not proof_hex.startswith("0x"):
        failed.append("Proof must start with '0x'")
    else:
        try:
            proof_bytes = bytes.fromhex(proof_hex[2:])
            proof_size = len(proof_bytes)
            passed.append(f"Proof is valid hex ({proof_size} bytes)")

            # UltraPlonk minimum proof size
            if proof_size < 608:
                failed.append(
                    f"Proof too small ({proof_size} bytes, minimum 608)"
                )
            else:
                passed.append(f"Proof size adequate ({proof_size} >= 608)")

            # Check proof is aligned to 32 bytes
            if proof_size % 32 != 0:
                warnings.append(
                    f"Proof size not aligned to 32 bytes ({proof_size} % 32 = {proof_size % 32})"
                )
            else:
                passed.append("Proof is 32-byte aligned")

        except ValueError:
            failed.append("Proof contains invalid hex characters")

    # 3. Check public inputs
    pub = proof_json["publicInputs"]

    # Revenue threshold
    rev_threshold = pub.get("revenueThreshold", -1)
    if isinstance(rev_threshold, int) and rev_threshold >= 0:
        passed.append(f"Revenue threshold: {rev_threshold}")
        if rev_threshold >= BN254_SCALAR_FIELD:
            failed.append("Revenue threshold exceeds BN254 scalar field")
    else:
        failed.append("Invalid revenue threshold")

    # Min reputation
    min_rep = pub.get("minReputation", -1)
    if isinstance(min_rep, int) and 0 <= min_rep <= 1000:
        passed.append(f"Min reputation: {min_rep} (valid range 0-1000)")
    else:
        failed.append(f"Invalid min reputation: {min_rep} (must be 0-1000)")

    # Agent ID
    agent_id = pub.get("agentId", 0)
    if isinstance(agent_id, int) and agent_id > 0:
        passed.append(f"Agent ID: {agent_id}")
    else:
        failed.append(f"Invalid agent ID: {agent_id} (must be > 0)")

    # Code hash
    code_hash = pub.get("registeredCodeHash", "")
    if isinstance(code_hash, str) and len(code_hash) > 2:
        passed.append(f"Code hash present: {code_hash[:20]}...")
    else:
        failed.append("Missing or invalid code hash")

    # 4. Check outputs
    outputs = proof_json["outputs"]

    rev_tier = outputs.get("revenueTier", -1)
    if isinstance(rev_tier, int) and 0 <= rev_tier <= 4:
        passed.append(f"Revenue tier: {rev_tier} (valid range 0-4)")

        # Cross-check: tier should be consistent with threshold
        if rev_tier > 0 and rev_threshold < REVENUE_TIER_BOUNDS[rev_tier]:
            warnings.append(
                f"Revenue tier {rev_tier} implies revenue >= {REVENUE_TIER_BOUNDS[rev_tier]}, "
                f"but threshold is only {rev_threshold}"
            )
    else:
        failed.append(f"Invalid revenue tier: {rev_tier} (must be 0-4)")

    rep_band = outputs.get("reputationBand", -1)
    if isinstance(rep_band, int) and 0 <= rep_band <= 3:
        passed.append(f"Reputation band: {rep_band} (valid range 0-3)")

        # Cross-check: band should be consistent with min_reputation
        if rep_band > 0 and min_rep < REPUTATION_BAND_BOUNDS[rep_band]:
            warnings.append(
                f"Reputation band {rep_band} implies score >= {REPUTATION_BAND_BOUNDS[rep_band]}, "
                f"but min_reputation is only {min_rep}"
            )
    else:
        failed.append(f"Invalid reputation band: {rep_band} (must be 0-3)")

    # 5. Check metadata
    meta = proof_json.get("metadata", {})
    if meta.get("proofSystem") == "UltraPlonk":
        passed.append("Proof system: UltraPlonk")
    else:
        warnings.append(
            f"Unexpected proof system: {meta.get('proofSystem', 'unknown')}"
        )

    valid = len(failed) == 0
    return VerificationResult(valid, passed, failed, warnings)


def verify_with_nargo(proof_name: str = "credit_proof") -> bool:
    """
    Verify a proof using nargo CLI.

    This performs the actual cryptographic verification using the compiled
    circuit and verification key.

    Args:
        proof_name: Name of the proof (matches the file in proofs/).

    Returns:
        True if nargo verification succeeds.
    """
    print("[*] Running nargo verify...")

    # Check nargo is available
    try:
        subprocess.run(
            ["nargo", "--version"],
            capture_output=True,
            timeout=10,
        )
    except (FileNotFoundError, subprocess.TimeoutExpired):
        print("[!] nargo not found. Install with:")
        print("    curl -L https://raw.githubusercontent.com/noir-lang/noirup/main/install | bash")
        print("    noirup")
        return False

    result = subprocess.run(
        ["nargo", "verify", "-p", proof_name],
        cwd=str(CIRCUITS_DIR),
        capture_output=True,
        text=True,
        timeout=120,
    )

    if result.returncode == 0:
        print("[+] nargo verify: PASSED")
        return True
    else:
        print(f"[!] nargo verify: FAILED")
        if result.stderr:
            print(f"    Error: {result.stderr.strip()}")
        return False


# ---------------------------------------------------------------------------
# Display
# ---------------------------------------------------------------------------

def print_verification_result(result: VerificationResult, verbose: bool = False):
    """Pretty-print the verification result."""
    print()
    print("=" * 60)
    if result.valid:
        print("  VERIFICATION: PASSED")
    else:
        print("  VERIFICATION: FAILED")
    print("=" * 60)
    print()

    if verbose or not result.valid:
        if result.checks_passed:
            print("Checks Passed:")
            for check in result.checks_passed:
                print(f"  [PASS] {check}")
            print()

    if result.checks_failed:
        print("Checks Failed:")
        for check in result.checks_failed:
            print(f"  [FAIL] {check}")
        print()

    if result.warnings:
        print("Warnings:")
        for warning in result.warnings:
            print(f"  [WARN] {warning}")
        print()

    summary_parts = [
        f"{len(result.checks_passed)} passed",
        f"{len(result.checks_failed)} failed",
        f"{len(result.warnings)} warnings",
    ]
    print(f"Summary: {', '.join(summary_parts)}")
    print()


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def _do_verify(proof_file: str, verbose: bool, nargo_verify: bool) -> int:
    """Core verification logic."""
    proof_path = Path(proof_file)
    if not proof_path.exists():
        print(f"[!] Proof file not found: {proof_file}")
        return 1

    try:
        proof_json = json.loads(proof_path.read_text())
    except json.JSONDecodeError as e:
        print(f"[!] Invalid JSON in proof file: {e}")
        return 1

    print(f"[*] Verifying proof from: {proof_file}")

    # Structural verification
    result = verify_proof_structure(proof_json)
    print_verification_result(result, verbose=verbose)

    if not result.valid:
        return 1

    # Optional nargo verification
    if nargo_verify:
        print("-" * 60)
        nargo_ok = verify_with_nargo()
        if not nargo_ok:
            return 1
        print()

    return 0


if HAS_CLICK and click is not None:
    @click.command()
    @click.option("--proof-file", required=True, type=str, help="Path to proof JSON file")
    @click.option("--verbose", "-v", is_flag=True, help="Show all check details")
    @click.option("--nargo-verify", is_flag=True, help="Also verify with nargo CLI")
    def cli(proof_file, verbose, nargo_verify):
        """Verify a Lenclaw ZK credit proof locally."""
        sys.exit(_do_verify(proof_file, verbose, nargo_verify))

    def main():
        cli()

else:
    def main():
        import argparse

        parser = argparse.ArgumentParser(
            description="Lenclaw ZK Credit Proof Verifier (Local)"
        )
        parser.add_argument("--proof-file", required=True, type=str)
        parser.add_argument("--verbose", "-v", action="store_true")
        parser.add_argument("--nargo-verify", action="store_true")

        args = parser.parse_args()
        sys.exit(_do_verify(args.proof_file, args.verbose, args.nargo_verify))


if __name__ == "__main__":
    main()
