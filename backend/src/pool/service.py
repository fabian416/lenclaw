from __future__ import annotations

import logging
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.db.models import (
    Agent,
    AgentStatus,
    CreditDraw,
    CreditDrawStatus,
    DepositStatus,
    PoolDeposit,
    TrancheType,
)

logger = logging.getLogger(__name__)

# APY model constants
BASE_SENIOR_APY_BPS = 400  # 4% base for senior
BASE_JUNIOR_APY_BPS = 800  # 8% base for junior
UTILIZATION_BONUS_MULTIPLIER = Decimal("1.5")


class PoolService:
    async def get_pool_stats(self, session: AsyncSession) -> dict:
        # Total deposits by tranche
        senior_tvl = await self._tranche_tvl(session, TrancheType.SENIOR)
        junior_tvl = await self._tranche_tvl(session, TrancheType.JUNIOR)
        total_deposits = senior_tvl + junior_tvl

        # Total borrowed (active draws)
        borrowed_result = await session.execute(
            select(
                func.coalesce(func.sum(CreditDraw.amount), 0)
            ).where(CreditDraw.status == CreditDrawStatus.ACTIVE)
        )
        total_borrowed = borrowed_result.scalar() or Decimal(0)

        # Utilization rate
        utilization = (
            (total_borrowed / total_deposits * 100)
            if total_deposits > 0
            else Decimal(0)
        )

        # Active agents
        active_result = await session.execute(
            select(func.count(Agent.id)).where(Agent.status == AgentStatus.ACTIVE)
        )
        active_agents = active_result.scalar() or 0

        # Unique depositors
        depositors_result = await session.execute(
            select(func.count(func.distinct(PoolDeposit.depositor_address))).where(
                PoolDeposit.status == DepositStatus.ACTIVE
            )
        )
        total_depositors = depositors_result.scalar() or 0

        return {
            "total_deposits": total_deposits,
            "total_borrowed": total_borrowed,
            "senior_tvl": senior_tvl,
            "junior_tvl": junior_tvl,
            "utilization_rate_percent": utilization.quantize(Decimal("0.01")),
            "active_agents": active_agents,
            "total_depositors": total_depositors,
        }

    async def get_pool_apy(self, session: AsyncSession) -> dict:
        stats = await self.get_pool_stats(session)
        utilization = stats["utilization_rate_percent"]

        # APY increases with utilization: base + utilization_bonus
        utilization_bonus = (utilization / 100 * UTILIZATION_BONUS_MULTIPLIER * 100).quantize(
            Decimal("0.01")
        )

        senior_apy = (
            Decimal(BASE_SENIOR_APY_BPS) / 100 + utilization_bonus
        ).quantize(Decimal("0.01"))
        junior_apy = (
            Decimal(BASE_JUNIOR_APY_BPS) / 100 + utilization_bonus * 2
        ).quantize(Decimal("0.01"))

        return {
            "senior_apy_percent": senior_apy,
            "junior_apy_percent": junior_apy,
            "base_rate_bps": BASE_SENIOR_APY_BPS,
            "utilization_rate_percent": utilization,
        }

    async def _tranche_tvl(
        self, session: AsyncSession, tranche: TrancheType
    ) -> Decimal:
        result = await session.execute(
            select(func.coalesce(func.sum(PoolDeposit.amount), 0)).where(
                PoolDeposit.tranche == tranche,
                PoolDeposit.status == DepositStatus.ACTIVE,
            )
        )
        return result.scalar() or Decimal(0)
