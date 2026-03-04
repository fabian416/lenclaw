"""Monitoring worker — checks agent health, detects delinquency, and creates alerts.

Runs periodically to:
1. Flag agents whose revenue has dropped significantly.
2. Detect overdue credit draws (past due_at) and mark them delinquent/defaulted.
3. Create AgentAlerts for any anomalies found.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Any

import redis.asyncio as aioredis
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from src.db.models import (
    Agent,
    AgentAlert,
    AgentStatus,
    AlertSeverity,
    CreditDraw,
    CreditDrawStatus,
)
from src.db.session import get_session
from src.monitoring.service import MonitoringService
from src.workers.base import BaseWorker
from src.workers.config import WorkerSettings
from src.workers.resilience.dead_letter import DeadLetterQueue

# Thresholds
REVENUE_DROP_WARNING_PERCENT = Decimal("30")   # 30 % drop triggers WARNING
REVENUE_DROP_CRITICAL_PERCENT = Decimal("60")  # 60 % drop triggers CRITICAL
OVERDUE_DAYS_DELINQUENT = 7
OVERDUE_DAYS_DEFAULT = 30
HIGH_UTILIZATION_PERCENT = Decimal("85")


class MonitoringWorker(BaseWorker):
    """Checks agent health and raises alerts for anomalies."""

    name = "monitoring"

    def __init__(
        self,
        settings: WorkerSettings,
        redis: aioredis.Redis,
        *,
        dead_letter_queue: DeadLetterQueue | None = None,
    ) -> None:
        super().__init__(settings, redis, dead_letter_queue=dead_letter_queue)
        self._monitoring_service = MonitoringService()

    async def execute(self) -> dict[str, Any]:
        """Run all monitoring checks across active agents."""
        alerts_created = 0
        agents_checked = 0
        delinquent_flagged = 0
        defaults_flagged = 0

        async for session in get_session():
            result = await session.execute(
                select(Agent).where(
                    Agent.status.in_([
                        AgentStatus.ACTIVE,
                        AgentStatus.DELINQUENT,
                    ]),
                )
            )
            agents = list(result.scalars().all())
            agents_checked = len(agents)

            for agent in agents:
                try:
                    health = await self._monitoring_service.get_agent_health(
                        session, agent.id
                    )

                    # --- Revenue drop detection ---
                    alert_count = await self._check_revenue_health(
                        session, agent, health
                    )
                    alerts_created += alert_count

                    # --- High utilization warning ---
                    if health["credit_utilization_percent"] >= HIGH_UTILIZATION_PERCENT:
                        await self._create_alert_if_new(
                            session,
                            agent.id,
                            AlertSeverity.WARNING,
                            "High credit utilization",
                            f"Credit utilization at {health['credit_utilization_percent']}%. "
                            f"Outstanding debt: {health['outstanding_debt']}.",
                        )
                        alerts_created += 1

                except Exception as exc:
                    self.logger.warning(
                        "monitoring_agent_error",
                        agent_id=str(agent.id),
                        error=str(exc),
                    )

            # --- Overdue draw detection (cross-agent) ---
            d, df = await self._check_overdue_draws(session)
            delinquent_flagged += d
            defaults_flagged += df
            alerts_created += d + df

            await session.commit()

        return {
            "agents_checked": agents_checked,
            "alerts_created": alerts_created,
            "delinquent_flagged": delinquent_flagged,
            "defaults_flagged": defaults_flagged,
        }

    # ------------------------------------------------------------------
    # Revenue health
    # ------------------------------------------------------------------

    async def _check_revenue_health(
        self, session: AsyncSession, agent: Agent, health: dict
    ) -> int:
        """Check for revenue drops. Returns number of alerts created."""
        alerts = 0
        rev_30d = health["revenue_30d"]
        trend = health["revenue_trend"]

        if trend == "down" and rev_30d > 0:
            await self._create_alert_if_new(
                session,
                agent.id,
                AlertSeverity.WARNING,
                "Revenue declining",
                f"30-day revenue ({rev_30d}) is trending downward.",
            )
            alerts += 1

        if rev_30d == 0 and agent.status == AgentStatus.ACTIVE:
            await self._create_alert_if_new(
                session,
                agent.id,
                AlertSeverity.CRITICAL,
                "Zero revenue detected",
                "Agent has generated zero revenue in the past 30 days.",
            )
            alerts += 1

        return alerts

    # ------------------------------------------------------------------
    # Overdue draw detection
    # ------------------------------------------------------------------

    async def _check_overdue_draws(
        self, session: AsyncSession
    ) -> tuple[int, int]:
        """Detect overdue credit draws and update agent statuses.

        Returns (delinquent_count, default_count).
        """
        now = datetime.now(timezone.utc)
        delinquent_threshold = now - timedelta(days=OVERDUE_DAYS_DELINQUENT)
        default_threshold = now - timedelta(days=OVERDUE_DAYS_DEFAULT)

        # Find active draws past the delinquent threshold
        delinquent_result = await session.execute(
            select(CreditDraw).where(
                CreditDraw.status == CreditDrawStatus.ACTIVE,
                CreditDraw.due_at < delinquent_threshold,
                CreditDraw.due_at >= default_threshold,
            )
        )
        delinquent_draws = list(delinquent_result.scalars().all())

        delinquent_count = 0
        for draw in delinquent_draws:
            # Mark agent as delinquent
            await session.execute(
                update(Agent)
                .where(Agent.id == draw.agent_id, Agent.status == AgentStatus.ACTIVE)
                .values(status=AgentStatus.DELINQUENT)
            )
            await self._create_alert_if_new(
                session,
                draw.agent_id,
                AlertSeverity.WARNING,
                "Payment overdue",
                f"Credit draw {draw.id} is {(now - draw.due_at).days} days overdue. "
                f"Amount remaining: {draw.amount_due - draw.amount_repaid}.",
            )
            delinquent_count += 1

        # Find active draws past the default threshold
        default_result = await session.execute(
            select(CreditDraw).where(
                CreditDraw.status == CreditDrawStatus.ACTIVE,
                CreditDraw.due_at < default_threshold,
            )
        )
        default_draws = list(default_result.scalars().all())

        default_count = 0
        for draw in default_draws:
            draw.status = CreditDrawStatus.DEFAULTED
            await session.execute(
                update(Agent)
                .where(Agent.id == draw.agent_id)
                .values(status=AgentStatus.DEFAULTED)
            )
            await self._create_alert_if_new(
                session,
                draw.agent_id,
                AlertSeverity.CRITICAL,
                "Credit default",
                f"Credit draw {draw.id} has defaulted after {OVERDUE_DAYS_DEFAULT} days. "
                f"Remaining debt: {draw.amount_due - draw.amount_repaid}.",
            )
            default_count += 1

        return delinquent_count, default_count

    # ------------------------------------------------------------------
    # Alert helper (idempotent — avoids duplicate open alerts)
    # ------------------------------------------------------------------

    async def _create_alert_if_new(
        self,
        session: AsyncSession,
        agent_id: Any,
        severity: AlertSeverity,
        title: str,
        message: str,
    ) -> None:
        """Create an alert only if there is no existing unresolved alert with the same title."""
        existing = await session.execute(
            select(AgentAlert).where(
                AgentAlert.agent_id == agent_id,
                AgentAlert.title == title,
                AgentAlert.resolved.is_(False),
            )
        )
        if existing.scalar_one_or_none() is not None:
            return

        await self._monitoring_service.create_alert(
            session, agent_id, severity, title, message
        )
