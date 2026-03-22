/// Composite Credit Proof Circuit
/// Combines all three ZK proofs (revenue threshold, code integrity, reputation minimum)
/// into a single proof that verifies an agent's overall creditworthiness.
///
/// This is the main circuit that lenders and the CreditScorer contract interact with.
/// A single proof attests to ALL of the following:
///   1. Revenue >= threshold (without revealing exact revenue)
///   2. Code hash matches registered hash (without revealing code)
///   3. Reputation >= minimum (without revealing exact score)
///
/// Private inputs:
///   - actual_revenue: real revenue amount
///   - code_fields: code bytes packed into field elements
///   - code_length: number of valid code field elements
///   - actual_reputation: real reputation score
/// Public inputs:
///   - revenue_threshold: minimum required revenue
///   - registered_code_hash: on-chain code hash from AgentRegistry
///   - min_reputation: minimum required reputation score
///   - agent_id: the agent's NFT ID (for binding the proof to a specific agent)
/// Output:
///   - credit_eligible: bool indicating the agent passes all checks

use crate::revenue_threshold;
use crate::code_integrity;
use crate::reputation_minimum;

/// The composite credit proof struct containing all verification results.
/// This is returned to provide structured output from the circuit.
pub struct CreditProofResult {
    pub revenue_ok: bool,
    pub code_ok: bool,
    pub reputation_ok: bool,
    pub revenue_tier: u8,
    pub reputation_band: u8,
    pub eligible: bool,
}

/// Generate a composite credit proof that verifies all three conditions.
///
/// This function is the core of the Lenclaw ZK credit system. It takes
/// all private agent data and public thresholds, verifies each condition,
/// and returns a composite result.
///
/// The proof binds to a specific agent_id to prevent proof replay attacks
/// (i.e., Agent A cannot use Agent B's proof).
pub fn verify_composite_credit(
    // Private inputs (hidden from verifier)
    actual_revenue: u64,
    code_fields: [Field; 256],
    code_length: u32,
    actual_reputation: u64,
    // Public inputs (visible to verifier)
    revenue_threshold_value: u64,
    registered_code_hash: Field,
    min_reputation: u64,
    agent_id: Field,
) -> CreditProofResult {
    // Ensure agent_id is non-zero (valid agent)
    assert(agent_id != 0, "Agent ID must be non-zero");

    // 1. Verify revenue threshold
    let revenue_ok = revenue_threshold::verify_revenue_threshold(
        actual_revenue,
        revenue_threshold_value,
    );

    // 2. Verify code integrity
    let code_ok = code_integrity::verify_code_integrity(
        code_fields,
        code_length,
        registered_code_hash,
    );

    // 3. Verify reputation minimum
    let reputation_ok = reputation_minimum::verify_reputation_minimum(
        actual_reputation,
        min_reputation,
    );

    // Compute disclosure-safe tiers
    let revenue_tier = revenue_threshold::compute_revenue_tier(actual_revenue);
    let reputation_band = reputation_minimum::compute_reputation_band(actual_reputation);

    // All three must pass for eligibility
    let eligible = revenue_ok & code_ok & reputation_ok;

    CreditProofResult {
        revenue_ok,
        code_ok,
        reputation_ok,
        revenue_tier,
        reputation_band,
        eligible,
    }
}

/// Simplified composite check that only returns a boolean.
/// Used as the main entry point for on-chain verification.
pub fn is_credit_eligible(
    actual_revenue: u64,
    code_fields: [Field; 256],
    code_length: u32,
    actual_reputation: u64,
    revenue_threshold_value: u64,
    registered_code_hash: Field,
    min_reputation: u64,
    agent_id: Field,
) -> bool {
    let result = verify_composite_credit(
        actual_revenue,
        code_fields,
        code_length,
        actual_reputation,
        revenue_threshold_value,
        registered_code_hash,
        min_reputation,
        agent_id,
    );
    result.eligible
}

#[test]
fn test_composite_credit_eligible() {
    // Setup: create valid code and compute its hash
    let mut code: [Field; 256] = [0; 256];
    code[0] = 0x48;
    code[1] = 0x65;
    code[2] = 0x6c;
    code[3] = 0x6c;
    code[4] = 0x6f;
    let code_hash = code_integrity::compute_code_hash(code);

    let result = verify_composite_credit(
        100_000_000,    // 100 USDC revenue (6 decimals)
        code,
        5,
        750,            // reputation 750/1000
        50_000_000,     // threshold: 50 USDC
        code_hash,
        500,            // min reputation: 500
        1,              // agent_id: 1
    );

    assert(result.eligible == true);
    assert(result.revenue_ok == true);
    assert(result.code_ok == true);
    assert(result.reputation_ok == true);
    assert(result.revenue_tier == 2);     // 100M >= 1M tier
    assert(result.reputation_band == 3);  // 750 >= 750 excellent
}

#[test(should_fail_with = "Revenue does not meet threshold")]
fn test_composite_revenue_fail() {
    let mut code: [Field; 256] = [0; 256];
    code[0] = 0x48;
    let code_hash = code_integrity::compute_code_hash(code);

    let _ = verify_composite_credit(
        10_000,         // too low
        code,
        1,
        750,
        50_000_000,     // threshold way higher
        code_hash,
        500,
        1,
    );
}

#[test(should_fail_with = "Reputation does not meet minimum requirement")]
fn test_composite_reputation_fail() {
    let mut code: [Field; 256] = [0; 256];
    code[0] = 0x48;
    let code_hash = code_integrity::compute_code_hash(code);

    let _ = verify_composite_credit(
        100_000_000,
        code,
        1,
        200,            // too low
        50_000_000,
        code_hash,
        500,            // min is 500
        1,
    );
}
