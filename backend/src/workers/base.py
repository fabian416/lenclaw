"""Base worker class with common patterns: logging, error handling, metrics, lifecycle.

All domain workers inherit from BaseWorker and implement ``execute()``.
"""

from __future__ import annotations

import asyncio
import time
import uuid
from abc import ABC, abstractmethod
from typing import Any

import redis.asyncio as aioredis
import structlog

from src.workers.config import WorkerSettings
from src.workers.observability.logging import (
    get_worker_logger,
    log_task_failure,
    log_task_start,
    log_task_success,
)
from src.workers.observability.metrics import metrics
from src.workers.resilience.circuit_breaker import (
    CircuitBreakerOpenError,
)
from src.workers.resilience.dead_letter import DeadLetterEntry, DeadLetterQueue


class BaseWorker(ABC):
    """Abstract base for all Lenclaw background workers.

    Subclasses must implement:
        - ``name`` class attribute  (e.g. ``"revenue_sync"``)
        - ``execute()`` coroutine   (the actual work)
    """

    name: str = "base"

    def __init__(
        self,
        settings: WorkerSettings,
        redis: aioredis.Redis,
        *,
        dead_letter_queue: DeadLetterQueue | None = None,
    ) -> None:
        self.settings = settings
        self.redis = redis
        self.dlq = dead_letter_queue or DeadLetterQueue(redis)
        self.logger: structlog.stdlib.BoundLogger = get_worker_logger(self.name)
        self._running = False
        self._task: asyncio.Task | None = None

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------

    async def start(self) -> None:
        """Mark the worker as running. Called by the scheduler."""
        self._running = True
        metrics.active_workers.labels(worker=self.name).set(1)
        self.logger.info("worker_started")

    async def stop(self) -> None:
        """Gracefully stop the worker."""
        self._running = False
        metrics.active_workers.labels(worker=self.name).set(0)
        self.logger.info("worker_stopped")

    @property
    def is_running(self) -> bool:
        return self._running

    # ------------------------------------------------------------------
    # Abstract
    # ------------------------------------------------------------------

    @abstractmethod
    async def execute(self) -> dict[str, Any]:
        """Perform the worker's task.

        Returns a dict of summary/result data that gets logged.
        """
        ...

    # ------------------------------------------------------------------
    # Run with instrumentation
    # ------------------------------------------------------------------

    async def run_once(self) -> dict[str, Any] | None:
        """Execute the task with full instrumentation (logging, metrics, error handling)."""
        task_id = str(uuid.uuid4())
        start = time.monotonic()

        log_task_start(self.logger, task_id)

        try:
            result = await self.execute()
            elapsed_ms = (time.monotonic() - start) * 1000
            elapsed_s = elapsed_ms / 1000

            log_task_success(self.logger, task_id, elapsed_ms, **result)
            metrics.record_task_success(self.name, self.name, elapsed_s)
            metrics.last_run_timestamp.labels(worker=self.name).set_to_current_time()

            return result

        except CircuitBreakerOpenError as exc:
            elapsed_ms = (time.monotonic() - start) * 1000
            log_task_failure(
                self.logger,
                task_id,
                error=str(exc),
                duration_ms=elapsed_ms,
                error_type="circuit_breaker_open",
            )
            metrics.record_task_failure(
                self.name, self.name, "circuit_breaker_open", elapsed_ms / 1000
            )
            return None

        except Exception as exc:
            elapsed_ms = (time.monotonic() - start) * 1000
            error_type = type(exc).__name__

            log_task_failure(
                self.logger,
                task_id,
                error=str(exc),
                duration_ms=elapsed_ms,
                error_type=error_type,
            )
            metrics.record_task_failure(
                self.name, self.name, error_type, elapsed_ms / 1000
            )

            # Push to dead letter queue
            await self._send_to_dlq(task_id, exc)

            return None

    async def _send_to_dlq(self, task_id: str, exc: Exception) -> None:
        """Send a failed task to the dead letter queue."""
        try:
            entry = DeadLetterEntry(
                id=task_id,
                task_name=self.name,
                worker_name=self.name,
                error=str(exc),
                error_type=type(exc).__name__,
            )
            await self.dlq.push(entry, queue=self.name)
        except Exception as dlq_exc:
            self.logger.error(
                "dlq_push_failed",
                task_id=task_id,
                error=str(dlq_exc),
            )

    # ------------------------------------------------------------------
    # Health check
    # ------------------------------------------------------------------

    async def health(self) -> dict[str, Any]:
        """Return a health-check payload for this worker."""
        return {
            "worker": self.name,
            "running": self._running,
            "dlq_size": await self.dlq.size(queue=self.name),
        }
