from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from src.agent.schemas import (
    ActivateAgentRequest,
    AgentCreate,
    AgentListResponse,
    AgentResponse,
    AgentSummary,
    AgentUpdate,
)
from src.agent.service import AgentService
from src.auth.dependencies import get_current_wallet
from src.db.models import AgentStatus
from src.db.session import get_session

router = APIRouter(prefix="/agents", tags=["agents"])

_service = AgentService()


@router.get("", response_model=AgentListResponse)
async def list_agents(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    status: AgentStatus | None = None,
    session: AsyncSession = Depends(get_session),
):
    agents, total = await _service.list_agents(session, page, page_size, status)
    return AgentListResponse(
        items=[AgentResponse.model_validate(a) for a in agents],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.post("", response_model=AgentResponse, status_code=201)
async def create_agent(
    body: AgentCreate,
    session: AsyncSession = Depends(get_session),
    wallet: str = Depends(get_current_wallet),
):
    agent = await _service.create_agent(session, wallet, body.model_dump())
    return AgentResponse.model_validate(agent)


@router.get("/{agent_id}", response_model=AgentResponse)
async def get_agent(
    agent_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
):
    agent = await _service.get_agent(session, agent_id)
    return AgentResponse.model_validate(agent)


@router.patch("/{agent_id}", response_model=AgentResponse)
async def update_agent(
    agent_id: uuid.UUID,
    body: AgentUpdate,
    session: AsyncSession = Depends(get_session),
    wallet: str = Depends(get_current_wallet),
):
    agent = await _service.update_agent(
        session, agent_id, wallet, body.model_dump(exclude_unset=True)
    )
    return AgentResponse.model_validate(agent)


@router.post("/{agent_id}/activate", response_model=AgentResponse)
async def activate_agent(
    agent_id: uuid.UUID,
    body: ActivateAgentRequest,
    session: AsyncSession = Depends(get_session),
    wallet: str = Depends(get_current_wallet),
):
    agent = await _service.activate_agent(session, agent_id, wallet, body.lockbox_address)
    return AgentResponse.model_validate(agent)


@router.get("/{agent_id}/summary", response_model=AgentSummary)
async def get_agent_summary(
    agent_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
):
    data = await _service.get_agent_summary(session, agent_id)
    return AgentSummary(**data)
