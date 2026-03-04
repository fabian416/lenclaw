from __future__ import annotations

from decimal import Decimal

from pydantic import BaseModel


class PoolStatsResponse(BaseModel):
    total_deposits: Decimal
    total_borrowed: Decimal
    utilization_rate_percent: Decimal
    active_agents: int
    total_depositors: int


class PoolAPYResponse(BaseModel):
    apy_percent: Decimal
    base_rate_bps: int
    utilization_rate_percent: Decimal
