/// Lenclaw ZK Credit Proof - Main Circuit Entry Point
///
/// This is the top-level circuit that Nargo compiles. It wires together
/// the composite credit proof with explicit public/private input annotations.
///
/// The circuit proves that an AI agent is creditworthy by verifying:
///   1. Revenue >= threshold (privacy-preserving)
///   2. Code hash matches registered hash (privacy-preserving)
///   3. Reputation >= minimum (privacy-preserving)
///
/// Usage:
///   nargo prove    -- generates the proof
///   nargo verify   -- verifies the proof
///   nargo codegen-verifier -- generates Solidity verifier

mod revenue_threshold;
mod code_integrity;
mod reputation_minimum;
mod composite_credit_proof;

use crate::composite_credit_proof::CreditProofResult;

/// Main circuit entry point.
///
/// Private witness inputs (known only to the prover / agent):
///   - actual_revenue: the agent's real revenue in USDC (6 decimals)
///   - code_fields: the agent's source code packed into 256 field elements
///   - code_length: number of valid field elements in code_fields
///   - actual_reputation: the agent's real reputation score (0-1000)
///
/// Public inputs (visible on-chain to the verifier):
///   - revenue_threshold: minimum revenue required
///   - registered_code_hash: Poseidon hash of code stored in AgentRegistry
///   - min_reputation: minimum reputation score required
///   - agent_id: the agent's NFT ID (prevents proof replay)
///
/// Public outputs (returned by the circuit, visible to verifier):
///   - revenue_tier: privacy-safe revenue band (0-4)
///   - reputation_band: privacy-safe reputation band (0-3)
fn main(
    // Private inputs
    actual_revenue: u64,
    code_fields: [Field; 256],
    code_length: u32,
    actual_reputation: u64,
    // Public inputs
    revenue_threshold: pub u64,
    registered_code_hash: pub Field,
    min_reputation: pub u64,
    agent_id: pub Field,
) -> pub (u8, u8) {
    // Run the composite credit verification
    let result: CreditProofResult = composite_credit_proof::verify_composite_credit(
        actual_revenue,
        code_fields,
        code_length,
        actual_reputation,
        revenue_threshold,
        registered_code_hash,
        min_reputation,
        agent_id,
    );

    // The circuit will only produce a valid proof if all checks pass.
    // The assertions inside each sub-circuit ensure this.
    assert(result.eligible == true, "Agent is not credit eligible");

    // Return privacy-safe tiers as public outputs
    (result.revenue_tier, result.reputation_band)
}

#[test]
fn test_main_valid_proof() {
    // Create test code
    let mut code: [Field; 256] = [0; 256];
    code[0] = 0x48; // 'H'
    code[1] = 0x65; // 'e'
    code[2] = 0x6c; // 'l'
    code[3] = 0x6c; // 'l'
    code[4] = 0x6f; // 'o'

    // Compute expected hash
    let code_hash = code_integrity::compute_code_hash(code);

    // Run the main circuit
    let (rev_tier, rep_band) = main(
        500_000_000,     // 500 USDC revenue
        code,
        5,
        800,             // 800/1000 reputation
        100_000_000,     // 100 USDC threshold
        code_hash,
        600,             // min 600 reputation
        42,              // agent #42
    );

    // Revenue 500M is tier 2 (>= 100M)
    assert(rev_tier == 2);
    // Reputation 800 is band 3 (>= 750)
    assert(rep_band == 3);
}
