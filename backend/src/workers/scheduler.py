"""Periodic task scheduler for Lenclaw workers.

Manages the lifecycle of all background workers, running each on its
configured interval:
    - revenue_sync   every 5 min
    - credit_scoring  every 1 hour
    - monitoring      every 15 min
    - chain_sync      every 1 min

Supports graceful shutdown on SIGTERM/SIGINT.
"""

from __future__ import annotations

import asyncio
import signal
from typing import Any

import redis.asyncio as aioredis

from src.common.config import load_settings
from src.db.session import init_db
from src.workers.base import BaseWorker
from src.workers.chain_sync_worker import ChainSyncWorker
from src.workers.config import WorkerSettings, load_worker_settings
from src.workers.credit_scoring_worker import CreditScoringWorker
from src.workers.monitoring_worker import MonitoringWorker
from src.workers.observability.logging import (
    configure_worker_logging,
    get_worker_logger,
)
from src.workers.resilience.dead_letter import DeadLetterQueue
from src.workers.revenue_sync_worker import RevenueSyncWorker

logger = get_worker_logger("scheduler")

# Map of worker names to their classes and schedule config keys
WORKER_REGISTRY: dict[str, type[BaseWorker]] = {
    "revenue_sync": RevenueSyncWorker,
    "credit_scoring": CreditScoringWorker,
    "monitoring": MonitoringWorker,
    "chain_sync": ChainSyncWorker,
}

SCHEDULE_MAP: dict[str, str] = {
    "revenue_sync": "revenue_sync_interval",
    "credit_scoring": "credit_scoring_interval",
    "monitoring": "monitoring_interval",
    "chain_sync": "chain_sync_interval",
}


class WorkerScheduler:
    """Orchestrates periodic execution of all selected workers."""

    def __init__(
        self,
        worker_names: list[str],
        *,
        settings: WorkerSettings | None = None,
        json_logging: bool = True,
    ) -> None:
        self._worker_names = worker_names
        self._settings = settings or load_worker_settings()
        self._json_logging = json_logging
        self._workers: dict[str, BaseWorker] = {}
        self._tasks: dict[str, asyncio.Task] = {}
        self._shutdown_event = asyncio.Event()
        self._redis: aioredis.Redis | None = None
        self._dlq: DeadLetterQueue | None = None

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    async def start(self) -> None:
        """Initialize resources and start all worker loops."""
        configure_worker_logging(
            json_output=self._json_logging,
            log_level="DEBUG" if load_settings().debug else "INFO",
        )

        # Initialize database
        app_settings = load_settings()
        init_db(app_settings.database)
        logger.info("database_initialized", env=str(app_settings.env))

        # Connect to Redis
        self._redis = aioredis.from_url(
            self._settings.redis.url,
            max_connections=self._settings.redis.max_connections,
            socket_timeout=self._settings.redis.socket_timeout,
            socket_connect_timeout=self._settings.redis.socket_connect_timeout,
            decode_responses=True,
        )
        await self._redis.ping()
        logger.info("redis_connected", url=self._settings.redis.url)

        # Dead letter queue shared by all workers
        self._dlq = DeadLetterQueue(self._redis)

        # Instantiate workers
        for name in self._worker_names:
            worker_cls = WORKER_REGISTRY.get(name)
            if worker_cls is None:
                logger.warning("unknown_worker", worker_name=name)
                continue

            worker = worker_cls(
                self._settings,
                self._redis,
                dead_letter_queue=self._dlq,
            )
            await worker.start()
            self._workers[name] = worker

        # Install signal handlers
        loop = asyncio.get_running_loop()
        for sig in (signal.SIGTERM, signal.SIGINT):
            loop.add_signal_handler(sig, self._handle_signal, sig)

        # Launch periodic loops
        for name, worker in self._workers.items():
            interval_attr = SCHEDULE_MAP.get(name)
            interval = (
                getattr(self._settings.schedule, interval_attr, 60)
                if interval_attr
                else 60
            )
            task = asyncio.create_task(
                self._run_loop(worker, interval),
                name=f"worker-{name}",
            )
            self._tasks[name] = task

        logger.info(
            "scheduler_started",
            workers=list(self._workers.keys()),
            worker_count=len(self._workers),
        )

        # Wait for shutdown signal
        await self._shutdown_event.wait()
        await self._shutdown()

    async def stop(self) -> None:
        """Trigger graceful shutdown from outside."""
        self._shutdown_event.set()

    # ------------------------------------------------------------------
    # Worker health (for API endpoint)
    # ------------------------------------------------------------------

    async def get_health(self) -> dict[str, Any]:
        """Return health status for all workers."""
        worker_health = {}
        for name, worker in self._workers.items():
            worker_health[name] = await worker.health()
        return {
            "scheduler": "running" if not self._shutdown_event.is_set() else "stopping",
            "workers": worker_health,
        }

    # ------------------------------------------------------------------
    # Internal
    # ------------------------------------------------------------------

    async def _run_loop(self, worker: BaseWorker, interval: int) -> None:
        """Run a worker periodically until shutdown."""
        while not self._shutdown_event.is_set():
            await worker.run_once()

            # Sleep in small increments so we can react to shutdown quickly.
            elapsed = 0.0
            while elapsed < interval and not self._shutdown_event.is_set():
                sleep_chunk = min(1.0, interval - elapsed)
                await asyncio.sleep(sleep_chunk)
                elapsed += sleep_chunk

    def _handle_signal(self, sig: signal.Signals) -> None:
        logger.info("signal_received", signal=sig.name)
        self._shutdown_event.set()

    async def _shutdown(self) -> None:
        """Stop all workers and clean up resources."""
        logger.info("scheduler_shutting_down")

        # Cancel worker tasks
        for name, task in self._tasks.items():
            task.cancel()

        # Wait for tasks to finish (with timeout)
        if self._tasks:
            await asyncio.wait(
                self._tasks.values(),
                timeout=self._settings.graceful_shutdown_timeout,
            )

        # Stop workers
        for worker in self._workers.values():
            await worker.stop()

        # Close Redis
        if self._redis is not None:
            await self._redis.aclose()

        logger.info("scheduler_stopped")


def resolve_worker_names(raw: str) -> list[str]:
    """Parse CLI ``--workers`` argument into a list of worker names.

    Accepts:
        ``"all"`` -> all registered workers
        ``"revenue_sync,monitoring"`` -> specific subset
    """
    if raw.strip().lower() == "all":
        return list(WORKER_REGISTRY.keys())

    names = [n.strip() for n in raw.split(",") if n.strip()]
    unknown = set(names) - set(WORKER_REGISTRY.keys())
    if unknown:
        raise ValueError(
            f"Unknown worker(s): {', '.join(sorted(unknown))}. "
            f"Available: {', '.join(sorted(WORKER_REGISTRY.keys()))}"
        )
    return names
