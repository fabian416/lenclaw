"""Credit scoring worker — recalculates credit scores periodically.

Iterates over all active agents and runs the scoring algorithm defined in
``src.credit.service.CreditService.score_agent``.
"""

from __future__ import annotations

from typing import Any

import redis.asyncio as aioredis
from sqlalchemy import select

from src.credit.service import CreditService
from src.db.models import Agent, AgentStatus
from src.db.session import get_session
from src.workers.base import BaseWorker
from src.workers.config import WorkerSettings
from src.workers.resilience.dead_letter import DeadLetterQueue


class CreditScoringWorker(BaseWorker):
    """Periodically rescores every active agent's creditworthiness."""

    name = "credit_scoring"

    def __init__(
        self,
        settings: WorkerSettings,
        redis: aioredis.Redis,
        *,
        dead_letter_queue: DeadLetterQueue | None = None,
    ) -> None:
        super().__init__(settings, redis, dead_letter_queue=dead_letter_queue)
        self._credit_service = CreditService()

    async def execute(self) -> dict[str, Any]:
        """Run credit scoring for all eligible agents."""
        agents_scored = 0
        agents_skipped = 0
        errors = 0

        async for session in get_session():
            result = await session.execute(
                select(Agent).where(
                    Agent.status.in_([AgentStatus.ACTIVE, AgentStatus.DELINQUENT]),
                )
            )
            agents = list(result.scalars().all())

            for agent in agents:
                try:
                    await self._credit_service.score_agent(session, agent.id)
                    agents_scored += 1
                except Exception as exc:
                    self.logger.warning(
                        "scoring_error",
                        agent_id=str(agent.id),
                        error=str(exc),
                    )
                    errors += 1
                    agents_skipped += 1

            await session.commit()

        return {
            "agents_scored": agents_scored,
            "agents_skipped": agents_skipped,
            "errors": errors,
        }
