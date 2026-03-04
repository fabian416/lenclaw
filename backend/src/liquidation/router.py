"""FastAPI router for the liquidation / default recovery system."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from src.db.session import get_session
from src.liquidation.models import LiquidationStatus
from src.liquidation.schemas import (
    LiquidationListResponse,
    LiquidationResponse,
    LiquidationSummary,
    LiquidationTriggerRequest,
    LiquidationTriggerResponse,
)
from src.liquidation.service import LiquidationService

router = APIRouter(prefix="/liquidations", tags=["liquidations"])

_service = LiquidationService()


@router.get("", response_model=LiquidationListResponse)
async def list_liquidations(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    status: LiquidationStatus | None = None,
    agent_id: uuid.UUID | None = None,
    session: AsyncSession = Depends(get_session),
):
    """List all liquidation events with optional filters."""
    liquidations, total = await _service.list_liquidations(
        session, page, page_size, status, agent_id
    )
    return LiquidationListResponse(
        items=[LiquidationResponse.model_validate(liq) for liq in liquidations],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/summary", response_model=LiquidationSummary)
async def get_summary(
    session: AsyncSession = Depends(get_session),
):
    """Get aggregate liquidation statistics."""
    data = await _service.get_summary(session)
    return LiquidationSummary(**data)


@router.get("/{liquidation_id}", response_model=LiquidationResponse)
async def get_liquidation(
    liquidation_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
):
    """Get a single liquidation event by ID."""
    liquidation = await _service.get_liquidation(session, liquidation_id)
    return LiquidationResponse.model_validate(liquidation)


@router.post(
    "/{liquidation_id}/trigger",
    response_model=LiquidationTriggerResponse,
)
async def trigger_liquidation(
    liquidation_id: uuid.UUID,
    body: LiquidationTriggerRequest,
    session: AsyncSession = Depends(get_session),
):
    """Trigger a pending liquidation to start the Dutch auction.

    The keeper_address identifies who is triggering the liquidation and
    will receive the keeper bounty on-chain.
    """
    liquidation = await _service.trigger_liquidation(
        session, liquidation_id, body.keeper_address
    )
    return LiquidationTriggerResponse(
        id=liquidation.id,
        status=liquidation.status,
        trigger_tx_hash=liquidation.trigger_tx_hash,
        triggered_at=liquidation.triggered_at,
        message="Liquidation triggered; Dutch auction is now active.",
    )
