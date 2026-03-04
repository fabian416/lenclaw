"""SQLAlchemy model for fiat on/off ramp transactions."""

from __future__ import annotations

import enum
import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    DateTime,
    Enum,
    Index,
    Numeric,
    String,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from src.db.base import Base


class FiatRampType(str, enum.Enum):
    ONRAMP = "onramp"
    OFFRAMP = "offramp"


class FiatTransactionStatus(str, enum.Enum):
    CREATED = "created"
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"
    EXPIRED = "expired"
    CANCELLED = "cancelled"
    REFUNDED = "refunded"


class FiatTransaction(Base):
    __tablename__ = "fiat_transactions"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_address: Mapped[str] = mapped_column(Text, nullable=False, index=True)
    type: Mapped[FiatRampType] = mapped_column(Enum(FiatRampType), nullable=False)
    amount_fiat: Mapped[Decimal] = mapped_column(Numeric(18, 2), nullable=False)
    amount_crypto: Mapped[Decimal | None] = mapped_column(
        Numeric(18, 6), nullable=True
    )
    fiat_currency: Mapped[str] = mapped_column(String(10), nullable=False, default="USD")
    crypto_currency: Mapped[str] = mapped_column(
        String(10), nullable=False, default="USDC"
    )
    status: Mapped[FiatTransactionStatus] = mapped_column(
        Enum(FiatTransactionStatus), default=FiatTransactionStatus.CREATED
    )
    provider: Mapped[str] = mapped_column(String(50), nullable=False, default="transak")
    provider_tx_id: Mapped[str | None] = mapped_column(
        String(255), nullable=True, unique=True
    )
    provider_order_id: Mapped[str | None] = mapped_column(
        String(255), nullable=True, unique=True
    )
    network: Mapped[str] = mapped_column(String(50), nullable=False, default="base")
    wallet_address: Mapped[str | None] = mapped_column(String(42), nullable=True)
    tx_hash: Mapped[str | None] = mapped_column(String(66), nullable=True)
    failure_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
    completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    __table_args__ = (
        Index("ix_fiat_tx_user_type", "user_address", "type"),
        Index("ix_fiat_tx_status", "status"),
        Index("ix_fiat_tx_provider_order", "provider_order_id"),
    )
