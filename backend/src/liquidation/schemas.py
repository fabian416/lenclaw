"""Pydantic schemas for the liquidation API."""

from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, Field

from src.liquidation.models import AuctionStatus, LiquidationStatus


# ---------- Auction Schemas ---------- #


class AuctionResponse(BaseModel):
    id: uuid.UUID
    liquidation_id: uuid.UUID
    on_chain_auction_id: int | None
    start_price: Decimal
    min_price: Decimal
    settled_price: Decimal | None
    duration_seconds: int
    buyer_address: str | None
    status: AuctionStatus
    started_at: datetime
    settled_at: datetime | None
    created_at: datetime

    model_config = {"from_attributes": True}


# ---------- Liquidation Schemas ---------- #


class LiquidationResponse(BaseModel):
    id: uuid.UUID
    agent_id: uuid.UUID
    on_chain_agent_id: int | None
    outstanding_debt: Decimal
    recovered_amount: Decimal
    loss_amount: Decimal
    junior_loss: Decimal
    senior_loss: Decimal
    recovery_rate_bps: int
    status: LiquidationStatus
    trigger_tx_hash: str | None
    settle_tx_hash: str | None
    triggered_by: str | None
    triggered_at: datetime | None
    settled_at: datetime | None
    created_at: datetime
    updated_at: datetime
    auction: AuctionResponse | None = None

    model_config = {"from_attributes": True}


class LiquidationListResponse(BaseModel):
    items: list[LiquidationResponse]
    total: int
    page: int
    page_size: int


class LiquidationTriggerRequest(BaseModel):
    """Request body for POST /liquidations/{id}/trigger."""

    keeper_address: str = Field(
        ...,
        min_length=42,
        max_length=42,
        description="Wallet address of the keeper triggering liquidation",
    )


class LiquidationTriggerResponse(BaseModel):
    id: uuid.UUID
    status: LiquidationStatus
    trigger_tx_hash: str | None
    triggered_at: datetime | None
    message: str


class LiquidationSummary(BaseModel):
    """Aggregate statistics for the liquidation system."""

    total_liquidations: int = 0
    active_auctions: int = 0
    total_debt_processed: Decimal = Decimal("0")
    total_recovered: Decimal = Decimal("0")
    total_losses: Decimal = Decimal("0")
    overall_recovery_rate_bps: int = 0
