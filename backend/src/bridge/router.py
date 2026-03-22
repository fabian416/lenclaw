"""Bridge API router - connector management and revenue queries."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Query

from src.auth.dependencies import get_current_wallet
from src.bridge.schemas import (
    BridgeRevenueReport,
    ConnectorListResponse,
    ConnectorStatus,
    ConnectRequest,
    ConnectResponse,
    DisconnectRequest,
)
from src.bridge.service import BridgeService

router = APIRouter(prefix="/bridge", tags=["bridge"])

_service = BridgeService()


@router.get("/connectors", response_model=ConnectorListResponse)
async def list_connectors(
    agent_id: uuid.UUID | None = Query(None),
    _wallet: str = Depends(get_current_wallet),
):
    """List available POS connectors and those connected for a given agent."""
    return await _service.list_connectors(agent_id)


@router.post("/connect", response_model=ConnectResponse, status_code=201)
async def connect_connector(
    body: ConnectRequest,
    _wallet: str = Depends(get_current_wallet),
):
    """Connect a POS payment processor to an agent."""
    extra: dict = {}
    if body.location_id:
        extra["location_id"] = body.location_id

    return await _service.connect_connector(
        agent_id=body.agent_id,
        connector_type=body.connector_type,
        api_key=body.api_key,
        **extra,
    )


@router.post("/disconnect", status_code=200)
async def disconnect_connector(
    body: DisconnectRequest,
    _wallet: str = Depends(get_current_wallet),
):
    """Disconnect a POS connector from an agent."""
    removed = await _service.disconnect_connector(body.agent_id, body.connector_type)
    return {"disconnected": removed}


@router.get("/revenue/{agent_id}", response_model=BridgeRevenueReport)
async def get_bridge_revenue(
    agent_id: uuid.UUID,
    days: int = Query(30, ge=1, le=365),
    _wallet: str = Depends(get_current_wallet),
):
    """Get aggregated revenue from all connected POS connectors for an agent."""
    return await _service.get_bridge_revenue(agent_id, days)


@router.get("/status/{agent_id}", response_model=list[ConnectorStatus])
async def get_connector_status(
    agent_id: uuid.UUID,
    _wallet: str = Depends(get_current_wallet),
):
    """Get the connection status of all connectors for an agent."""
    return await _service.get_agent_connector_status(agent_id)
