"""Dead letter queue for permanently failed tasks.

Stores failed task metadata in Redis so administrators can inspect and
replay them later.
"""

from __future__ import annotations

import json
import time
import uuid
from dataclasses import asdict, dataclass, field
from typing import Any

import redis.asyncio as aioredis

from src.workers.observability.metrics import metrics


@dataclass
class DeadLetterEntry:
    """A single dead-letter record."""

    id: str = field(default_factory=lambda: str(uuid.uuid4()))
    task_name: str = ""
    worker_name: str = ""
    args: list[Any] = field(default_factory=list)
    kwargs: dict[str, Any] = field(default_factory=dict)
    error: str = ""
    error_type: str = ""
    retry_count: int = 0
    timestamp: float = field(default_factory=time.time)

    def to_json(self) -> str:
        return json.dumps(asdict(self))

    @classmethod
    def from_json(cls, raw: str | bytes) -> DeadLetterEntry:
        data = json.loads(raw)
        return cls(**data)


class DeadLetterQueue:
    """Redis-backed dead letter queue.

    Each queue is stored as a Redis list under ``{key_prefix}:{queue_name}``.
    """

    def __init__(
        self,
        redis: aioredis.Redis,
        *,
        key_prefix: str = "lenclaw:dlq",
        max_entries: int = 10_000,
    ) -> None:
        self._redis = redis
        self._key_prefix = key_prefix
        self._max_entries = max_entries

    def _key(self, queue: str = "default") -> str:
        return f"{self._key_prefix}:{queue}"

    async def push(
        self,
        entry: DeadLetterEntry,
        queue: str = "default",
    ) -> None:
        """Push a failed task entry onto the dead letter queue."""
        key = self._key(queue)
        await self._redis.lpush(key, entry.to_json())

        # Trim to max_entries to avoid unbounded growth.
        await self._redis.ltrim(key, 0, self._max_entries - 1)

        metrics.dead_letter_total.labels(
            worker=entry.worker_name, task=entry.task_name
        ).inc()

    async def pop(self, queue: str = "default") -> DeadLetterEntry | None:
        """Pop the oldest entry from the dead letter queue."""
        key = self._key(queue)
        raw = await self._redis.rpop(key)
        if raw is None:
            return None
        return DeadLetterEntry.from_json(raw)

    async def peek(
        self, queue: str = "default", count: int = 50
    ) -> list[DeadLetterEntry]:
        """Inspect the most recent entries without removing them."""
        key = self._key(queue)
        raw_list = await self._redis.lrange(key, 0, count - 1)
        return [DeadLetterEntry.from_json(r) for r in raw_list]

    async def size(self, queue: str = "default") -> int:
        """Return the number of entries in the dead letter queue."""
        return await self._redis.llen(self._key(queue))

    async def clear(self, queue: str = "default") -> int:
        """Remove all entries from the dead letter queue. Returns count deleted."""
        key = self._key(queue)
        count = await self._redis.llen(key)
        await self._redis.delete(key)
        return count

    async def replay_one(self, queue: str = "default") -> DeadLetterEntry | None:
        """Pop the oldest entry for replay. The caller is responsible for
        re-submitting the task to the appropriate worker."""
        return await self.pop(queue)
