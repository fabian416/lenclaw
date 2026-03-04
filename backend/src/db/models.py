"""SQLAlchemy models for Lenclaw AI Agent Lending Protocol."""

from __future__ import annotations

import enum
import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    Boolean,
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


class AgentStatus(str, enum.Enum):
    PENDING = "pending"
    ACTIVE = "active"
    SUSPENDED = "suspended"
    DELINQUENT = "delinquent"
    DEFAULTED = "defaulted"


class CreditDrawStatus(str, enum.Enum):
    PENDING = "pending"
    ACTIVE = "active"
    REPAID = "repaid"
    DEFAULTED = "defaulted"


class DepositStatus(str, enum.Enum):
    ACTIVE = "active"
    WITHDRAWN = "withdrawn"


class TrancheType(str, enum.Enum):
    SENIOR = "senior"
    JUNIOR = "junior"


class AlertSeverity(str, enum.Enum):
    INFO = "info"
    WARNING = "warning"
    CRITICAL = "critical"


# ---------- Auth Models ---------- #


class SiweNonce(Base):
    __tablename__ = "siwe_nonces"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    nonce: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    used: Mapped[bool] = mapped_column(Boolean, default=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class AccessToken(Base):
    __tablename__ = "access_tokens"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    token: Mapped[str] = mapped_column(String(128), unique=True, nullable=False)
    wallet_address: Mapped[str] = mapped_column(Text, nullable=False, index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    revoked_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


# ---------- Agent ---------- #


class Agent(Base):
    __tablename__ = "agents"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    owner_address: Mapped[str] = mapped_column(Text, nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    # ERC-8004 identity
    erc8004_token_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    erc8004_contract: Mapped[str | None] = mapped_column(String(42), nullable=True)

    # Code verification
    code_hash: Mapped[str | None] = mapped_column(String(128), nullable=True)
    tee_attestation: Mapped[str | None] = mapped_column(Text, nullable=True)
    code_verified: Mapped[bool] = mapped_column(Boolean, default=False)

    # Revenue lockbox
    lockbox_address: Mapped[str | None] = mapped_column(String(42), nullable=True)

    # Reputation & scoring
    reputation_score: Mapped[int] = mapped_column(Integer, default=0)

    status: Mapped[AgentStatus] = mapped_column(
        Enum(AgentStatus), default=AgentStatus.PENDING
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    # Relationships
    revenue_records: Mapped[list[RevenueRecord]] = relationship(
        back_populates="agent", cascade="all, delete-orphan"
    )
    credit_line: Mapped[CreditLine | None] = relationship(
        back_populates="agent", uselist=False, cascade="all, delete-orphan"
    )
    credit_draws: Mapped[list[CreditDraw]] = relationship(
        back_populates="agent", cascade="all, delete-orphan"
    )
    alerts: Mapped[list[AgentAlert]] = relationship(
        back_populates="agent", cascade="all, delete-orphan"
    )

    __table_args__ = (
        Index("ix_agents_owner_status", "owner_address", "status"),
    )


# ---------- Revenue ---------- #


class RevenueRecord(Base):
    __tablename__ = "revenue_records"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    agent_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("agents.id"), nullable=False
    )
    amount: Mapped[Decimal] = mapped_column(Numeric(18, 6), nullable=False)
    currency: Mapped[str] = mapped_column(String(10), default="USDC")
    tx_hash: Mapped[str | None] = mapped_column(String(66), nullable=True)
    block_number: Mapped[int | None] = mapped_column(Integer, nullable=True)
    source: Mapped[str | None] = mapped_column(String(255), nullable=True)
    recorded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    agent: Mapped[Agent] = relationship(back_populates="revenue_records")

    __table_args__ = (
        Index("ix_revenue_agent_recorded", "agent_id", "recorded_at"),
    )


# ---------- Credit ---------- #


class CreditLine(Base):
    __tablename__ = "credit_lines"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    agent_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("agents.id"), unique=True, nullable=False
    )
    max_amount: Mapped[Decimal] = mapped_column(Numeric(18, 6), nullable=False)
    used_amount: Mapped[Decimal] = mapped_column(Numeric(18, 6), default=0)
    interest_rate_bps: Mapped[int] = mapped_column(Integer, nullable=False)
    repayment_rate_bps: Mapped[int] = mapped_column(Integer, default=5000)
    credit_score: Mapped[int] = mapped_column(Integer, default=0)
    last_scored_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    agent: Mapped[Agent] = relationship(back_populates="credit_line")

    @property
    def available_amount(self) -> Decimal:
        return self.max_amount - self.used_amount


class CreditDraw(Base):
    __tablename__ = "credit_draws"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    agent_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("agents.id"), nullable=False
    )
    amount: Mapped[Decimal] = mapped_column(Numeric(18, 6), nullable=False)
    interest_rate_bps: Mapped[int] = mapped_column(Integer, nullable=False)
    amount_due: Mapped[Decimal] = mapped_column(Numeric(18, 6), nullable=False)
    amount_repaid: Mapped[Decimal] = mapped_column(Numeric(18, 6), default=0)
    status: Mapped[CreditDrawStatus] = mapped_column(
        Enum(CreditDrawStatus), default=CreditDrawStatus.ACTIVE
    )
    tx_hash: Mapped[str | None] = mapped_column(String(66), nullable=True)
    due_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    repaid_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    agent: Mapped[Agent] = relationship(back_populates="credit_draws")

    __table_args__ = (
        Index("ix_credit_draws_agent_status", "agent_id", "status"),
    )


# ---------- Pool ---------- #


class PoolDeposit(Base):
    __tablename__ = "pool_deposits"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    depositor_address: Mapped[str] = mapped_column(Text, nullable=False, index=True)
    tranche: Mapped[TrancheType] = mapped_column(Enum(TrancheType), nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(18, 6), nullable=False)
    shares: Mapped[Decimal] = mapped_column(Numeric(18, 6), nullable=False)
    status: Mapped[DepositStatus] = mapped_column(
        Enum(DepositStatus), default=DepositStatus.ACTIVE
    )
    tx_hash: Mapped[str | None] = mapped_column(String(66), nullable=True)
    withdrawn_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class PoolSnapshot(Base):
    """Periodic snapshot of pool stats for historical tracking."""
    __tablename__ = "pool_snapshots"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    total_deposits: Mapped[Decimal] = mapped_column(Numeric(18, 6), default=0)
    total_borrowed: Mapped[Decimal] = mapped_column(Numeric(18, 6), default=0)
    senior_tvl: Mapped[Decimal] = mapped_column(Numeric(18, 6), default=0)
    junior_tvl: Mapped[Decimal] = mapped_column(Numeric(18, 6), default=0)
    senior_apy_bps: Mapped[int] = mapped_column(Integer, default=0)
    junior_apy_bps: Mapped[int] = mapped_column(Integer, default=0)
    utilization_rate_bps: Mapped[int] = mapped_column(Integer, default=0)
    active_agents: Mapped[int] = mapped_column(Integer, default=0)
    snapshot_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


# ---------- Monitoring ---------- #


class AgentAlert(Base):
    __tablename__ = "agent_alerts"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    agent_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("agents.id"), nullable=False
    )
    severity: Mapped[AlertSeverity] = mapped_column(Enum(AlertSeverity), nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    resolved: Mapped[bool] = mapped_column(Boolean, default=False)
    resolved_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    agent: Mapped[Agent] = relationship(back_populates="alerts")
