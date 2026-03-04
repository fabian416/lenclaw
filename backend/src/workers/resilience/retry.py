"""Exponential backoff retry decorator with jitter.

Usage:
    @retry_with_backoff(max_retries=5, base_delay=1.0, max_delay=60.0)
    async def flaky_rpc_call():
        ...
"""

from __future__ import annotations

import asyncio
import functools
import random
from typing import Any, Callable, Type

from src.workers.observability.metrics import metrics


def retry_with_backoff(
    *,
    max_retries: int = 5,
    base_delay: float = 1.0,
    max_delay: float = 60.0,
    exponential_base: float = 2.0,
    retryable_exceptions: tuple[Type[BaseException], ...] = (Exception,),
    worker_name: str = "unknown",
    task_name: str = "unknown",
) -> Callable:
    """Decorator that retries an async function with exponential backoff + jitter.

    The delay between attempts follows: min(max_delay, base_delay * exponential_base^attempt)
    plus a random jitter of [0, base_delay) seconds.

    Args:
        max_retries: Maximum number of retry attempts (0 = no retries, only the original call).
        base_delay: Initial delay in seconds before the first retry.
        max_delay: Upper cap on the delay between retries.
        exponential_base: Multiplier for exponential growth.
        retryable_exceptions: Tuple of exception types that trigger a retry.
        worker_name: Used for metric labels.
        task_name: Used for metric labels.
    """

    def decorator(fn: Callable) -> Callable:
        @functools.wraps(fn)
        async def wrapper(*args: Any, **kwargs: Any) -> Any:
            last_exc: BaseException | None = None

            for attempt in range(max_retries + 1):
                try:
                    return await fn(*args, **kwargs)
                except retryable_exceptions as exc:
                    last_exc = exc

                    if attempt >= max_retries:
                        break

                    delay = min(
                        max_delay,
                        base_delay * (exponential_base ** attempt),
                    )
                    # Full jitter: actual delay = random [0, delay)
                    jitter = random.uniform(0, base_delay)
                    sleep_time = delay + jitter

                    metrics.retries_total.labels(
                        worker=worker_name, task=task_name
                    ).inc()

                    await asyncio.sleep(sleep_time)

            # All retries exhausted — re-raise the last exception.
            raise last_exc  # type: ignore[misc]

        # Attach metadata so callers can inspect retry config.
        wrapper._retry_config = {  # type: ignore[attr-defined]
            "max_retries": max_retries,
            "base_delay": base_delay,
            "max_delay": max_delay,
            "exponential_base": exponential_base,
        }
        return wrapper

    return decorator
