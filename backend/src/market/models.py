"""SQLAlchemy models for the secondary tranche market."""

from __future__ import annotations

import enum
import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    DateTime,
    Enum,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from src.db.base import Base


class MarketListingStatus(str, enum.Enum):
    ACTIVE = "active"
    SOLD = "sold"
    CANCELLED = "cancelled"


class MarketTrancheType(str, enum.Enum):
    SENIOR = "senior"
    JUNIOR = "junior"


class MarketListing(Base):
    """On-chain listing indexed from TrancheMarket events."""

    __tablename__ = "market_listings"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    chain_listing_id: Mapped[int] = mapped_column(
        Integer, unique=True, nullable=False, index=True
    )
    seller_address: Mapped[str] = mapped_column(Text, nullable=False, index=True)
    tranche: Mapped[MarketTrancheType] = mapped_column(
        Enum(MarketTrancheType), nullable=False
    )
    shares: Mapped[Decimal] = mapped_column(Numeric(18, 6), nullable=False)
    price_per_share: Mapped[Decimal] = mapped_column(Numeric(18, 6), nullable=False)
    total_price: Mapped[Decimal] = mapped_column(Numeric(18, 6), nullable=False)
    status: Mapped[MarketListingStatus] = mapped_column(
        Enum(MarketListingStatus), default=MarketListingStatus.ACTIVE
    )
    tx_hash: Mapped[str | None] = mapped_column(String(66), nullable=True)
    block_number: Mapped[int | None] = mapped_column(Integer, nullable=True)
    listed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    __table_args__ = (
        Index("ix_market_listings_status_tranche", "status", "tranche"),
        Index("ix_market_listings_seller_status", "seller_address", "status"),
    )


class MarketTrade(Base):
    """Completed trade indexed from TrancheMarket Bought events."""

    __tablename__ = "market_trades"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    chain_listing_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    buyer_address: Mapped[str] = mapped_column(Text, nullable=False, index=True)
    seller_address: Mapped[str] = mapped_column(Text, nullable=False, index=True)
    tranche: Mapped[MarketTrancheType] = mapped_column(
        Enum(MarketTrancheType), nullable=False
    )
    shares: Mapped[Decimal] = mapped_column(Numeric(18, 6), nullable=False)
    total_price: Mapped[Decimal] = mapped_column(Numeric(18, 6), nullable=False)
    fee: Mapped[Decimal] = mapped_column(Numeric(18, 6), nullable=False)
    tx_hash: Mapped[str | None] = mapped_column(String(66), nullable=True)
    block_number: Mapped[int | None] = mapped_column(Integer, nullable=True)
    traded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    __table_args__ = (
        Index("ix_market_trades_traded_at", "traded_at"),
    )
