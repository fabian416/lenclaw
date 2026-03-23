"""
Credit Scoring Algorithm for AI Agents.

Inputs:
  - Revenue history (30/60/90 day totals)
  - Revenue consistency score (0-100)
  - ERC-8004 reputation score (0-1000)
  - Code verification status (bool)

Outputs:
  - credit_line_amount: max credit in USDT
  - interest_rate_bps: annual interest rate in basis points
  - repayment_rate_bps: percentage of revenue auto-repaid in bps
  - credit_score: composite score (0-1000)
"""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal


@dataclass(frozen=True)
class CreditScoreInput:
    revenue_30d: Decimal
    revenue_60d: Decimal
    revenue_90d: Decimal
    consistency_score: Decimal  # 0-100
    reputation_score: int  # 0-1000
    code_verified: bool


@dataclass(frozen=True)
class CreditScoreResult:
    credit_score: int  # 0-1000
    credit_line_amount: Decimal
    interest_rate_bps: int
    repayment_rate_bps: int


# Weights for composite score
REVENUE_WEIGHT = Decimal("0.40")
CONSISTENCY_WEIGHT = Decimal("0.25")
REPUTATION_WEIGHT = Decimal("0.25")
VERIFICATION_WEIGHT = Decimal("0.10")

# Credit line multipliers based on score tiers
TIER_MULTIPLIERS = [
    (800, Decimal("3.0")),  # Excellent: 3x monthly revenue
    (600, Decimal("2.0")),  # Good: 2x
    (400, Decimal("1.0")),  # Fair: 1x
    (200, Decimal("0.5")),  # Poor: 0.5x
    (0, Decimal("0.0")),  # No credit
]

# Interest rate tiers (bps) -- lower score = higher rate
RATE_TIERS = [
    (800, 500),  # 5%
    (600, 800),  # 8%
    (400, 1200),  # 12%
    (200, 1800),  # 18%
    (0, 2500),  # 25%
]

# Repayment rate tiers (bps of revenue auto-captured)
REPAYMENT_TIERS = [
    (800, 3000),  # 30%
    (600, 4000),  # 40%
    (400, 5000),  # 50%
    (200, 6000),  # 60%
    (0, 7500),  # 75%
]

# Minimum revenue (30d) to qualify for any credit
MIN_REVENUE_30D = Decimal("100")


def compute_credit_score(inputs: CreditScoreInput) -> CreditScoreResult:
    """Compute composite credit score and resulting credit terms."""

    # Revenue score (0-1000): based on 30d revenue with diminishing returns
    # $100 -> 200, $1000 -> 500, $10000 -> 800, $50000+ -> 1000
    rev = float(inputs.revenue_30d)
    if rev <= 0:
        revenue_score = Decimal(0)
    else:
        import math

        # Logarithmic scaling: score = 200 * log10(revenue/10), capped at 1000
        raw = 200 * math.log10(max(rev, 1) / 10)
        revenue_score = Decimal(str(min(1000, max(0, raw))))

    # Consistency score: already 0-100, scale to 0-1000
    consistency_scaled = inputs.consistency_score * 10

    # Reputation: already 0-1000
    reputation_scaled = Decimal(str(inputs.reputation_score))

    # Verification bonus: 0 or 1000
    verification_scaled = Decimal(1000) if inputs.code_verified else Decimal(0)

    # Weighted composite
    composite = (
        revenue_score * REVENUE_WEIGHT
        + consistency_scaled * CONSISTENCY_WEIGHT
        + reputation_scaled * REPUTATION_WEIGHT
        + verification_scaled * VERIFICATION_WEIGHT
    )
    credit_score = int(min(1000, max(0, composite)))

    # Check minimum revenue threshold
    if inputs.revenue_30d < MIN_REVENUE_30D:
        return CreditScoreResult(
            credit_score=credit_score,
            credit_line_amount=Decimal(0),
            interest_rate_bps=0,
            repayment_rate_bps=0,
        )

    # Determine credit line from tier
    monthly_revenue = inputs.revenue_30d
    multiplier = _tier_lookup(credit_score, TIER_MULTIPLIERS)
    credit_line = (monthly_revenue * multiplier).quantize(Decimal("0.01"))

    interest_rate = _tier_lookup(credit_score, RATE_TIERS)
    repayment_rate = _tier_lookup(credit_score, REPAYMENT_TIERS)

    return CreditScoreResult(
        credit_score=credit_score,
        credit_line_amount=credit_line,
        interest_rate_bps=interest_rate,
        repayment_rate_bps=repayment_rate,
    )


def _tier_lookup(score: int, tiers: list[tuple[int, any]]) -> any:
    for threshold, value in tiers:
        if score >= threshold:
            return value
    return tiers[-1][1]
