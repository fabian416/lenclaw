/// Reputation Minimum Circuit
/// Proves that an agent's actual reputation score meets or exceeds a minimum
/// required score WITHOUT revealing the exact reputation value.
///
/// In the Lenclaw protocol, reputation scores range from 0 to 1000.
/// The AgentRegistry initializes agents at 500/1000.
///
/// Private inputs:
///   - actual_score: the agent's real reputation score (kept secret)
/// Public inputs:
///   - min_score: the minimum reputation requirement
/// Output:
///   - bool: true if actual_score >= min_score

/// Maximum reputation score in the Lenclaw protocol.
/// Matches AgentRegistry's constraint: score <= 1000.
global MAX_REPUTATION: u64 = 1000;

/// Verify that a private reputation score meets a public minimum threshold.
/// Asserts constraints in-circuit; proof generation fails if not satisfied.
pub fn verify_reputation_minimum(actual_score: u64, min_score: u64) -> bool {
    // Validate that scores are within the protocol's valid range [0, 1000]
    assert(actual_score <= MAX_REPUTATION, "Reputation score exceeds maximum (1000)");
    assert(min_score <= MAX_REPUTATION, "Minimum score exceeds maximum (1000)");

    // Core constraint: actual reputation must meet or exceed the minimum
    assert(actual_score >= min_score, "Reputation does not meet minimum requirement");

    true
}

/// Compute a reputation band (0-3) without revealing the exact score.
/// Useful for tiered access control without precise score disclosure.
///   Band 0: score < 250    ("Low")
///   Band 1: 250 <= score < 500   ("Medium")
///   Band 2: 500 <= score < 750   ("Good")
///   Band 3: score >= 750         ("Excellent")
pub fn compute_reputation_band(actual_score: u64) -> u8 {
    assert(actual_score <= MAX_REPUTATION, "Reputation score exceeds maximum (1000)");

    let mut band: u8 = 0;
    if actual_score >= 250 {
        band = 1;
    }
    if actual_score >= 500 {
        band = 2;
    }
    if actual_score >= 750 {
        band = 3;
    }
    band
}

/// Verify reputation is within a range [min_score, max_score] without revealing it.
/// This can be used to prove membership in a specific reputation tier.
pub fn verify_reputation_range(actual_score: u64, min_score: u64, max_score: u64) -> bool {
    assert(actual_score <= MAX_REPUTATION, "Score out of range");
    assert(min_score <= max_score, "Invalid range: min > max");
    assert(max_score <= MAX_REPUTATION, "Max score exceeds protocol maximum");

    assert(actual_score >= min_score, "Score below minimum");
    assert(actual_score <= max_score, "Score above maximum");

    true
}

#[test]
fn test_reputation_meets_minimum() {
    let result = verify_reputation_minimum(750, 500);
    assert(result == true);
}

#[test]
fn test_reputation_equals_minimum() {
    let result = verify_reputation_minimum(500, 500);
    assert(result == true);
}

#[test(should_fail_with = "Reputation does not meet minimum requirement")]
fn test_reputation_below_minimum() {
    let _ = verify_reputation_minimum(400, 500);
}

#[test(should_fail_with = "Reputation score exceeds maximum (1000)")]
fn test_reputation_exceeds_max() {
    let _ = verify_reputation_minimum(1001, 500);
}

#[test]
fn test_reputation_band_low() {
    let band = compute_reputation_band(100);
    assert(band == 0);
}

#[test]
fn test_reputation_band_excellent() {
    let band = compute_reputation_band(800);
    assert(band == 3);
}

#[test]
fn test_reputation_range_valid() {
    let result = verify_reputation_range(600, 500, 750);
    assert(result == true);
}

#[test(should_fail_with = "Score below minimum")]
fn test_reputation_range_below() {
    let _ = verify_reputation_range(400, 500, 750);
}
