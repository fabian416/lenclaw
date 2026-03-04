"""
FastAPI router for ML-based credit scoring endpoints.

Provides:
  POST /api/v1/credit/ml-score        - Score a single agent
  GET  /api/v1/credit/risk-dashboard   - Portfolio-level risk metrics
  POST /api/v1/credit/retrain          - Retrain the model (admin)
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from pathlib import Path
from typing import Any

import numpy as np
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.dependencies import get_current_wallet
from src.common.exceptions import NotFoundError
from src.credit.features import (
    FEATURE_NAMES,
    AgentFeatureInput,
    extract_features,
)
from src.credit.model import (
    CreditScoringModel,
    PredictionResult,
    TrainingMetrics,
    score_to_tier,
)
from src.db.models import (
    Agent,
    AgentStatus,
    CreditDraw,
    CreditDrawStatus,
    CreditLine,
    RevenueRecord,
)
from src.db.session import get_session

logger = logging.getLogger(__name__)

router = APIRouter(tags=["ml-credit"])

# ---------------------------------------------------------------------------
# Model singleton
# ---------------------------------------------------------------------------

MODEL_PATH = Path(__file__).resolve().parents[2] / "models" / "credit_model.joblib"

_model: CreditScoringModel | None = None


def _get_model() -> CreditScoringModel:
    """Lazily load the model from disk, or return the cached instance."""
    global _model
    if _model is not None and _model.is_trained:
        return _model

    if MODEL_PATH.exists():
        _model = CreditScoringModel.load(MODEL_PATH)
        return _model

    raise HTTPException(
        status_code=503,
        detail=(
            "ML credit-scoring model is not available. "
            "Train the model via POST /api/v1/credit/retrain first."
        ),
    )


# ---------------------------------------------------------------------------
# Request / response schemas
# ---------------------------------------------------------------------------


class MLScoreRequest(BaseModel):
    agent_id: uuid.UUID


class FeatureImportanceItem(BaseModel):
    feature: str
    importance: float


class MLScoreResponse(BaseModel):
    agent_id: uuid.UUID
    ml_score: int = Field(..., ge=0, le=1000, description="ML credit score 0-1000")
    risk_tier: str = Field(..., description="Risk tier: AAA/AA/A/BBB/BB/B/CCC")
    default_probability: float = Field(
        ..., ge=0.0, le=1.0, description="Predicted default probability"
    )
    confidence: float = Field(
        ..., ge=0.0, le=1.0, description="Model confidence in prediction"
    )
    recommended_credit_line: float = Field(
        ..., ge=0.0, description="Recommended credit line in USDC"
    )
    feature_importances: list[FeatureImportanceItem]
    features_used: dict[str, float] = Field(
        default_factory=dict, description="Extracted feature values"
    )
    scored_at: datetime


class TierDistribution(BaseModel):
    tier: str
    count: int
    percentage: float


class RiskDashboardResponse(BaseModel):
    total_agents_scored: int
    average_score: float
    median_score: float
    score_std: float
    tier_distribution: list[TierDistribution]
    predicted_default_rate: float = Field(
        ..., description="Weighted portfolio default rate"
    )
    total_credit_outstanding: float
    total_credit_limit: float
    portfolio_utilization: float
    average_revenue_30d: float
    stressed_default_rate: float = Field(
        ..., description="Default rate under 2-sigma stress scenario"
    )
    model_auc: float | None = Field(
        None, description="Model AUC-ROC from last training"
    )
    model_trained_samples: int | None = None
    generated_at: datetime


class RetrainRequest(BaseModel):
    n_samples: int = Field(2000, ge=1000, le=50000)
    seed: int = Field(42)


class RetrainResponse(BaseModel):
    status: str
    metrics: dict[str, Any]
    model_path: str
    n_samples: int


# ---------------------------------------------------------------------------
# Helpers: build AgentFeatureInput from DB
# ---------------------------------------------------------------------------


async def _build_feature_input(
    session: AsyncSession,
    agent: Agent,
) -> AgentFeatureInput:
    """Assemble an AgentFeatureInput from database records."""

    now = datetime.now(timezone.utc)
    since_90d = now - timedelta(days=90)

    # Fetch daily revenue aggregates for the last 90 days
    daily_rev_query = (
        select(
            func.date_trunc("day", RevenueRecord.recorded_at).label("day"),
            func.sum(RevenueRecord.amount).label("daily_total"),
        )
        .where(
            RevenueRecord.agent_id == agent.id,
            RevenueRecord.recorded_at >= since_90d,
        )
        .group_by(func.date_trunc("day", RevenueRecord.recorded_at))
        .order_by(func.date_trunc("day", RevenueRecord.recorded_at).desc())
    )
    daily_result = await session.execute(daily_rev_query)
    daily_rows = daily_result.all()

    # Build a 90-day array (most recent first), filling missing days with 0
    daily_map: dict[str, float] = {}
    for row in daily_rows:
        day_key = row.day.strftime("%Y-%m-%d") if row.day else ""
        daily_map[day_key] = float(row.daily_total)

    daily_revenues: list[float] = []
    for offset in range(90):
        day = (now - timedelta(days=offset)).strftime("%Y-%m-%d")
        daily_revenues.append(daily_map.get(day, 0.0))

    # Credit line info
    cl_result = await session.execute(
        select(CreditLine).where(CreditLine.agent_id == agent.id)
    )
    credit_line = cl_result.scalar_one_or_none()
    credit_max = float(credit_line.max_amount) if credit_line else 0.0
    credit_used = float(credit_line.used_amount) if credit_line else 0.0

    # Outstanding debt
    debt_result = await session.execute(
        select(
            func.coalesce(
                func.sum(CreditDraw.amount_due - CreditDraw.amount_repaid), 0
            )
        ).where(
            CreditDraw.agent_id == agent.id,
            CreditDraw.status == CreditDrawStatus.ACTIVE,
        )
    )
    outstanding_debt = float(debt_result.scalar() or 0.0)

    # Repayment history
    draws_result = await session.execute(
        select(CreditDraw).where(
            CreditDraw.agent_id == agent.id,
            CreditDraw.status.in_(
                [CreditDrawStatus.REPAID, CreditDrawStatus.ACTIVE, CreditDrawStatus.DEFAULTED]
            ),
        )
    )
    draws = draws_result.scalars().all()
    repayment_history: list[tuple[datetime, datetime | None]] = []
    for draw in draws:
        repayment_history.append((draw.due_at, draw.repaid_at))

    # Lockbox
    lockbox_balance = 0.0  # Would come from on-chain query in production
    lockbox_expected_monthly = float(sum(daily_revenues[:30])) * 0.5

    return AgentFeatureInput(
        daily_revenues_90d=daily_revenues,
        registered_at=agent.created_at,
        credit_max=credit_max,
        credit_used=credit_used,
        outstanding_debt=outstanding_debt,
        repayment_history=repayment_history,
        lockbox_balance=lockbox_balance,
        lockbox_expected_monthly=max(lockbox_expected_monthly, 1.0),
    )


# ---------------------------------------------------------------------------
# POST /api/v1/credit/ml-score
# ---------------------------------------------------------------------------


@router.post(
    "/credit/ml-score",
    response_model=MLScoreResponse,
    summary="ML credit score for an agent",
    description=(
        "Extracts behavioural features from the agent's revenue and repayment "
        "history, runs them through the XGBoost credit-scoring model, and returns "
        "a score (0-1000), risk tier, confidence, feature importances, and a "
        "recommended credit line."
    ),
)
async def ml_score_agent(
    body: MLScoreRequest,
    session: AsyncSession = Depends(get_session),
    _wallet: str = Depends(get_current_wallet),
) -> MLScoreResponse:
    model = _get_model()

    # Fetch agent
    agent_result = await session.execute(
        select(Agent).where(Agent.id == body.agent_id)
    )
    agent = agent_result.scalar_one_or_none()
    if agent is None:
        raise NotFoundError(f"Agent {body.agent_id} not found")

    if agent.status not in (AgentStatus.ACTIVE, AgentStatus.DELINQUENT):
        raise HTTPException(
            status_code=400,
            detail=f"Agent must be active or delinquent to score (current: {agent.status})",
        )

    # Build features
    feature_input = await _build_feature_input(session, agent)
    features = extract_features(feature_input)

    # Monthly revenue for credit-line sizing
    monthly_revenue = features.get("revenue_mean_30d", 0.0) * 30

    # Predict
    result: PredictionResult = model.predict(features, monthly_revenue=monthly_revenue)

    now = datetime.now(timezone.utc)

    return MLScoreResponse(
        agent_id=body.agent_id,
        ml_score=result.ml_score,
        risk_tier=result.risk_tier,
        default_probability=round(result.default_probability, 6),
        confidence=result.confidence,
        recommended_credit_line=result.recommended_credit_line,
        feature_importances=[
            FeatureImportanceItem(feature=k, importance=v)
            for k, v in result.feature_importances.items()
        ],
        features_used=features,
        scored_at=now,
    )


# ---------------------------------------------------------------------------
# GET /api/v1/credit/risk-dashboard
# ---------------------------------------------------------------------------


@router.get(
    "/credit/risk-dashboard",
    response_model=RiskDashboardResponse,
    summary="Portfolio-level risk dashboard",
    description=(
        "Aggregates credit scores, tier distribution, default predictions, "
        "utilization, and stress-test results across all scored agents."
    ),
)
async def risk_dashboard(
    session: AsyncSession = Depends(get_session),
) -> RiskDashboardResponse:
    model = _get_model()

    # Fetch all credit lines with scores
    cl_result = await session.execute(
        select(CreditLine).where(CreditLine.credit_score > 0)
    )
    credit_lines = list(cl_result.scalars().all())

    if not credit_lines:
        now = datetime.now(timezone.utc)
        return RiskDashboardResponse(
            total_agents_scored=0,
            average_score=0.0,
            median_score=0.0,
            score_std=0.0,
            tier_distribution=[],
            predicted_default_rate=0.0,
            total_credit_outstanding=0.0,
            total_credit_limit=0.0,
            portfolio_utilization=0.0,
            average_revenue_30d=0.0,
            stressed_default_rate=0.0,
            model_auc=None,
            model_trained_samples=None,
            generated_at=now,
        )

    scores = [cl.credit_score for cl in credit_lines]
    scores_arr = np.array(scores, dtype=np.float64)

    total_credit_limit = sum(float(cl.max_amount) for cl in credit_lines)
    total_credit_outstanding = sum(float(cl.used_amount) for cl in credit_lines)

    # Tier distribution
    tier_counts: dict[str, int] = {}
    for s in scores:
        tier = score_to_tier(s)
        tier_counts[tier] = tier_counts.get(tier, 0) + 1

    n_agents = len(scores)
    tier_dist = [
        TierDistribution(
            tier=tier,
            count=count,
            percentage=round(count / n_agents * 100, 2),
        )
        for tier, count in sorted(tier_counts.items())
    ]

    # Predicted default rate: simple mapping score -> default prob
    # P(default) ~ 1 - score/1000, weighted by credit outstanding
    default_probs = [(1.0 - s / 1000.0) for s in scores]
    weights = [float(cl.used_amount) for cl in credit_lines]
    total_weight = sum(weights)
    if total_weight > 0:
        predicted_default_rate = sum(
            p * w for p, w in zip(default_probs, weights)
        ) / total_weight
    else:
        predicted_default_rate = float(np.mean(default_probs))

    # Stressed scenario: shift all default probs up by 2*std
    prob_arr = np.array(default_probs)
    stress_shift = 2.0 * float(np.std(prob_arr))
    stressed_probs = np.clip(prob_arr + stress_shift, 0.0, 1.0)
    if total_weight > 0:
        stressed_default_rate = float(
            np.average(stressed_probs, weights=np.array(weights))
        )
    else:
        stressed_default_rate = float(np.mean(stressed_probs))

    # Average 30-day revenue across scored agents
    agent_ids = [cl.agent_id for cl in credit_lines]
    since_30d = datetime.now(timezone.utc) - timedelta(days=30)
    rev_result = await session.execute(
        select(func.avg(RevenueRecord.amount)).where(
            RevenueRecord.agent_id.in_(agent_ids),
            RevenueRecord.recorded_at >= since_30d,
        )
    )
    avg_rev = float(rev_result.scalar() or 0.0)

    # Model metrics
    metrics = model.training_metrics
    model_auc = metrics.auc_roc if metrics else None
    model_samples = metrics.n_train if metrics else None

    utilization = (
        total_credit_outstanding / total_credit_limit
        if total_credit_limit > 0
        else 0.0
    )

    return RiskDashboardResponse(
        total_agents_scored=n_agents,
        average_score=round(float(np.mean(scores_arr)), 2),
        median_score=round(float(np.median(scores_arr)), 2),
        score_std=round(float(np.std(scores_arr)), 2),
        tier_distribution=tier_dist,
        predicted_default_rate=round(predicted_default_rate, 6),
        total_credit_outstanding=round(total_credit_outstanding, 2),
        total_credit_limit=round(total_credit_limit, 2),
        portfolio_utilization=round(utilization, 4),
        average_revenue_30d=round(avg_rev, 2),
        stressed_default_rate=round(stressed_default_rate, 6),
        model_auc=round(model_auc, 4) if model_auc is not None else None,
        model_trained_samples=model_samples,
        generated_at=datetime.now(timezone.utc),
    )


# ---------------------------------------------------------------------------
# POST /api/v1/credit/retrain
# ---------------------------------------------------------------------------


@router.post(
    "/credit/retrain",
    response_model=RetrainResponse,
    summary="Retrain the ML credit-scoring model",
    description=(
        "Generates synthetic training data and retrains the XGBoost model. "
        "This endpoint is intended for admin use."
    ),
)
async def retrain_model(
    body: RetrainRequest,
    _wallet: str = Depends(get_current_wallet),
) -> RetrainResponse:
    global _model

    # Import here to avoid circular imports and keep startup light
    from src.credit.training_data import generate_training_dataset, split_features_labels

    logger.info(
        "Retraining ML model with n_samples=%d seed=%d",
        body.n_samples,
        body.seed,
    )

    # Generate data
    df = generate_training_dataset(n_samples=body.n_samples, seed=body.seed)
    X, y = split_features_labels(df)

    # 80/20 train-val split (stratified)
    from sklearn.model_selection import train_test_split

    X_train, X_val, y_train, y_val = train_test_split(
        X, y, test_size=0.2, random_state=body.seed, stratify=y
    )

    # Train
    new_model = CreditScoringModel()
    metrics: TrainingMetrics = new_model.train(X_train, y_train, X_val, y_val)

    # Save
    model_path = new_model.save(MODEL_PATH)

    # Hot-swap the global model
    _model = new_model

    logger.info("Model retrained and saved to %s", model_path)

    return RetrainResponse(
        status="success",
        metrics={
            "auc_roc": round(metrics.auc_roc, 4),
            "accuracy": round(metrics.accuracy, 4),
            "precision": round(metrics.precision, 4),
            "recall": round(metrics.recall, 4),
            "f1": round(metrics.f1, 4),
            "log_loss": round(metrics.log_loss_value, 4),
            "n_train": metrics.n_train,
            "n_val": metrics.n_val,
        },
        model_path=str(model_path),
        n_samples=body.n_samples,
    )
