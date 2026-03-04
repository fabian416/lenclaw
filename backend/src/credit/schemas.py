from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, Field

from src.db.models import CreditDrawStatus


class CreditLineResponse(BaseModel):
    agent_id: uuid.UUID
    max_amount: Decimal
    used_amount: Decimal
    available_amount: Decimal
    interest_rate_bps: int
    repayment_rate_bps: int
    credit_score: int
    last_scored_at: datetime

    model_config = {"from_attributes": True}


class CreditScoreBreakdown(BaseModel):
    agent_id: uuid.UUID
    credit_score: int
    revenue_30d: Decimal
    revenue_60d: Decimal
    revenue_90d: Decimal
    consistency_score: Decimal
    reputation_score: int
    code_verified: bool
    credit_line_amount: Decimal
    interest_rate_bps: int
    repayment_rate_bps: int


class DrawRequest(BaseModel):
    amount: Decimal = Field(..., gt=0)
    tenor_days: int = Field(30, ge=7, le=90)


class DrawResponse(BaseModel):
    id: uuid.UUID
    agent_id: uuid.UUID
    amount: Decimal
    interest_rate_bps: int
    amount_due: Decimal
    status: CreditDrawStatus
    due_at: datetime
    created_at: datetime

    model_config = {"from_attributes": True}


class RepayRequest(BaseModel):
    draw_id: uuid.UUID
    amount: Decimal = Field(..., gt=0)
    tx_hash: str | None = None


class RepayResponse(BaseModel):
    draw_id: uuid.UUID
    amount_repaid: Decimal
    remaining_due: Decimal
    status: CreditDrawStatus
    fully_repaid: bool


class CreditDrawListResponse(BaseModel):
    items: list[DrawResponse]
    total_outstanding: Decimal
