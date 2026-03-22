"""
Synthetic training-data generator for the ML credit-scoring model.

Simulates five archetypal AI-agent revenue patterns and labels each sample
with a binary default outcome (1 = default, 0 = no default) based on
realistic heuristics tied to cash-flow health.

Revenue archetypes:
  - steady:     low-variance, constant daily revenue
  - volatile:   high-variance with random spikes/dips
  - declining:  once-healthy revenue trending downward
  - growing:    revenue increasing over time
  - seasonal:   cyclical (e.g. 7-day or 30-day period)

Usage:
    from src.credit.training_data import generate_training_dataset
    df = generate_training_dataset(n_samples=2000, seed=42)
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime, timedelta

import numpy as np
import pandas as pd

from src.credit.features import (
    FEATURE_NAMES,
    AgentFeatureInput,
    extract_features,
)

logger = logging.getLogger(__name__)

# Archetype probabilities (must sum to 1.0)
ARCHETYPE_WEIGHTS = {
    "steady": 0.30,
    "volatile": 0.15,
    "declining": 0.15,
    "growing": 0.25,
    "seasonal": 0.15,
}

# Base default rates per archetype (before feature-based adjustments)
BASE_DEFAULT_RATES = {
    "steady": 0.05,
    "volatile": 0.25,
    "declining": 0.45,
    "growing": 0.08,
    "seasonal": 0.15,
}


# ---------------------------------------------------------------------------
# Revenue generators
# ---------------------------------------------------------------------------


def _generate_steady(rng: np.random.Generator, n_days: int = 90) -> np.ndarray:
    """Steady earner: constant base with small Gaussian noise.

    Mean daily revenue ~50-500 USDC; CV < 0.2.
    """
    base = rng.uniform(50, 500)
    noise_scale = base * rng.uniform(0.03, 0.15)
    revenues = rng.normal(loc=base, scale=noise_scale, size=n_days)
    return np.maximum(revenues, 0.0)


def _generate_volatile(rng: np.random.Generator, n_days: int = 90) -> np.ndarray:
    """Volatile earner: high variance, occasional zero-revenue days.

    Uses a log-normal distribution to create fat-tailed spikes.
    """
    log_mean = rng.uniform(2.5, 5.0)  # e^2.5 ~ 12, e^5 ~ 148
    log_std = rng.uniform(0.8, 1.5)
    revenues = rng.lognormal(mean=log_mean, sigma=log_std, size=n_days)
    # Randomly zero-out some days (agent offline)
    dropout_mask = rng.random(n_days) < rng.uniform(0.05, 0.25)
    revenues[dropout_mask] = 0.0
    return revenues


def _generate_declining(rng: np.random.Generator, n_days: int = 90) -> np.ndarray:
    """Declining earner: starts strong, linearly/exponentially falls.

    Models agents losing market share or running out of tasks.
    """
    start_revenue = rng.uniform(100, 600)
    end_revenue = rng.uniform(0, start_revenue * 0.3)
    decay_type = rng.choice(["linear", "exponential"])

    if decay_type == "linear":
        trend = np.linspace(start_revenue, end_revenue, n_days)
    else:
        decay_rate = -np.log(max(end_revenue, 1) / start_revenue) / n_days
        trend = start_revenue * np.exp(-decay_rate * np.arange(n_days))

    noise = rng.normal(0, start_revenue * 0.08, size=n_days)
    return np.maximum(trend + noise, 0.0)


def _generate_growing(rng: np.random.Generator, n_days: int = 90) -> np.ndarray:
    """Growing earner: revenue trending upward over time.

    Models agents gaining adoption, compounding earnings.
    """
    start_revenue = rng.uniform(20, 150)
    growth_factor = rng.uniform(1.5, 5.0)  # total growth over 90 days
    end_revenue = start_revenue * growth_factor

    growth_type = rng.choice(["linear", "exponential"])
    if growth_type == "linear":
        trend = np.linspace(start_revenue, end_revenue, n_days)
    else:
        growth_rate = np.log(end_revenue / start_revenue) / n_days
        trend = start_revenue * np.exp(growth_rate * np.arange(n_days))

    noise = rng.normal(0, start_revenue * 0.12, size=n_days)
    return np.maximum(trend + noise, 0.0)


def _generate_seasonal(rng: np.random.Generator, n_days: int = 90) -> np.ndarray:
    """Seasonal earner: cyclical pattern with a weekly or monthly period.

    Models agents whose workload follows DeFi activity cycles (e.g.
    weekend dips, end-of-month surges).
    """
    base = rng.uniform(80, 400)
    period = rng.choice([7, 14, 30])
    amplitude = base * rng.uniform(0.2, 0.6)

    t = np.arange(n_days, dtype=np.float64)
    phase = rng.uniform(0, 2 * np.pi)
    seasonal = base + amplitude * np.sin(2 * np.pi * t / period + phase)

    noise = rng.normal(0, base * 0.08, size=n_days)
    return np.maximum(seasonal + noise, 0.0)


_GENERATORS = {
    "steady": _generate_steady,
    "volatile": _generate_volatile,
    "declining": _generate_declining,
    "growing": _generate_growing,
    "seasonal": _generate_seasonal,
}


# ---------------------------------------------------------------------------
# Default-label assignment
# ---------------------------------------------------------------------------


def _assign_default_label(
    archetype: str,
    revenues: np.ndarray,
    utilization: float,
    days_registered: float,
    rng: np.random.Generator,
) -> int:
    """Probabilistically assign a default label based on financial health.

    The base default probability comes from the archetype, then is adjusted
    by:
      - High utilization (>0.8) increases probability
      - Low recent revenue (last 14 days vs first 14 days) increases probability
      - Short tenure (<30 days) increases probability
    """
    p = BASE_DEFAULT_RATES[archetype]

    # Utilization stress
    if utilization > 0.9:
        p += 0.20
    elif utilization > 0.7:
        p += 0.10

    # Revenue collapse: compare last 14 days to first 14 days
    if len(revenues) >= 28:
        recent = float(np.mean(revenues[-14:]))
        earlier = float(np.mean(revenues[:14]))
        if earlier > 0 and recent / earlier < 0.3:
            p += 0.15
        elif earlier > 0 and recent / earlier < 0.5:
            p += 0.08

    # New agents are riskier
    if days_registered < 30:
        p += 0.10
    elif days_registered < 60:
        p += 0.05

    # Low absolute revenue
    mean_rev = float(np.mean(revenues)) if len(revenues) > 0 else 0.0
    if mean_rev < 20:
        p += 0.15
    elif mean_rev < 50:
        p += 0.05

    p = max(0.0, min(p, 0.95))
    return int(rng.random() < p)


# ---------------------------------------------------------------------------
# Synthetic sample generator
# ---------------------------------------------------------------------------


def _generate_single_sample(
    rng: np.random.Generator,
    archetype: str,
    now: datetime,
) -> dict:
    """Generate one training sample with features and label."""

    # Revenue time series (90 days, most-recent-first is what features expect
    # but generators produce oldest-first, so we reverse after generation)
    revenues_oldest_first = _GENERATORS[archetype](rng, n_days=90)
    # AgentFeatureInput expects most-recent-first
    revenues_recent_first = revenues_oldest_first[::-1].tolist()

    # Random agent metadata
    days_registered = float(rng.uniform(7, 600))
    registered_at = now - timedelta(days=days_registered)

    # Credit utilization
    credit_max = float(rng.uniform(500, 50_000))
    utilization = float(rng.uniform(0.0, 0.95))
    credit_used = credit_max * utilization

    # Outstanding debt
    outstanding_debt = credit_used * float(rng.uniform(0.5, 1.2))

    # Repayment history
    n_repayments = int(rng.integers(0, 15))
    repayment_history: list[tuple[datetime, datetime | None]] = []
    for _ in range(n_repayments):
        due_offset = float(rng.uniform(10, 300))
        due_date = now - timedelta(days=due_offset)
        # Probability of on-time repayment varies by archetype
        on_time_prob = {
            "steady": 0.92,
            "volatile": 0.60,
            "declining": 0.45,
            "growing": 0.85,
            "seasonal": 0.75,
        }[archetype]

        if rng.random() < on_time_prob:
            # Repaid on time (0-2 days before due)
            repaid_date = due_date - timedelta(days=float(rng.uniform(0, 2)))
        elif rng.random() < 0.7:
            # Repaid late
            repaid_date = due_date + timedelta(days=float(rng.uniform(1, 30)))
        else:
            # Never repaid
            repaid_date = None
        repayment_history.append((due_date, repaid_date))

    # Lockbox
    lockbox_balance = float(rng.uniform(0, 5000))
    lockbox_expected_monthly = float(np.sum(revenues_oldest_first[:30])) * float(
        rng.uniform(0.3, 0.7)
    )

    # Build feature input
    feature_input = AgentFeatureInput(
        daily_revenues_90d=revenues_recent_first,
        registered_at=registered_at,
        credit_max=credit_max,
        credit_used=credit_used,
        outstanding_debt=outstanding_debt,
        repayment_history=repayment_history,
        lockbox_balance=lockbox_balance,
        lockbox_expected_monthly=max(lockbox_expected_monthly, 1.0),
    )

    features = extract_features(feature_input)

    # Assign label
    label = _assign_default_label(
        archetype, revenues_oldest_first, utilization, days_registered, rng
    )

    return {**features, "archetype": archetype, "defaulted": label}


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def generate_training_dataset(
    n_samples: int = 2000,
    seed: int = 42,
) -> pd.DataFrame:
    """Generate a synthetic labeled dataset for credit-model training.

    Args:
        n_samples: Number of samples to generate (minimum 1000).
        seed: Random seed for reproducibility.

    Returns:
        DataFrame with columns = FEATURE_NAMES + ["archetype", "defaulted"].
        ``defaulted`` is 1 for default, 0 for no-default.
    """
    n_samples = max(n_samples, 1000)
    rng = np.random.default_rng(seed)
    now = datetime.now(UTC)

    archetypes = list(ARCHETYPE_WEIGHTS.keys())
    weights = [ARCHETYPE_WEIGHTS[a] for a in archetypes]
    chosen_archetypes = rng.choice(archetypes, size=n_samples, p=weights)

    rows: list[dict] = []
    for i, archetype in enumerate(chosen_archetypes):
        try:
            sample = _generate_single_sample(rng, archetype, now)
            rows.append(sample)
        except Exception:
            logger.warning("Failed to generate sample %d (archetype=%s)", i, archetype)
            continue

    df = pd.DataFrame(rows)
    logger.info(
        "Generated %d training samples. Default rate: %.2f%%",
        len(df),
        df["defaulted"].mean() * 100,
    )
    return df


def split_features_labels(
    df: pd.DataFrame,
) -> tuple[pd.DataFrame, pd.Series]:
    """Split a training DataFrame into feature matrix X and label vector y.

    Returns:
        (X, y) where X has columns = FEATURE_NAMES, y = 'defaulted' Series.
    """
    X = df[FEATURE_NAMES].copy()
    y = df["defaulted"].copy()
    return X, y
