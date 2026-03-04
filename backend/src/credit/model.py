"""
XGBoost credit-scoring model for AI agents.

Wraps an XGBClassifier that predicts default probability, then maps that
probability to a 0-1000 credit score and a letter-grade risk tier.

Usage:
    from src.credit.model import CreditScoringModel
    model = CreditScoringModel()
    model.train(X_train, y_train, X_val, y_val)
    result = model.predict(feature_dict)
    importances = model.explain(feature_dict)
    model.save("backend/models/credit_model.joblib")
    loaded = CreditScoringModel.load("backend/models/credit_model.joblib")
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import pandas as pd
import xgboost as xgb
from sklearn.calibration import CalibratedClassifierCV
from sklearn.metrics import (
    accuracy_score,
    f1_score,
    log_loss,
    precision_score,
    recall_score,
    roc_auc_score,
)
from sklearn.model_selection import StratifiedKFold

from src.credit.features import FEATURE_NAMES, features_to_array

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Risk tier definitions
# ---------------------------------------------------------------------------

RISK_TIERS: list[tuple[int, str]] = [
    (900, "AAA"),
    (800, "AA"),
    (700, "A"),
    (600, "BBB"),
    (500, "BB"),
    (400, "B"),
    (0, "CCC"),
]


def score_to_tier(score: int) -> str:
    """Map a 0-1000 credit score to a letter-grade risk tier.

    Tier thresholds:
        AAA  900+   Exceptional
        AA   800+   Excellent
        A    700+   Good
        BBB  600+   Adequate
        BB   500+   Speculative
        B    400+   Highly speculative
        CCC  <400   Distressed
    """
    for threshold, tier in RISK_TIERS:
        if score >= threshold:
            return tier
    return "CCC"


# Credit-line multiplier per tier (monthly-revenue multiple).
TIER_CREDIT_MULTIPLIERS: dict[str, float] = {
    "AAA": 5.0,
    "AA": 4.0,
    "A": 3.0,
    "BBB": 2.0,
    "BB": 1.5,
    "B": 0.75,
    "CCC": 0.0,
}


# ---------------------------------------------------------------------------
# Result containers
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class PredictionResult:
    """Output of a single credit-score prediction."""

    ml_score: int  # 0 - 1000
    risk_tier: str  # AAA .. CCC
    default_probability: float  # 0.0 - 1.0
    confidence: float  # 0.0 - 1.0 (calibrated certainty)
    recommended_credit_line: float  # USDC
    feature_importances: dict[str, float]


@dataclass(frozen=True)
class TrainingMetrics:
    """Metrics collected after model training."""

    auc_roc: float
    accuracy: float
    precision: float
    recall: float
    f1: float
    log_loss_value: float
    n_train: int
    n_val: int


# ---------------------------------------------------------------------------
# Model class
# ---------------------------------------------------------------------------

# Default XGBoost hyper-parameters tuned for credit scoring
_DEFAULT_XGB_PARAMS: dict[str, Any] = {
    "n_estimators": 300,
    "max_depth": 5,
    "learning_rate": 0.05,
    "subsample": 0.8,
    "colsample_bytree": 0.8,
    "min_child_weight": 5,
    "gamma": 0.1,
    "reg_alpha": 0.5,
    "reg_lambda": 1.0,
    "scale_pos_weight": 1.0,  # adjusted at train time
    "objective": "binary:logistic",
    "eval_metric": "auc",
    "random_state": 42,
    "n_jobs": -1,
}


class CreditScoringModel:
    """XGBoost-based credit scoring model.

    Predicts default probability for an AI agent, converts it to a
    0-1000 credit score, and maps to a risk tier.

    The model stores both the raw XGBClassifier and its feature names
    to guarantee prediction-time feature alignment.
    """

    def __init__(
        self,
        xgb_params: dict[str, Any] | None = None,
    ) -> None:
        self._params = {**_DEFAULT_XGB_PARAMS, **(xgb_params or {})}
        self._model: xgb.XGBClassifier | None = None
        self._feature_names: list[str] = list(FEATURE_NAMES)
        self._training_metrics: TrainingMetrics | None = None
        self._is_trained: bool = False

    # ------------------------------------------------------------------
    # Training
    # ------------------------------------------------------------------

    def train(
        self,
        X_train: pd.DataFrame | np.ndarray,
        y_train: pd.Series | np.ndarray,
        X_val: pd.DataFrame | np.ndarray | None = None,
        y_val: pd.Series | np.ndarray | None = None,
        early_stopping_rounds: int = 20,
    ) -> TrainingMetrics:
        """Train the XGBoost classifier on labeled data.

        Args:
            X_train: Feature matrix (n_samples, n_features).
            y_train: Binary labels (1 = default, 0 = no default).
            X_val: Optional validation feature matrix.
            y_val: Optional validation labels.
            early_stopping_rounds: Patience for early stopping.

        Returns:
            TrainingMetrics with performance on the validation set
            (or training set if no validation data provided).
        """
        X_train = self._ensure_dataframe(X_train)
        y_train = np.asarray(y_train, dtype=np.int32)

        # Handle class imbalance
        n_pos = int(np.sum(y_train == 1))
        n_neg = int(np.sum(y_train == 0))
        if n_pos > 0:
            self._params["scale_pos_weight"] = n_neg / n_pos

        self._model = xgb.XGBClassifier(**self._params)

        fit_kwargs: dict[str, Any] = {}

        if X_val is not None and y_val is not None:
            X_val = self._ensure_dataframe(X_val)
            y_val = np.asarray(y_val, dtype=np.int32)
            fit_kwargs["eval_set"] = [(X_val, y_val)]
            fit_kwargs["verbose"] = False

        self._model.fit(X_train, y_train, **fit_kwargs)
        self._is_trained = True

        # Compute metrics on validation (or training) data
        eval_X = X_val if X_val is not None else X_train
        eval_y = y_val if y_val is not None else y_train

        proba = self._model.predict_proba(eval_X)[:, 1]
        preds = (proba >= 0.5).astype(int)

        self._training_metrics = TrainingMetrics(
            auc_roc=float(roc_auc_score(eval_y, proba)),
            accuracy=float(accuracy_score(eval_y, preds)),
            precision=float(precision_score(eval_y, preds, zero_division=0)),
            recall=float(recall_score(eval_y, preds, zero_division=0)),
            f1=float(f1_score(eval_y, preds, zero_division=0)),
            log_loss_value=float(log_loss(eval_y, proba)),
            n_train=len(X_train),
            n_val=len(eval_X),
        )

        logger.info(
            "Model trained. AUC=%.4f  Acc=%.4f  F1=%.4f  (train=%d, val=%d)",
            self._training_metrics.auc_roc,
            self._training_metrics.accuracy,
            self._training_metrics.f1,
            self._training_metrics.n_train,
            self._training_metrics.n_val,
        )
        return self._training_metrics

    # ------------------------------------------------------------------
    # Prediction
    # ------------------------------------------------------------------

    def predict(
        self,
        features: dict[str, float],
        monthly_revenue: float = 0.0,
    ) -> PredictionResult:
        """Predict credit score for a single agent.

        Args:
            features: Dict mapping feature name -> float value.
            monthly_revenue: Agent's 30-day revenue for credit-line sizing.

        Returns:
            PredictionResult with score, tier, confidence, importances,
            and recommended credit line.
        """
        self._check_trained()

        arr = features_to_array(features).reshape(1, -1)
        df = pd.DataFrame(arr, columns=self._feature_names)

        default_prob = float(self._model.predict_proba(df)[0, 1])

        # Map default probability to credit score.
        # Score 1000 = 0% default prob, score 0 = 100% default prob.
        ml_score = int(round((1.0 - default_prob) * 1000))
        ml_score = max(0, min(1000, ml_score))

        risk_tier = score_to_tier(ml_score)

        # Confidence: how far from the decision boundary (0.5).
        # 1.0 when prob is 0 or 1; 0.0 when prob is exactly 0.5.
        confidence = abs(default_prob - 0.5) * 2.0

        # Recommended credit line
        multiplier = TIER_CREDIT_MULTIPLIERS.get(risk_tier, 0.0)
        if monthly_revenue <= 0:
            monthly_revenue = features.get("revenue_mean_30d", 0.0) * 30
        recommended_credit_line = monthly_revenue * multiplier

        # Feature importances (gain-based, per-prediction)
        importances = self.explain(features)

        return PredictionResult(
            ml_score=ml_score,
            risk_tier=risk_tier,
            default_probability=default_prob,
            confidence=round(confidence, 4),
            recommended_credit_line=round(recommended_credit_line, 2),
            feature_importances=importances,
        )

    def predict_batch(
        self,
        X: pd.DataFrame | np.ndarray,
    ) -> np.ndarray:
        """Predict default probabilities for a batch of agents.

        Returns:
            1-D array of default probabilities.
        """
        self._check_trained()
        X = self._ensure_dataframe(X)
        return self._model.predict_proba(X)[:, 1]

    # ------------------------------------------------------------------
    # Explainability
    # ------------------------------------------------------------------

    def explain(self, features: dict[str, float]) -> dict[str, float]:
        """Return per-feature importance for a single prediction.

        Uses the model's global gain-based feature importances (normalised
        to sum to 1.0).  For per-instance explanations, consider SHAP
        (not included to avoid the heavy dependency).

        Returns:
            Dict mapping feature name -> importance weight (0-1, sums to 1).
        """
        self._check_trained()

        raw_importances = self._model.feature_importances_
        total = float(np.sum(raw_importances))
        if total == 0:
            normalised = np.ones(len(self._feature_names)) / len(self._feature_names)
        else:
            normalised = raw_importances / total

        return {
            name: round(float(imp), 6)
            for name, imp in zip(self._feature_names, normalised)
        }

    # ------------------------------------------------------------------
    # Persistence
    # ------------------------------------------------------------------

    def save(self, path: str | Path) -> Path:
        """Save the trained model to disk via joblib.

        The serialised artifact includes the XGBClassifier, feature names,
        training metrics, and hyper-parameters so the model is fully
        self-describing.
        """
        self._check_trained()
        path = Path(path)
        path.parent.mkdir(parents=True, exist_ok=True)

        artifact = {
            "model": self._model,
            "feature_names": self._feature_names,
            "params": self._params,
            "training_metrics": self._training_metrics,
            "version": "1.0.0",
        }
        joblib.dump(artifact, path)
        logger.info("Model saved to %s", path)
        return path

    @classmethod
    def load(cls, path: str | Path) -> CreditScoringModel:
        """Load a previously saved model from disk.

        Returns:
            A fully initialised CreditScoringModel ready for prediction.
        """
        path = Path(path)
        artifact = joblib.load(path)

        instance = cls(xgb_params=artifact.get("params"))
        instance._model = artifact["model"]
        instance._feature_names = artifact["feature_names"]
        instance._training_metrics = artifact.get("training_metrics")
        instance._is_trained = True

        logger.info("Model loaded from %s (version=%s)", path, artifact.get("version"))
        return instance

    # ------------------------------------------------------------------
    # Diagnostics
    # ------------------------------------------------------------------

    @property
    def is_trained(self) -> bool:
        return self._is_trained

    @property
    def training_metrics(self) -> TrainingMetrics | None:
        return self._training_metrics

    @property
    def feature_names(self) -> list[str]:
        return list(self._feature_names)

    def get_global_importances(self) -> dict[str, float]:
        """Return global (gain-based) feature importances."""
        self._check_trained()
        raw = self._model.feature_importances_
        total = float(np.sum(raw))
        if total == 0:
            normalised = np.ones(len(self._feature_names)) / len(self._feature_names)
        else:
            normalised = raw / total
        return {
            name: round(float(v), 6)
            for name, v in zip(self._feature_names, normalised)
        }

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _check_trained(self) -> None:
        if not self._is_trained or self._model is None:
            raise RuntimeError(
                "Model has not been trained yet. Call train() or load() first."
            )

    def _ensure_dataframe(self, X: pd.DataFrame | np.ndarray) -> pd.DataFrame:
        if isinstance(X, pd.DataFrame):
            return X[self._feature_names]
        return pd.DataFrame(X, columns=self._feature_names)
