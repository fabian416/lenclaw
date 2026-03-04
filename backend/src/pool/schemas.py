from __future__ import annotations

from decimal import Decimal

from pydantic import BaseModel


class PoolStatsResponse(BaseModel):
    total_deposits: Decimal
    total_borrowed: Decimal
    senior_tvl: Decimal
    junior_tvl: Decimal
    utilization_rate_percent: Decimal
    active_agents: int
    total_depositors: int


class PoolAPYResponse(BaseModel):
    senior_apy_percent: Decimal
    junior_apy_percent: Decimal
    base_rate_bps: int
    utilization_rate_percent: Decimal


class TrancheStats(BaseModel):
    tranche: str
    tvl: Decimal
    depositor_count: int
    apy_percent: Decimal
