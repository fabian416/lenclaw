from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.dependencies import get_current_wallet
from src.credit.schemas import (
    CreditDrawListResponse,
    CreditLineResponse,
    CreditScoreBreakdown,
    DrawRequest,
    DrawResponse,
    RepayRequest,
    RepayResponse,
)
from src.credit.service import CreditService
from src.db.session import get_session

router = APIRouter(tags=["credit"])

_service = CreditService()


@router.get(
    "/agents/{agent_id}/credit",
    response_model=CreditLineResponse,
)
async def get_credit_line(
    agent_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
):
    cl = await _service.get_credit_line(session, agent_id)
    return CreditLineResponse(
        agent_id=cl.agent_id,
        max_amount=cl.max_amount,
        used_amount=cl.used_amount,
        available_amount=cl.max_amount - cl.used_amount,
        interest_rate_bps=cl.interest_rate_bps,
        repayment_rate_bps=cl.repayment_rate_bps,
        credit_score=cl.credit_score,
        last_scored_at=cl.last_scored_at,
    )


@router.post(
    "/agents/{agent_id}/credit/score",
    response_model=CreditScoreBreakdown,
)
async def score_agent(
    agent_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    _wallet: str = Depends(get_current_wallet),
):
    data = await _service.score_agent(session, agent_id)
    return CreditScoreBreakdown(**data)


@router.post(
    "/agents/{agent_id}/credit/draw",
    response_model=DrawResponse,
    status_code=201,
)
async def draw_credit(
    agent_id: uuid.UUID,
    body: DrawRequest,
    session: AsyncSession = Depends(get_session),
    _wallet: str = Depends(get_current_wallet),
):
    draw = await _service.draw_credit(session, agent_id, body.amount, body.tenor_days)
    return DrawResponse.model_validate(draw)


@router.post(
    "/agents/{agent_id}/credit/repay",
    response_model=RepayResponse,
)
async def repay_credit(
    agent_id: uuid.UUID,
    body: RepayRequest,
    session: AsyncSession = Depends(get_session),
    _wallet: str = Depends(get_current_wallet),
):
    data = await _service.repay_credit(session, agent_id, body.draw_id, body.amount)
    return RepayResponse(**data)


@router.get(
    "/agents/{agent_id}/credit/draws",
    response_model=CreditDrawListResponse,
)
async def list_draws(
    agent_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
):
    draws = await _service.get_draws(session, agent_id)
    total_outstanding = await _service.get_outstanding_total(session, agent_id)
    return CreditDrawListResponse(
        items=[DrawResponse.model_validate(d) for d in draws],
        total_outstanding=total_outstanding,
    )
