"""SQLAlchemy models for the liquidation / recovery system."""

from __future__ import annotations

import enum
import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    DateTime,
    Enum,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from src.db.base import Base


# ---------- Enums ---------- #


class LiquidationStatus(str, enum.Enum):
    """Tracks the lifecycle of a liquidation event."""

    PENDING = "pending"            # Detected but not yet triggered
    AUCTION_ACTIVE = "auction_active"  # Dutch auction is running
    SETTLED = "settled"            # Auction settled, proceeds distributed
    EXPIRED = "expired"            # Auction expired with no bidder
    WRITE_OFF = "write_off"        # Full write-off, no recovery


class AuctionStatus(str, enum.Enum):
    ACTIVE = "active"
    SETTLED = "settled"
    EXPIRED = "expired"


class RecoveryOutcome(str, enum.Enum):
    FULL = "full"
    PARTIAL = "partial"
    NONE = "none"


# ---------- Liquidation ---------- #


class Liquidation(Base):
    """Root record for a liquidation event on a defaulted agent."""

    __tablename__ = "liquidations"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    agent_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("agents.id"), nullable=False
    )
    on_chain_agent_id: Mapped[int | None] = mapped_column(
        Integer, nullable=True, comment="On-chain agent NFT ID"
    )
    outstanding_debt: Mapped[Decimal] = mapped_column(
        Numeric(18, 6), nullable=False
    )
    recovered_amount: Mapped[Decimal] = mapped_column(
        Numeric(18, 6), default=Decimal("0")
    )
    loss_amount: Mapped[Decimal] = mapped_column(
        Numeric(18, 6), default=Decimal("0")
    )
    junior_loss: Mapped[Decimal] = mapped_column(
        Numeric(18, 6), default=Decimal("0")
    )
    senior_loss: Mapped[Decimal] = mapped_column(
        Numeric(18, 6), default=Decimal("0")
    )
    recovery_rate_bps: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[LiquidationStatus] = mapped_column(
        Enum(LiquidationStatus), default=LiquidationStatus.PENDING
    )
    trigger_tx_hash: Mapped[str | None] = mapped_column(
        String(66), nullable=True
    )
    settle_tx_hash: Mapped[str | None] = mapped_column(
        String(66), nullable=True
    )
    triggered_by: Mapped[str | None] = mapped_column(
        Text, nullable=True, comment="Keeper wallet address"
    )
    triggered_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    settled_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    # Relationships
    auction: Mapped[LiquidationAuction | None] = relationship(
        back_populates="liquidation", uselist=False, cascade="all, delete-orphan"
    )

    __table_args__ = (
        Index("ix_liquidations_agent_status", "agent_id", "status"),
        Index("ix_liquidations_status", "status"),
    )


# ---------- Auction ---------- #


class LiquidationAuction(Base):
    """Tracks the Dutch auction associated with a liquidation event."""

    __tablename__ = "liquidation_auctions"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    liquidation_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("liquidations.id"),
        unique=True,
        nullable=False,
    )
    on_chain_auction_id: Mapped[int | None] = mapped_column(
        Integer, nullable=True
    )
    start_price: Mapped[Decimal] = mapped_column(
        Numeric(18, 6), nullable=False
    )
    min_price: Mapped[Decimal] = mapped_column(
        Numeric(18, 6), nullable=False
    )
    settled_price: Mapped[Decimal | None] = mapped_column(
        Numeric(18, 6), nullable=True
    )
    duration_seconds: Mapped[int] = mapped_column(
        Integer, nullable=False, default=21600  # 6 hours
    )
    buyer_address: Mapped[str | None] = mapped_column(
        String(42), nullable=True
    )
    status: Mapped[AuctionStatus] = mapped_column(
        Enum(AuctionStatus), default=AuctionStatus.ACTIVE
    )
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    settled_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    liquidation: Mapped[Liquidation] = relationship(
        back_populates="auction"
    )
