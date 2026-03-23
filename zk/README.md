# Lenclaw ZK Credit Proof System

Privacy-preserving credit scoring for AI agents using zero-knowledge proofs.

## Overview

The ZK proof system allows AI agents to prove their creditworthiness **without revealing** sensitive data:

- **Revenue**: Prove revenue exceeds a threshold without disclosing the exact amount
- **Code Integrity**: Prove code matches a registered hash without revealing source code
- **Reputation**: Prove reputation meets a minimum without disclosing the exact score

All three proofs are combined into a single **Composite Credit Proof** that can be verified on-chain by `ZKCreditVerifier.sol`.

## Architecture

```
Agent (private data)
    |
    v
[Noir Circuits]         -- ZK constraint system
    |
    v
[Prover (prove.py)]     -- Generates proof from private inputs
    |
    v
[Proof + Public Inputs] -- Submitted on-chain
    |
    v
[ZKCreditVerifier.sol]  -- Verifies proof on-chain
    |
    v
[CreditScorer.sol]      -- Uses verification result for credit decisions
```

## Directory Structure

```
zk/
├── circuits/
│   ├── Nargo.toml                    # Noir project configuration
│   └── src/
│       ├── main.nr                   # Main circuit entry point
│       ├── revenue_threshold.nr      # Revenue >= threshold proof
│       ├── code_integrity.nr         # Code hash verification proof
│       ├── reputation_minimum.nr     # Reputation >= minimum proof
│       └── composite_credit_proof.nr # Combined credit proof
├── verifiers/
│   └── ZKCreditVerifier.sol          # On-chain Solidity verifier
├── prover/
│   ├── requirements.txt              # Python dependencies
│   ├── prove.py                      # CLI prover
│   └── verify.py                     # Local verification utility
├── tests/
│   └── test_circuits.py              # Test suite
└── README.md                         # This file
```

## Prerequisites

### Noir / Nargo

Install the Noir toolchain:

```bash
curl -L https://raw.githubusercontent.com/noir-lang/noirup/main/install | bash
noirup
```

Verify installation:

```bash
nargo --version
```

### Python Dependencies

```bash
cd zk/prover
pip install -r requirements.txt
```

## Circuit Details

### Revenue Threshold (`revenue_threshold.nr`)

| Input | Visibility | Type | Description |
|-------|-----------|------|-------------|
| `actual_revenue` | Private | `u64` | Real revenue in USDT (6 decimals) |
| `threshold` | Public | `u64` | Minimum revenue requirement |
| **Output** | Public | `bool` | True if revenue >= threshold |

Also computes a **revenue tier** (0-4) for privacy-safe disclosure.

### Code Integrity (`code_integrity.nr`)

| Input | Visibility | Type | Description |
|-------|-----------|------|-------------|
| `code_fields` | Private | `[Field; 256]` | Code bytes as field elements |
| `code_length` | Private | `u32` | Number of valid fields |
| `registered_hash` | Public | `Field` | On-chain Poseidon hash |
| **Output** | Public | `bool` | True if hashes match |

Uses Poseidon hashing (ZK-friendly) over BN254.

### Reputation Minimum (`reputation_minimum.nr`)

| Input | Visibility | Type | Description |
|-------|-----------|------|-------------|
| `actual_score` | Private | `u64` | Real reputation (0-1000) |
| `min_score` | Public | `u64` | Minimum requirement |
| **Output** | Public | `bool` | True if score >= minimum |

Also computes a **reputation band** (0-3) for tiered access.

### Composite Credit Proof (`composite_credit_proof.nr`)

Combines all three proofs. A single proof attests that:
1. Revenue meets threshold
2. Code hash matches registry
3. Reputation meets minimum

## Usage

### 1. Compile the Circuit

```bash
cd zk/circuits
nargo compile
```

### 2. Run Circuit Tests

```bash
cd zk/circuits
nargo test
```

### 3. Generate a Proof

Using the Python CLI:

```bash
cd zk/prover

# Full proof (requires nargo)
python prove.py generate \
    --agent-id 42 \
    --revenue 500000000 \
    --code-file /path/to/agent_code.py \
    --reputation 800 \
    --revenue-threshold 100000000 \
    --min-reputation 600 \
    --output proof.json

# Placeholder proof (no nargo needed, for testing)
python prove.py generate \
    --agent-id 42 \
    --revenue 500000000 \
    --reputation 800 \
    --revenue-threshold 100000000 \
    --min-reputation 600 \
    --registered-code-hash 0x1234 \
    --output proof.json \
    --skip-nargo
```

### 4. Compute Code Hash

```bash
python prove.py hash-code --code-file /path/to/agent_code.py
```

### 5. Verify Locally

```bash
# Structural verification
python verify.py --proof-file proof.json --verbose

# With nargo cryptographic verification
python verify.py --proof-file proof.json --nargo-verify
```

### 6. Generate On-Chain Calldata

```bash
python prove.py prepare-calldata --proof-file proof.json
```

### 7. Submit On-Chain

Use the calldata from step 6 to call `ZKCreditVerifier.verifyCredit()`:

```solidity
// In your script or frontend
ZKCreditVerifier verifier = ZKCreditVerifier(VERIFIER_ADDRESS);
IZKCreditVerifier.ProofData memory proofData = IZKCreditVerifier.ProofData({
    proof: proofBytes,
    revenueThreshold: 100000000,
    registeredCodeHash: codeHash,
    minReputation: 600,
    agentId: 42,
    revenueTier: 2,
    reputationBand: 3
});
bool valid = verifier.verifyCredit(proofData);
```

### 8. Generate Solidity Verifier

To generate the production UltraPlonk verifier from the compiled circuit:

```bash
cd zk/circuits
nargo compile
nargo codegen-verifier
```

Copy the generated verifier logic into `ZKCreditVerifier.sol`'s `_verifyUltraPlonkProof` function.

## Testing

### Python Tests

```bash
cd zk
python -m pytest tests/test_circuits.py -v
```

### Noir Circuit Tests

```bash
cd zk/circuits
nargo test
```

## On-Chain Integration

`ZKCreditVerifier.sol` integrates with the existing Lenclaw contracts:

- **AgentRegistry**: Validates agent identity and code hash
- **CreditScorer**: Can query `isProofValid()` or `isCreditEligible()` to gate credit decisions

The verifier stores verification results with timestamps, allowing proofs to expire (default: 7 days) and requiring periodic re-verification.

## Security Considerations

- **Private inputs are never revealed**: Revenue, code, and reputation remain private
- **Proof binding**: Each proof is bound to a specific `agent_id` to prevent replay
- **On-chain validation**: The verifier cross-checks public inputs against AgentRegistry
- **Expiry**: Proofs expire after `proofValidityPeriod` (configurable, default 7 days)
- **Field bounds**: All inputs are validated against BN254 scalar field bounds
- **Placeholder verifier**: The current `_verifyUltraPlonkProof` is a structural check. Replace with `nargo codegen-verifier` output for production.
