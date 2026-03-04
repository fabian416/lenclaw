from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.dependencies import get_current_wallet
from src.db.session import get_session
from src.revenue.schemas import (
    RevenueHistoryResponse,
    RevenueRecordCreate,
    RevenueRecordResponse,
    RevenueSummary,
)
from src.revenue.service import RevenueService

router = APIRouter(tags=["revenue"])

_service = RevenueService()


@router.get(
    "/agents/{agent_id}/revenue",
    response_model=RevenueHistoryResponse,
)
async def get_agent_revenue(
    agent_id: uuid.UUID,
    days: int | None = Query(None, ge=1, le=365),
    limit: int = Query(100, ge=1, le=1000),
    session: AsyncSession = Depends(get_session),
):
    records = await _service.get_revenue_history(session, agent_id, days, limit)
    summary = await _service.get_revenue_summary(session, agent_id)

    return RevenueHistoryResponse(
        agent_id=agent_id,
        records=[RevenueRecordResponse.model_validate(r) for r in records],
        total_revenue=summary["total_revenue"],
        revenue_30d=summary["revenue_30d"],
        revenue_60d=summary["revenue_60d"],
        revenue_90d=summary["revenue_90d"],
    )


@router.get(
    "/agents/{agent_id}/revenue/summary",
    response_model=RevenueSummary,
)
async def get_revenue_summary(
    agent_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
):
    data = await _service.get_revenue_summary(session, agent_id)
    return RevenueSummary(**data)


@router.post(
    "/agents/{agent_id}/revenue",
    response_model=RevenueRecordResponse,
    status_code=201,
)
async def record_revenue(
    agent_id: uuid.UUID,
    body: RevenueRecordCreate,
    session: AsyncSession = Depends(get_session),
    _wallet: str = Depends(get_current_wallet),
):
    record = await _service.record_revenue(session, agent_id, body.model_dump())
    return RevenueRecordResponse.model_validate(record)
