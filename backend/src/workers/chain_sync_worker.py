"""Chain sync worker — synchronises blockchain events.

Tracks on-chain events for the Lenclaw lending pool contracts:
deposits, withdrawals, borrows, and repayments.

Uses a block cursor persisted in Redis for crash-safe resumption.
"""

from __future__ import annotations

from decimal import Decimal
from typing import Any

import redis.asyncio as aioredis
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.db.models import CreditDraw, CreditDrawStatus, DepositStatus, PoolDeposit
from src.db.session import get_session
from src.workers.base import BaseWorker
from src.workers.config import WorkerSettings
from src.workers.resilience.circuit_breaker import CircuitBreaker
from src.workers.resilience.dead_letter import DeadLetterQueue
from src.workers.resilience.rate_limiter import TokenBucketRateLimiter
from src.workers.resilience.retry import retry_with_backoff

_CURSOR_KEY = "lenclaw:chain_sync:block_cursor"

# Event type constants
EVENT_DEPOSIT = "deposit"
EVENT_WITHDRAWAL = "withdrawal"
EVENT_BORROW = "borrow"
EVENT_REPAYMENT = "repayment"


class ChainSyncWorker(BaseWorker):
    """Syncs blockchain events for the Lenclaw lending pool contracts."""

    name = "chain_sync"

    def __init__(
        self,
        settings: WorkerSettings,
        redis: aioredis.Redis,
        *,
        dead_letter_queue: DeadLetterQueue | None = None,
    ) -> None:
        super().__init__(settings, redis, dead_letter_queue=dead_letter_queue)
        self._circuit_breaker = CircuitBreaker(
            "chain_sync_rpc",
            failure_threshold=settings.circuit_breaker.failure_threshold,
            recovery_timeout=settings.circuit_breaker.recovery_timeout,
            half_open_max_calls=settings.circuit_breaker.half_open_max_calls,
        )
        self._rate_limiter = TokenBucketRateLimiter(
            rate=settings.rate_limiter.rpc_rate,
            burst=settings.rate_limiter.rpc_burst,
        )

    async def execute(self) -> dict[str, Any]:
        """Fetch and process new blockchain events since the last cursor."""
        from_block = await self._get_cursor()
        latest_block = await self._get_latest_block()

        if latest_block <= from_block:
            return {
                "from_block": from_block,
                "to_block": from_block,
                "events_processed": 0,
            }

        events = await self._fetch_pool_events(from_block + 1, latest_block)
        processed = 0

        if events:
            async for session in get_session():
                for event in events:
                    await self._process_event(session, event)
                    processed += 1
                await session.commit()

        await self._set_cursor(latest_block)

        return {
            "from_block": from_block + 1,
            "to_block": latest_block,
            "events_processed": processed,
        }

    # ------------------------------------------------------------------
    # Event processing
    # ------------------------------------------------------------------

    async def _process_event(
        self, session: AsyncSession, event: dict[str, Any]
    ) -> None:
        """Route and handle a single chain event. Idempotent by tx_hash."""
        event_type = event.get("event_type")
        tx_hash = event.get("tx_hash")

        if event_type == EVENT_DEPOSIT:
            await self._handle_deposit(session, event)
        elif event_type == EVENT_WITHDRAWAL:
            await self._handle_withdrawal(session, event)
        elif event_type == EVENT_BORROW:
            await self._handle_borrow(session, event)
        elif event_type == EVENT_REPAYMENT:
            await self._handle_repayment(session, event)
        else:
            self.logger.warning(
                "unknown_event_type", event_type=event_type, tx_hash=tx_hash
            )

    async def _handle_deposit(
        self, session: AsyncSession, event: dict[str, Any]
    ) -> None:
        """Handle a pool deposit event."""
        tx_hash = event["tx_hash"]

        # Idempotency check
        existing = await session.execute(
            select(PoolDeposit).where(PoolDeposit.tx_hash == tx_hash)
        )
        if existing.scalar_one_or_none() is not None:
            return

        deposit = PoolDeposit(
            depositor_address=event["depositor"],
            amount=Decimal(str(event["amount"])),
            shares=Decimal(str(event.get("shares", event["amount"]))),
            status=DepositStatus.ACTIVE,
            tx_hash=tx_hash,
        )
        session.add(deposit)
        self.logger.info("deposit_recorded", tx_hash=tx_hash, amount=event["amount"])

    async def _handle_withdrawal(
        self, session: AsyncSession, event: dict[str, Any]
    ) -> None:
        """Handle a pool withdrawal event."""
        tx_hash = event["tx_hash"]
        deposit_tx = event.get("deposit_tx_hash")

        if deposit_tx:
            result = await session.execute(
                select(PoolDeposit).where(PoolDeposit.tx_hash == deposit_tx)
            )
            deposit = result.scalar_one_or_none()
            if deposit is not None:
                deposit.status = DepositStatus.WITHDRAWN
                self.logger.info(
                    "withdrawal_recorded", tx_hash=tx_hash, deposit_tx=deposit_tx
                )

    async def _handle_borrow(
        self, session: AsyncSession, event: dict[str, Any]
    ) -> None:
        """Handle a borrow event — update the credit draw's tx_hash."""
        tx_hash = event["tx_hash"]
        draw_id = event.get("draw_id")

        if draw_id:
            result = await session.execute(
                select(CreditDraw).where(CreditDraw.id == draw_id)
            )
            draw = result.scalar_one_or_none()
            if draw is not None:
                draw.tx_hash = tx_hash
                self.logger.info("borrow_recorded", tx_hash=tx_hash, draw_id=draw_id)

    async def _handle_repayment(
        self, session: AsyncSession, event: dict[str, Any]
    ) -> None:
        """Handle a repayment event — update draw repaid amount on-chain."""
        tx_hash = event["tx_hash"]
        draw_id = event.get("draw_id")
        amount = Decimal(str(event.get("amount", 0)))

        if draw_id and amount > 0:
            result = await session.execute(
                select(CreditDraw).where(CreditDraw.id == draw_id)
            )
            draw = result.scalar_one_or_none()
            if draw is not None:
                draw.amount_repaid += amount
                if draw.amount_repaid >= draw.amount_due:
                    draw.status = CreditDrawStatus.REPAID
                self.logger.info(
                    "repayment_recorded",
                    tx_hash=tx_hash,
                    draw_id=draw_id,
                    amount=str(amount),
                )

    # ------------------------------------------------------------------
    # RPC calls (scaffolded — replace with real Web3 calls)
    # ------------------------------------------------------------------

    @retry_with_backoff(
        max_retries=3,
        base_delay=1.0,
        max_delay=15.0,
        worker_name="chain_sync",
        task_name="get_latest_block",
    )
    async def _get_latest_block(self) -> int:
        """Get the latest block number from the chain."""
        await self._rate_limiter.acquire()
        from src.workers.observability.metrics import metrics as m

        async with self._circuit_breaker:
            # PRODUCTION: return await w3.eth.block_number
            m.record_rpc_call("chain_sync", "eth_blockNumber", success=True)
            return 0

    @retry_with_backoff(
        max_retries=3,
        base_delay=2.0,
        max_delay=30.0,
        worker_name="chain_sync",
        task_name="fetch_pool_events",
    )
    async def _fetch_pool_events(
        self, from_block: int, to_block: int
    ) -> list[dict[str, Any]]:
        """Fetch pool contract events from the blockchain.

        In production, this queries eth_getLogs for the pool contract's
        Deposit, Withdrawal, Borrow, and Repayment events.
        """
        await self._rate_limiter.acquire()
        from src.workers.observability.metrics import metrics as m

        async with self._circuit_breaker:
            # PRODUCTION:
            #   logs = await pool_contract.events.get_logs(
            #       from_block=from_block, to_block=to_block
            #   )
            #   return [_parse_pool_event(log) for log in logs]
            m.record_rpc_call("chain_sync", "eth_getLogs", success=True)
            return []

    # ------------------------------------------------------------------
    # Block cursor persistence
    # ------------------------------------------------------------------

    async def _get_cursor(self) -> int:
        raw = await self.redis.get(_CURSOR_KEY)
        return int(raw) if raw else 0

    async def _set_cursor(self, block: int) -> None:
        await self.redis.set(_CURSOR_KEY, str(block))
