"""
Feature engineering for ML-based credit scoring of AI agents.

Each feature function takes raw agent data (revenue history, registration info,
credit utilization, lockbox state) and extracts a single numeric feature suitable
for gradient-boosted tree models.

Feature vector order (for model input):
  0. revenue_mean_30d
  1. revenue_std_30d
  2. revenue_trend
  3. payment_consistency
  4. days_since_registration
  5. utilization_ratio
  6. max_drawdown
  7. revenue_to_debt_ratio
  8. lockbox_health_score
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from datetime import datetime, timezone
from decimal import Decimal
from typing import Sequence

import numpy as np

# Ordered list of feature names, matching the model's expected input columns.
FEATURE_NAMES: list[str] = [
    "revenue_mean_30d",
    "revenue_std_30d",
    "revenue_trend",
    "payment_consistency",
    "days_since_registration",
    "utilization_ratio",
    "max_drawdown",
    "revenue_to_debt_ratio",
    "lockbox_health_score",
]


@dataclass(frozen=True)
class AgentFeatureInput:
    """Raw data bundle passed to the feature-extraction pipeline."""

    # Daily revenue amounts for the last 90 days (most-recent first).
    daily_revenues_90d: Sequence[float]

    # Agent registration timestamp.
    registered_at: datetime

    # Current credit utilization.
    credit_max: float = 0.0
    credit_used: float = 0.0

    # Outstanding debt (sum of active draws' remaining balances).
    outstanding_debt: float = 0.0

    # Repayment history: list of (due_date, repaid_date_or_None) tuples.
    repayment_history: list[tuple[datetime, datetime | None]] = field(
        default_factory=list
    )

    # Lockbox balance and expected monthly flow-through.
    lockbox_balance: float = 0.0
    lockbox_expected_monthly: float = 0.0


# ---------------------------------------------------------------------------
# Individual feature extractors
# ---------------------------------------------------------------------------


def extract_revenue_mean_30d(inp: AgentFeatureInput) -> float:
    """Mean daily revenue over the last 30 days.

    Captures the agent's recent earning power.  A higher mean indicates
    stronger cash-flow and ability to service debt.  Uses the first 30
    entries of the daily_revenues_90d series (most-recent-first).
    """
    window = list(inp.daily_revenues_90d[:30])
    if not window:
        return 0.0
    return float(np.mean(window))


def extract_revenue_std_30d(inp: AgentFeatureInput) -> float:
    """Standard deviation of daily revenue over the last 30 days.

    Measures revenue volatility.  High std relative to mean signals
    unreliable cash-flow, increasing default risk.  Uses population
    std (ddof=0) to avoid NaN for single-element windows.
    """
    window = list(inp.daily_revenues_90d[:30])
    if len(window) < 2:
        return 0.0
    return float(np.std(window, ddof=0))


def extract_revenue_trend(inp: AgentFeatureInput) -> float:
    """Linear-regression slope of daily revenue over 90 days, normalised.

    A positive slope signals a growing agent; negative slope signals
    decline.  The value is the OLS slope of revenue vs day-index,
    divided by the mean revenue (so it represents the fractional daily
    change).  Returns 0 when there is insufficient data.
    """
    series = list(inp.daily_revenues_90d)
    n = len(series)
    if n < 7:
        return 0.0

    # Reverse so index 0 = oldest, index n-1 = most recent
    y = np.array(series[::-1], dtype=np.float64)
    x = np.arange(n, dtype=np.float64)

    mean_y = np.mean(y)
    if mean_y == 0:
        return 0.0

    # OLS slope: cov(x,y) / var(x)
    x_centered = x - np.mean(x)
    slope = np.dot(x_centered, y) / np.dot(x_centered, x_centered)
    return float(slope / mean_y)


def extract_payment_consistency(inp: AgentFeatureInput) -> float:
    """Fraction of past repayments made on or before the due date.

    Ranges from 0.0 (all late / missed) to 1.0 (perfect history).
    If no repayment history exists, returns 0.5 (neutral prior).
    """
    history = inp.repayment_history
    if not history:
        return 0.5

    on_time = 0
    total = 0
    for due_date, repaid_date in history:
        total += 1
        if repaid_date is not None and repaid_date <= due_date:
            on_time += 1
    return on_time / total if total > 0 else 0.5


def extract_days_since_registration(inp: AgentFeatureInput) -> float:
    """Number of days since the agent registered on the platform.

    Longer tenure correlates with lower default probability because the
    agent has survived market cycles.  Capped at 730 (2 years) to
    prevent extreme-tenure agents from dominating the feature.
    """
    now = datetime.now(timezone.utc)
    delta = (now - inp.registered_at).total_seconds() / 86400.0
    return min(delta, 730.0)


def extract_utilization_ratio(inp: AgentFeatureInput) -> float:
    """Current credit utilization: used / max.

    High utilization (approaching 1.0) signals stress.  Returns 0 if the
    agent has no credit line yet.
    """
    if inp.credit_max <= 0:
        return 0.0
    return min(inp.credit_used / inp.credit_max, 1.0)


def extract_max_drawdown(inp: AgentFeatureInput) -> float:
    """Maximum peak-to-trough decline in cumulative daily revenue over 90 days.

    Expressed as a fraction (0 = no drawdown, 1 = 100% loss from peak).
    Captures the worst revenue collapse the agent has experienced.
    """
    series = list(inp.daily_revenues_90d)
    if len(series) < 2:
        return 0.0

    # Walk oldest-to-newest computing running cumulative sum
    y = np.array(series[::-1], dtype=np.float64)
    cumsum = np.cumsum(y)
    peak = np.maximum.accumulate(cumsum)

    # Avoid division by zero
    with np.errstate(divide="ignore", invalid="ignore"):
        drawdowns = np.where(peak > 0, (peak - cumsum) / peak, 0.0)

    return float(np.max(drawdowns))


def extract_revenue_to_debt_ratio(inp: AgentFeatureInput) -> float:
    """Ratio of 30-day revenue to outstanding debt.

    Higher is safer -- the agent earns more than it owes.  Capped at 10
    to prevent outliers from warping the model.  Returns 10 (best) when
    debt is zero.
    """
    rev_30 = float(np.sum(inp.daily_revenues_90d[:30])) if inp.daily_revenues_90d else 0.0
    debt = inp.outstanding_debt

    if debt <= 0:
        return 10.0  # no debt is best-case
    ratio = rev_30 / debt
    return min(ratio, 10.0)


def extract_lockbox_health_score(inp: AgentFeatureInput) -> float:
    """Health score for the agent's revenue lockbox (0.0 to 1.0).

    Combines two signals:
      - balance ratio: lockbox_balance / expected monthly flow-through
        (indicates whether the lockbox is well-funded)
      - existence: whether a lockbox is configured at all

    Returns 0 when no lockbox is configured.  Returns a value between
    0 and 1 otherwise, where 1 means the lockbox balance covers at
    least one full month of expected flow-through.
    """
    expected = inp.lockbox_expected_monthly
    if expected <= 0:
        return 0.0

    ratio = inp.lockbox_balance / expected
    return float(min(ratio, 1.0))


# ---------------------------------------------------------------------------
# Extraction pipeline
# ---------------------------------------------------------------------------

# Ordered list of extractor callables -- keep in sync with FEATURE_NAMES.
_EXTRACTORS = [
    extract_revenue_mean_30d,
    extract_revenue_std_30d,
    extract_revenue_trend,
    extract_payment_consistency,
    extract_days_since_registration,
    extract_utilization_ratio,
    extract_max_drawdown,
    extract_revenue_to_debt_ratio,
    extract_lockbox_health_score,
]


def extract_features(inp: AgentFeatureInput) -> dict[str, float]:
    """Run all feature extractors and return an ordered dict.

    Returns:
        Dictionary mapping feature name -> float value, in the same
        order as FEATURE_NAMES.
    """
    return {
        name: extractor(inp)
        for name, extractor in zip(FEATURE_NAMES, _EXTRACTORS)
    }


def features_to_array(features: dict[str, float]) -> np.ndarray:
    """Convert a feature dict to a 1-D numpy array in model-input order."""
    return np.array([features[name] for name in FEATURE_NAMES], dtype=np.float64)
