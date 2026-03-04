from __future__ import annotations

import logging
import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.common.exceptions import NotFoundError
from src.db.models import (
    Agent,
    AgentAlert,
    AlertSeverity,
    CreditDraw,
    CreditDrawStatus,
    CreditLine,
    RevenueRecord,
)

logger = logging.getLogger(__name__)


class MonitoringService:
    async def get_agent_health(
        self, session: AsyncSession, agent_id: uuid.UUID
    ) -> dict:
        # Fetch agent
        result = await session.execute(select(Agent).where(Agent.id == agent_id))
        agent = result.scalar_one_or_none()
        if agent is None:
            raise NotFoundError(f"Agent {agent_id} not found")

        now = datetime.now(timezone.utc)

        # Revenue 30d
        rev_30 = await self._revenue_for_period(session, agent_id, 30)
        rev_prev_30 = await self._revenue_for_period_range(
            session, agent_id, 30, 60
        )

        # Revenue trend
        if rev_prev_30 == 0:
            trend = "stable" if rev_30 == 0 else "up"
        elif rev_30 > rev_prev_30 * Decimal("1.1"):
            trend = "up"
        elif rev_30 < rev_prev_30 * Decimal("0.9"):
            trend = "down"
        else:
            trend = "stable"

        # Credit utilization
        cl_result = await session.execute(
            select(CreditLine).where(CreditLine.agent_id == agent_id)
        )
        credit_line = cl_result.scalar_one_or_none()
        utilization = Decimal(0)
        if credit_line and credit_line.max_amount > 0:
            utilization = (
                credit_line.used_amount / credit_line.max_amount * 100
            ).quantize(Decimal("0.01"))

        # Outstanding debt
        debt_result = await session.execute(
            select(
                func.coalesce(
                    func.sum(CreditDraw.amount_due - CreditDraw.amount_repaid), 0
                )
            ).where(
                CreditDraw.agent_id == agent_id,
                CreditDraw.status == CreditDrawStatus.ACTIVE,
            )
        )
        outstanding = debt_result.scalar() or Decimal(0)

        # Next due date
        next_due_result = await session.execute(
            select(func.min(CreditDraw.due_at)).where(
                CreditDraw.agent_id == agent_id,
                CreditDraw.status == CreditDrawStatus.ACTIVE,
            )
        )
        next_due = next_due_result.scalar()
        days_until_due = None
        if next_due is not None:
            days_until_due = max(0, (next_due - now).days)

        # Alert count
        alert_result = await session.execute(
            select(func.count(AgentAlert.id)).where(
                AgentAlert.agent_id == agent_id,
                AgentAlert.resolved.is_(False),
            )
        )
        alert_count = alert_result.scalar() or 0

        return {
            "agent_id": agent.id,
            "agent_name": agent.name,
            "status": agent.status.value,
            "lockbox_address": agent.lockbox_address,
            "revenue_30d": rev_30,
            "revenue_trend": trend,
            "credit_utilization_percent": utilization,
            "outstanding_debt": outstanding,
            "days_until_next_due": days_until_due,
            "alert_count": alert_count,
        }

    async def get_alerts(
        self,
        session: AsyncSession,
        agent_id: uuid.UUID,
        include_resolved: bool = False,
    ) -> tuple[list[AgentAlert], int]:
        query = select(AgentAlert).where(AgentAlert.agent_id == agent_id)
        count_query = select(func.count(AgentAlert.id)).where(
            AgentAlert.agent_id == agent_id
        )

        if not include_resolved:
            query = query.where(AgentAlert.resolved.is_(False))
            count_query = count_query.where(AgentAlert.resolved.is_(False))

        query = query.order_by(AgentAlert.created_at.desc())

        total_result = await session.execute(count_query)
        total = total_result.scalar() or 0

        result = await session.execute(query)
        alerts = list(result.scalars().all())

        return alerts, total

    async def create_alert(
        self,
        session: AsyncSession,
        agent_id: uuid.UUID,
        severity: AlertSeverity,
        title: str,
        message: str,
    ) -> AgentAlert:
        alert = AgentAlert(
            agent_id=agent_id,
            severity=severity,
            title=title,
            message=message,
        )
        session.add(alert)
        await session.flush()
        logger.info("Created alert for agent=%s: %s", agent_id, title)
        return alert

    async def _revenue_for_period(
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

    async def _revenue_for_period_range(
        self,
        session: AsyncSession,
        agent_id: uuid.UUID,
        start_days_ago: int,
        end_days_ago: int,
    ) -> Decimal:
        now = datetime.now(timezone.utc)
        since = now - timedelta(days=end_days_ago)
        until = now - timedelta(days=start_days_ago)
        result = await session.execute(
            select(func.coalesce(func.sum(RevenueRecord.amount), 0)).where(
                RevenueRecord.agent_id == agent_id,
                RevenueRecord.recorded_at >= since,
                RevenueRecord.recorded_at < until,
            )
        )
        return result.scalar() or Decimal(0)
