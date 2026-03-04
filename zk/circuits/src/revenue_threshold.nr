/// Revenue Threshold Circuit
/// Proves that an agent's actual revenue meets or exceeds a given threshold
/// WITHOUT revealing the exact revenue amount.
///
/// Private inputs:
///   - actual_revenue: the real revenue value (kept secret)
/// Public inputs:
///   - threshold: the minimum revenue requirement
/// Output:
///   - bool: true if actual_revenue >= threshold

/// Verify that a private revenue amount meets a public threshold.
/// Asserts the constraint inside the circuit (proof is invalid if not met).
/// Returns true on success (the assertion guarantees correctness).
pub fn verify_revenue_threshold(actual_revenue: u64, threshold: u64) -> bool {
    // Core constraint: actual revenue must be >= the threshold.
    // If this assertion fails, the proof cannot be generated.
    assert(actual_revenue >= threshold, "Revenue does not meet threshold");

    // Overflow / sanity check: revenue must be within a reasonable u64 range.
    // This prevents malicious provers from using wrapped arithmetic.
    // Max revenue: ~18.4 quintillion (u64 max), but we cap at 1 trillion (1e12)
    // to represent realistic USDC amounts (6 decimals => 1e12 = 1,000,000 USDC).
    let max_revenue: u64 = 1_000_000_000_000; // 1 trillion = 1M USDC in 6-decimal
    assert(actual_revenue <= max_revenue, "Revenue exceeds maximum allowed value");
    assert(threshold <= max_revenue, "Threshold exceeds maximum allowed value");

    true
}

/// Compute a revenue tier (0-4) without revealing the exact amount.
/// Useful for interest rate determination without precise revenue disclosure.
///   Tier 0: revenue < 10,000      (< 0.01 USDC)
///   Tier 1: 10,000 <= revenue < 1,000,000     (< 1 USDC)
///   Tier 2: 1,000,000 <= revenue < 100,000,000   (< 100 USDC)
///   Tier 3: 100,000,000 <= revenue < 10,000,000,000 (< 10,000 USDC)
///   Tier 4: revenue >= 10,000,000,000   (>= 10,000 USDC)
pub fn compute_revenue_tier(actual_revenue: u64) -> u8 {
    let mut tier: u8 = 0;
    if actual_revenue >= 10_000 {
        tier = 1;
    }
    if actual_revenue >= 1_000_000 {
        tier = 2;
    }
    if actual_revenue >= 100_000_000 {
        tier = 3;
    }
    if actual_revenue >= 10_000_000_000 {
        tier = 4;
    }
    tier
}

#[test]
fn test_revenue_meets_threshold() {
    let result = verify_revenue_threshold(1000, 500);
    assert(result == true);
}

#[test]
fn test_revenue_equals_threshold() {
    let result = verify_revenue_threshold(500, 500);
    assert(result == true);
}

#[test(should_fail_with = "Revenue does not meet threshold")]
fn test_revenue_below_threshold() {
    let _ = verify_revenue_threshold(499, 500);
}

#[test]
fn test_revenue_tier_zero() {
    let tier = compute_revenue_tier(5000);
    assert(tier == 0);
}

#[test]
fn test_revenue_tier_four() {
    let tier = compute_revenue_tier(10_000_000_000);
    assert(tier == 4);
}
