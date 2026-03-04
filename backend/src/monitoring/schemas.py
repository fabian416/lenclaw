from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel

from src.db.models import AlertSeverity


class AgentHealthResponse(BaseModel):
    agent_id: uuid.UUID
    agent_name: str
    status: str
    lockbox_address: str | None
    revenue_30d: Decimal
    revenue_trend: str  # "up", "down", "stable"
    credit_utilization_percent: Decimal
    outstanding_debt: Decimal
    days_until_next_due: int | None
    alert_count: int


class AlertResponse(BaseModel):
    id: uuid.UUID
    agent_id: uuid.UUID
    severity: AlertSeverity
    title: str
    message: str
    resolved: bool
    resolved_at: datetime | None
    created_at: datetime

    model_config = {"from_attributes": True}


class AlertListResponse(BaseModel):
    items: list[AlertResponse]
    total: int
