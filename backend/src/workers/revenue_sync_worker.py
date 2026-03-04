"""Revenue sync worker — polls RevenueLockbox contracts for revenue events and updates the DB.

Reads the last-processed block from Redis, fetches new Transfer events
from the on-chain lockbox contracts, and records each revenue deposit via
the existing RevenueService.
"""

from __future__ import annotations

import uuid
from decimal import Decimal
from typing import Any

import redis.asyncio as aioredis
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.common.config import load_settings
from src.db.models import Agent, AgentStatus, RevenueRecord
from src.db.session import get_session, init_db
from src.revenue.service import RevenueService
from src.workers.base import BaseWorker
from src.workers.config import WorkerSettings
from src.workers.resilience.circuit_breaker import CircuitBreaker
from src.workers.resilience.dead_letter import DeadLetterQueue
from src.workers.resilience.rate_limiter import TokenBucketRateLimiter
from src.workers.resilience.retry import retry_with_backoff

# Redis key for persisting the last processed block per agent lockbox
_LAST_BLOCK_KEY = "lenclaw:revenue_sync:last_block:{agent_id}"


class RevenueSyncWorker(BaseWorker):
    """Polls on-chain RevenueLockbox contracts for new revenue events."""

    name = "revenue_sync"

    def __init__(
        self,
        settings: WorkerSettings,
        redis: aioredis.Redis,
        *,
        dead_letter_queue: DeadLetterQueue | None = None,
    ) -> None:
        super().__init__(settings, redis, dead_letter_queue=dead_letter_queue)
        self._revenue_service = RevenueService()
        self._circuit_breaker = CircuitBreaker(
            "revenue_sync_rpc",
            failure_threshold=settings.circuit_breaker.failure_threshold,
            recovery_timeout=settings.circuit_breaker.recovery_timeout,
            half_open_max_calls=settings.circuit_breaker.half_open_max_calls,
        )
        self._rate_limiter = TokenBucketRateLimiter(
            rate=settings.rate_limiter.rpc_rate,
            burst=settings.rate_limiter.rpc_burst,
        )

    async def execute(self) -> dict[str, Any]:
        """Scan all active agents with lockbox addresses for new revenue events."""
        app_settings = load_settings()
        total_events = 0
        agents_scanned = 0

        async for session in get_session():
            # Get all active agents with a lockbox address
            result = await session.execute(
                select(Agent).where(
                    Agent.status.in_([AgentStatus.ACTIVE, AgentStatus.DELINQUENT]),
                    Agent.lockbox_address.isnot(None),
                )
            )
            agents = list(result.scalars().all())
            agents_scanned = len(agents)

            for agent in agents:
                events = await self._sync_agent_revenue(session, agent)
                total_events += events

            await session.commit()

        return {
            "agents_scanned": agents_scanned,
            "events_synced": total_events,
        }

    async def _sync_agent_revenue(
        self, session: AsyncSession, agent: Agent
    ) -> int:
        """Sync revenue events for a single agent. Returns event count."""
        last_block = await self._get_last_block(agent.id)

        events = await self._fetch_lockbox_events(
            agent.lockbox_address,  # type: ignore[arg-type]
            from_block=last_block + 1,
        )

        if not events:
            return 0

        new_last_block = last_block
        for event in events:
            # Idempotency: skip if tx_hash already recorded
            existing = await session.execute(
                select(RevenueRecord).where(
                    RevenueRecord.agent_id == agent.id,
                    RevenueRecord.tx_hash == event["tx_hash"],
                )
            )
            if existing.scalar_one_or_none() is not None:
                continue

            await self._revenue_service.record_revenue(
                session,
                agent.id,
                {
                    "amount": event["amount"],
                    "currency": event.get("currency", "USDC"),
                    "tx_hash": event["tx_hash"],
                    "block_number": event["block_number"],
                    "source": "lockbox_sync",
                },
            )

            if event["block_number"] > new_last_block:
                new_last_block = event["block_number"]

        if new_last_block > last_block:
            await self._set_last_block(agent.id, new_last_block)

        return len(events)

    @retry_with_backoff(
        max_retries=3,
        base_delay=2.0,
        max_delay=30.0,
        worker_name="revenue_sync",
        task_name="fetch_lockbox_events",
    )
    async def _fetch_lockbox_events(
        self,
        lockbox_address: str,
        from_block: int,
    ) -> list[dict[str, Any]]:
        """Fetch revenue deposit events from the lockbox contract.

        In production this calls the Web3 provider. Here we provide the
        scaffold that integrates with the circuit breaker and rate limiter.
        Replace the body with actual eth_getLogs / contract.events calls.
        """
        await self._rate_limiter.acquire()

        from src.workers.observability.metrics import metrics as m

        async with self._circuit_breaker:
            # -----------------------------------------------------------------
            # PRODUCTION IMPLEMENTATION:
            #   w3 = AsyncWeb3(AsyncHTTPProvider(rpc_url))
            #   contract = w3.eth.contract(address=lockbox_address, abi=LOCKBOX_ABI)
            #   logs = await contract.events.RevenueDeposited.get_logs(
            #       from_block=from_block, to_block="latest"
            #   )
            #   return [_parse_event(log) for log in logs]
            # -----------------------------------------------------------------
            m.record_rpc_call("revenue_sync", "eth_getLogs", success=True)
            # Return empty list — no-op until on-chain integration is wired up.
            return []

    # ------------------------------------------------------------------
    # Last-block persistence helpers
    # ------------------------------------------------------------------

    async def _get_last_block(self, agent_id: uuid.UUID) -> int:
        key = _LAST_BLOCK_KEY.format(agent_id=agent_id)
        raw = await self.redis.get(key)
        if raw is None:
            return 0
        return int(raw)

    async def _set_last_block(self, agent_id: uuid.UUID, block: int) -> None:
        key = _LAST_BLOCK_KEY.format(agent_id=agent_id)
        await self.redis.set(key, str(block))
