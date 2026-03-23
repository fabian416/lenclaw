from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, Field


class RevenueRecordCreate(BaseModel):
    amount: Decimal = Field(..., gt=0)
    currency: str = "USDT"
    tx_hash: str | None = None
    block_number: int | None = None
    source: str | None = None


class RevenueRecordResponse(BaseModel):
    id: uuid.UUID
    agent_id: uuid.UUID
    amount: Decimal
    currency: str
    tx_hash: str | None
    block_number: int | None
    source: str | None
    recorded_at: datetime
    created_at: datetime

    model_config = {"from_attributes": True}


class RevenueHistoryResponse(BaseModel):
    agent_id: uuid.UUID
    records: list[RevenueRecordResponse]
    total_revenue: Decimal
    revenue_30d: Decimal
    revenue_60d: Decimal
    revenue_90d: Decimal


class RevenueSummary(BaseModel):
    agent_id: uuid.UUID
    total_revenue: Decimal
    revenue_30d: Decimal
    revenue_60d: Decimal
    revenue_90d: Decimal
    avg_daily_30d: Decimal
    consistency_score: Decimal
