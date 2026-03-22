"""Pydantic schemas for the bridge API."""

from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal
from enum import StrEnum

from pydantic import BaseModel, Field

# ------------------------------------------------------------------
# Enums
# ------------------------------------------------------------------


class ConnectorTypeEnum(StrEnum):
    STRIPE = "stripe"
    SQUARE = "square"
    MERCADOPAGO = "mercadopago"


class ConnectorStatusEnum(StrEnum):
    CONNECTED = "connected"
    DISCONNECTED = "disconnected"
    ERROR = "error"


# ------------------------------------------------------------------
# Request schemas
# ------------------------------------------------------------------


class ConnectRequest(BaseModel):
    """Request body for POST /bridge/connect."""

    agent_id: uuid.UUID
    connector_type: ConnectorTypeEnum
    api_key: str = Field(..., min_length=1, max_length=512)
    # Optional connector-specific fields
    location_id: str | None = None  # Square location


class DisconnectRequest(BaseModel):
    """Request body for POST /bridge/disconnect."""

    agent_id: uuid.UUID
    connector_type: ConnectorTypeEnum


# ------------------------------------------------------------------
# Response schemas
# ------------------------------------------------------------------


class ConnectorInfo(BaseModel):
    """Information about a supported connector."""

    type: ConnectorTypeEnum
    name: str
    description: str
    supported_features: list[str]


class ConnectorStatus(BaseModel):
    """Status of a connected connector for an agent."""

    agent_id: uuid.UUID
    connector_type: ConnectorTypeEnum
    status: ConnectorStatusEnum
    merchant_name: str | None = None
    merchant_id: str | None = None
    connected_at: datetime | None = None
    last_sync_at: datetime | None = None
    error_message: str | None = None


class ConnectorListResponse(BaseModel):
    """Response for GET /bridge/connectors."""

    available: list[ConnectorInfo]
    connected: list[ConnectorStatus]


class ConnectResponse(BaseModel):
    """Response for POST /bridge/connect."""

    status: ConnectorStatusEnum
    connector_type: ConnectorTypeEnum
    agent_id: uuid.UUID
    merchant_name: str | None = None
    merchant_id: str | None = None
    message: str


class BridgeTransaction(BaseModel):
    """A single normalised transaction from a connector."""

    id: str
    amount: Decimal
    currency: str
    timestamp: datetime
    source: str
    status: str = "completed"
    fee: Decimal = Decimal("0")
    net_amount: Decimal = Decimal("0")
    description: str | None = None


class BridgeRevenueReport(BaseModel):
    """Revenue report from the bridge for a specific agent."""

    agent_id: uuid.UUID
    total_revenue: Decimal = Decimal("0")
    transaction_count: int = 0
    sources: list[str] = []
    period_start: datetime | None = None
    period_end: datetime | None = None
    transactions: list[BridgeTransaction] = []
    attestation: AttestationInfo | None = None
    on_chain_total: Decimal | None = None


class AttestationInfo(BaseModel):
    """Information about a signed revenue attestation."""

    data_hash: str
    signature: str
    signer_address: str
    total_amount: Decimal
    transaction_count: int
    timestamp: float
    nonce: int


class BridgeStatusResponse(BaseModel):
    """Overall bridge status."""

    daemon_running: bool = False
    total_agents: int = 0
    total_connectors: int = 0
    last_poll_at: datetime | None = None
    connectors: list[ConnectorStatus] = []


# Resolve forward reference
BridgeRevenueReport.model_rebuild()
