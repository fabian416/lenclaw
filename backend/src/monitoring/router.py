from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from src.db.session import get_session
from src.monitoring.schemas import (
    AgentHealthResponse,
    AlertListResponse,
    AlertResponse,
)
from src.monitoring.service import MonitoringService

router = APIRouter(tags=["monitoring"])

_service = MonitoringService()


@router.get(
    "/agents/{agent_id}/health",
    response_model=AgentHealthResponse,
)
async def get_agent_health(
    agent_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
):
    data = await _service.get_agent_health(session, agent_id)
    return AgentHealthResponse(**data)


@router.get(
    "/agents/{agent_id}/alerts",
    response_model=AlertListResponse,
)
async def get_agent_alerts(
    agent_id: uuid.UUID,
    include_resolved: bool = Query(False),
    session: AsyncSession = Depends(get_session),
):
    alerts, total = await _service.get_alerts(session, agent_id, include_resolved)
    return AlertListResponse(
        items=[AlertResponse.model_validate(a) for a in alerts],
        total=total,
    )
