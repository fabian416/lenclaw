from __future__ import annotations

import logging
import math
import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.common.exceptions import NotFoundError
from src.db.models import Agent, RevenueRecord

logger = logging.getLogger(__name__)


class RevenueService:
    async def record_revenue(
        self, session: AsyncSession, agent_id: uuid.UUID, data: dict
    ) -> RevenueRecord:
        # Verify agent exists
        result = await session.execute(select(Agent).where(Agent.id == agent_id))
        if result.scalar_one_or_none() is None:
            raise NotFoundError(f"Agent {agent_id} not found")

        record = RevenueRecord(
            agent_id=agent_id,
            amount=data["amount"],
            currency=data.get("currency", "USDC"),
            tx_hash=data.get("tx_hash"),
            block_number=data.get("block_number"),
            source=data.get("source"),
        )
        session.add(record)
        await session.flush()
        logger.info(
            "Recorded revenue for agent=%s amount=%s", agent_id, data["amount"]
        )
        return record

    async def get_revenue_history(
        self,
        session: AsyncSession,
        agent_id: uuid.UUID,
        days: int | None = None,
        limit: int = 100,
    ) -> list[RevenueRecord]:
        query = (
            select(RevenueRecord)
            .where(RevenueRecord.agent_id == agent_id)
            .order_by(RevenueRecord.recorded_at.desc())
        )

        if days is not None:
            since = datetime.now(timezone.utc) - timedelta(days=days)
            query = query.where(RevenueRecord.recorded_at >= since)

        query = query.limit(limit)
        result = await session.execute(query)
        return list(result.scalars().all())

    async def get_revenue_for_period(
        self, session: AsyncSession, agent_id: uuid.UUID, days: int
    ) -> Decimal:
        since = datetime.now(timezone.utc) - timedelta(days=days)
        result = await session.execute(
            select(func.coalesce(func.sum(RevenueRecord.amount), 0)).where(
                RevenueRecord.agent_id == agent_id,
                RevenueRecord.recorded_at >= since,
            )
        )
        return result.scalar() or Decimal(0)

    async def get_revenue_summary(
        self, session: AsyncSession, agent_id: uuid.UUID
    ) -> dict:
        # Verify agent exists
        agent_result = await session.execute(select(Agent).where(Agent.id == agent_id))
        if agent_result.scalar_one_or_none() is None:
            raise NotFoundError(f"Agent {agent_id} not found")

        total_result = await session.execute(
            select(func.coalesce(func.sum(RevenueRecord.amount), 0)).where(
                RevenueRecord.agent_id == agent_id
            )
        )
        total = total_result.scalar() or Decimal(0)

        rev_30 = await self.get_revenue_for_period(session, agent_id, 30)
        rev_60 = await self.get_revenue_for_period(session, agent_id, 60)
        rev_90 = await self.get_revenue_for_period(session, agent_id, 90)

        avg_daily = rev_30 / 30 if rev_30 > 0 else Decimal(0)
        consistency = await self._compute_consistency_score(session, agent_id)

        return {
            "agent_id": agent_id,
            "total_revenue": total,
            "revenue_30d": rev_30,
            "revenue_60d": rev_60,
            "revenue_90d": rev_90,
            "avg_daily_30d": avg_daily,
            "consistency_score": consistency,
        }

    async def _compute_consistency_score(
        self, session: AsyncSession, agent_id: uuid.UUID
    ) -> Decimal:
        """
        Consistency score (0-100) based on daily revenue standard deviation over 30 days.
        Lower variance = higher consistency.
        """
        since = datetime.now(timezone.utc) - timedelta(days=30)

        result = await session.execute(
            select(
                func.date_trunc("day", RevenueRecord.recorded_at).label("day"),
                func.sum(RevenueRecord.amount).label("daily_total"),
            )
            .where(
                RevenueRecord.agent_id == agent_id,
                RevenueRecord.recorded_at >= since,
            )
            .group_by(func.date_trunc("day", RevenueRecord.recorded_at))
        )
        rows = result.all()

        if len(rows) < 2:
            return Decimal(0) if len(rows) == 0 else Decimal(50)

        daily_amounts = [float(r.daily_total) for r in rows]
        mean = sum(daily_amounts) / len(daily_amounts)

        if mean == 0:
            return Decimal(0)

        variance = sum((x - mean) ** 2 for x in daily_amounts) / len(daily_amounts)
        std_dev = math.sqrt(variance)
        cv = std_dev / mean  # coefficient of variation

        # Map CV to 0-100 score: CV=0 -> 100, CV>=2 -> 0
        score = max(0, min(100, (1 - cv / 2) * 100))
        return Decimal(str(round(score, 2)))
