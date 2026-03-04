"""Business logic for the liquidation / default recovery system."""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from src.common.exceptions import BadRequestError, NotFoundError
from src.db.models import Agent, AgentStatus
from src.liquidation.models import (
    AuctionStatus,
    Liquidation,
    LiquidationAuction,
    LiquidationStatus,
)

logger = logging.getLogger(__name__)


class LiquidationService:
    """Manages liquidation lifecycle: detection, trigger, settlement."""

    # ── Read ──────────────────────────────────────────────────

    async def list_liquidations(
        self,
        session: AsyncSession,
        page: int = 1,
        page_size: int = 20,
        status: LiquidationStatus | None = None,
        agent_id: uuid.UUID | None = None,
    ) -> tuple[list[Liquidation], int]:
        query = (
            select(Liquidation)
            .options(selectinload(Liquidation.auction))
            .order_by(Liquidation.created_at.desc())
        )
        count_query = select(func.count(Liquidation.id))

        if status is not None:
            query = query.where(Liquidation.status == status)
            count_query = count_query.where(Liquidation.status == status)

        if agent_id is not None:
            query = query.where(Liquidation.agent_id == agent_id)
            count_query = count_query.where(Liquidation.agent_id == agent_id)

        total_result = await session.execute(count_query)
        total = total_result.scalar() or 0

        query = query.offset((page - 1) * page_size).limit(page_size)
        result = await session.execute(query)
        liquidations = list(result.scalars().all())

        return liquidations, total

    async def get_liquidation(
        self, session: AsyncSession, liquidation_id: uuid.UUID
    ) -> Liquidation:
        result = await session.execute(
            select(Liquidation)
            .options(selectinload(Liquidation.auction))
            .where(Liquidation.id == liquidation_id)
        )
        liquidation = result.scalar_one_or_none()
        if liquidation is None:
            raise NotFoundError(f"Liquidation {liquidation_id} not found")
        return liquidation

    # ── Trigger ───────────────────────────────────────────────

    async def trigger_liquidation(
        self,
        session: AsyncSession,
        liquidation_id: uuid.UUID,
        keeper_address: str,
    ) -> Liquidation:
        """Trigger a pending liquidation: transitions to auction_active.

        In production this would submit an on-chain transaction via the
        LiquidationKeeper contract. Here we record the intent and update
        the database state so the indexer / listener can pick it up.
        """
        liquidation = await self.get_liquidation(session, liquidation_id)

        if liquidation.status != LiquidationStatus.PENDING:
            raise BadRequestError(
                f"Liquidation cannot be triggered from status {liquidation.status.value}"
            )

        now = datetime.now(timezone.utc)

        # Transition to auction_active
        liquidation.status = LiquidationStatus.AUCTION_ACTIVE
        liquidation.triggered_by = keeper_address.lower()
        liquidation.triggered_at = now

        # Create the auction record
        start_price = liquidation.outstanding_debt * Decimal("1.5")   # 150%
        min_price = liquidation.outstanding_debt * Decimal("0.3")     # 30%

        auction = LiquidationAuction(
            liquidation_id=liquidation.id,
            start_price=start_price,
            min_price=min_price,
            duration_seconds=21600,  # 6 hours
            status=AuctionStatus.ACTIVE,
            started_at=now,
        )
        session.add(auction)

        await session.flush()
        logger.info(
            "Triggered liquidation id=%s agent=%s keeper=%s",
            liquidation.id,
            liquidation.agent_id,
            keeper_address,
        )
        return liquidation

    # ── Detection ─────────────────────────────────────────────

    async def create_liquidation_for_agent(
        self,
        session: AsyncSession,
        agent_id: uuid.UUID,
        outstanding_debt: Decimal,
        on_chain_agent_id: int | None = None,
    ) -> Liquidation:
        """Create a pending liquidation for a defaulted agent.

        Called by the monitoring system when it detects a default.
        """
        # Verify agent exists and is defaulted
        agent_result = await session.execute(
            select(Agent).where(Agent.id == agent_id)
        )
        agent = agent_result.scalar_one_or_none()
        if agent is None:
            raise NotFoundError(f"Agent {agent_id} not found")

        if agent.status != AgentStatus.DEFAULTED:
            raise BadRequestError(
                f"Agent {agent_id} is not in DEFAULTED status (current: {agent.status.value})"
            )

        # Check for existing active liquidation
        existing_result = await session.execute(
            select(Liquidation).where(
                Liquidation.agent_id == agent_id,
                Liquidation.status.in_([
                    LiquidationStatus.PENDING,
                    LiquidationStatus.AUCTION_ACTIVE,
                ]),
            )
        )
        existing = existing_result.scalar_one_or_none()
        if existing is not None:
            raise BadRequestError(
                f"Agent {agent_id} already has an active liquidation: {existing.id}"
            )

        liquidation = Liquidation(
            agent_id=agent_id,
            on_chain_agent_id=on_chain_agent_id,
            outstanding_debt=outstanding_debt,
            status=LiquidationStatus.PENDING,
        )
        session.add(liquidation)
        await session.flush()

        logger.info(
            "Created liquidation id=%s agent=%s debt=%s",
            liquidation.id,
            agent_id,
            outstanding_debt,
        )
        return liquidation

    # ── Settlement ────────────────────────────────────────────

    async def settle_liquidation(
        self,
        session: AsyncSession,
        liquidation_id: uuid.UUID,
        recovered_amount: Decimal,
        buyer_address: str | None = None,
        settle_tx_hash: str | None = None,
    ) -> Liquidation:
        """Settle a liquidation after auction completion.

        Computes loss amounts and distributes to the pool.
        """
        liquidation = await self.get_liquidation(session, liquidation_id)

        if liquidation.status != LiquidationStatus.AUCTION_ACTIVE:
            raise BadRequestError(
                f"Liquidation cannot be settled from status {liquidation.status.value}"
            )

        now = datetime.now(timezone.utc)

        liquidation.recovered_amount = recovered_amount
        liquidation.settle_tx_hash = settle_tx_hash
        liquidation.settled_at = now

        # Calculate loss
        if recovered_amount >= liquidation.outstanding_debt:
            # Full recovery
            liquidation.loss_amount = Decimal("0")
            liquidation.recovery_rate_bps = 10000
            liquidation.status = LiquidationStatus.SETTLED
        elif recovered_amount > 0:
            # Partial recovery
            loss = liquidation.outstanding_debt - recovered_amount
            liquidation.loss_amount = loss
            liquidation.recovery_rate_bps = int(
                (recovered_amount * 10000) / liquidation.outstanding_debt
            )
            liquidation.pool_loss = loss
            liquidation.status = LiquidationStatus.SETTLED
        else:
            # Complete write-off
            liquidation.loss_amount = liquidation.outstanding_debt
            liquidation.pool_loss = liquidation.outstanding_debt
            liquidation.recovery_rate_bps = 0
            liquidation.status = LiquidationStatus.WRITE_OFF

        # Update auction record
        if liquidation.auction is not None:
            if recovered_amount > 0:
                liquidation.auction.status = AuctionStatus.SETTLED
                liquidation.auction.settled_price = recovered_amount
                liquidation.auction.buyer_address = (
                    buyer_address.lower() if buyer_address else None
                )
                liquidation.auction.settled_at = now
            else:
                liquidation.auction.status = AuctionStatus.EXPIRED

        await session.flush()

        logger.info(
            "Settled liquidation id=%s recovered=%s loss=%s rate_bps=%s",
            liquidation.id,
            recovered_amount,
            liquidation.loss_amount,
            liquidation.recovery_rate_bps,
        )
        return liquidation

    # ── Summary ───────────────────────────────────────────────

    async def get_summary(self, session: AsyncSession) -> dict:
        """Return aggregate liquidation statistics."""
        total_result = await session.execute(
            select(func.count(Liquidation.id))
        )
        total_liquidations = total_result.scalar() or 0

        active_result = await session.execute(
            select(func.count(Liquidation.id)).where(
                Liquidation.status == LiquidationStatus.AUCTION_ACTIVE
            )
        )
        active_auctions = active_result.scalar() or 0

        agg_result = await session.execute(
            select(
                func.coalesce(func.sum(Liquidation.outstanding_debt), 0),
                func.coalesce(func.sum(Liquidation.recovered_amount), 0),
                func.coalesce(func.sum(Liquidation.loss_amount), 0),
            )
        )
        row = agg_result.one()
        total_debt = row[0] or Decimal("0")
        total_recovered = row[1] or Decimal("0")
        total_losses = row[2] or Decimal("0")

        recovery_rate_bps = 0
        if total_debt > 0:
            recovery_rate_bps = int((total_recovered * 10000) / total_debt)

        return {
            "total_liquidations": total_liquidations,
            "active_auctions": active_auctions,
            "total_debt_processed": total_debt,
            "total_recovered": total_recovered,
            "total_losses": total_losses,
            "overall_recovery_rate_bps": recovery_rate_bps,
        }
