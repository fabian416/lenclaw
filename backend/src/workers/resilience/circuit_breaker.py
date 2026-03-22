"""Circuit breaker for external calls (RPC nodes, APIs).

States: CLOSED -> OPEN -> HALF_OPEN -> CLOSED (or back to OPEN).

Usage:
    cb = CircuitBreaker("rpc_base", failure_threshold=5, recovery_timeout=60.0)
    async with cb:
        result = await call_rpc(...)
"""

from __future__ import annotations

import asyncio
import enum
import time
from types import TracebackType
from typing import Any

from src.workers.observability.metrics import metrics


class CircuitState(str, enum.Enum):
    CLOSED = "closed"
    OPEN = "open"
    HALF_OPEN = "half_open"


class CircuitBreakerOpenError(Exception):
    """Raised when a call is attempted while the circuit is open."""

    def __init__(self, name: str, recovery_at: float) -> None:
        remaining = max(0, recovery_at - time.monotonic())
        super().__init__(
            f"Circuit breaker '{name}' is OPEN. Recovery in {remaining:.1f}s."
        )
        self.name = name
        self.recovery_at = recovery_at


class CircuitBreaker:
    """Async-safe circuit breaker.

    Args:
        name: Identifier for this breaker (used in metrics / logs).
        failure_threshold: Number of consecutive failures before tripping open.
        recovery_timeout: Seconds to wait before transitioning to half-open.
        half_open_max_calls: Number of trial calls allowed in half-open state.
    """

    def __init__(
        self,
        name: str,
        *,
        failure_threshold: int = 5,
        recovery_timeout: float = 60.0,
        half_open_max_calls: int = 3,
    ) -> None:
        self.name = name
        self.failure_threshold = failure_threshold
        self.recovery_timeout = recovery_timeout
        self.half_open_max_calls = half_open_max_calls

        self._state = CircuitState.CLOSED
        self._failure_count: int = 0
        self._success_count: int = 0
        self._last_failure_time: float = 0.0
        self._half_open_calls: int = 0
        self._lock = asyncio.Lock()

        self._update_gauge()

    # ------------------------------------------------------------------
    # Public properties
    # ------------------------------------------------------------------

    @property
    def state(self) -> CircuitState:
        return self._state

    @property
    def failure_count(self) -> int:
        return self._failure_count

    # ------------------------------------------------------------------
    # Context manager interface
    # ------------------------------------------------------------------

    async def __aenter__(self) -> CircuitBreaker:
        await self._before_call()
        return self

    async def __aexit__(
        self,
        exc_type: type[BaseException] | None,
        exc_val: BaseException | None,
        exc_tb: TracebackType | None,
    ) -> bool:
        if exc_type is None:
            await self._on_success()
        else:
            await self._on_failure()
        # Never suppress exceptions.
        return False

    # ------------------------------------------------------------------
    # Callable decorator interface
    # ------------------------------------------------------------------

    def __call__(self, fn: Any) -> Any:
        """Use as a decorator: @circuit_breaker."""
        import functools

        @functools.wraps(fn)
        async def wrapper(*args: Any, **kwargs: Any) -> Any:
            async with self:
                return await fn(*args, **kwargs)

        return wrapper

    # ------------------------------------------------------------------
    # Internal state machine
    # ------------------------------------------------------------------

    async def _before_call(self) -> None:
        async with self._lock:
            if self._state == CircuitState.OPEN:
                if time.monotonic() >= self._last_failure_time + self.recovery_timeout:
                    self._transition(CircuitState.HALF_OPEN)
                else:
                    raise CircuitBreakerOpenError(
                        self.name,
                        self._last_failure_time + self.recovery_timeout,
                    )

            if self._state == CircuitState.HALF_OPEN:
                if self._half_open_calls >= self.half_open_max_calls:
                    raise CircuitBreakerOpenError(
                        self.name,
                        self._last_failure_time + self.recovery_timeout,
                    )
                self._half_open_calls += 1

    async def _on_success(self) -> None:
        async with self._lock:
            if self._state == CircuitState.HALF_OPEN:
                self._success_count += 1
                if self._success_count >= self.half_open_max_calls:
                    self._transition(CircuitState.CLOSED)
            else:
                self._failure_count = 0

    async def _on_failure(self) -> None:
        async with self._lock:
            self._last_failure_time = time.monotonic()

            if self._state == CircuitState.HALF_OPEN:
                self._transition(CircuitState.OPEN)
                return

            self._failure_count += 1
            if self._failure_count >= self.failure_threshold:
                self._transition(CircuitState.OPEN)

    def _transition(self, new_state: CircuitState) -> None:
        self._state = new_state
        if new_state == CircuitState.CLOSED:
            self._failure_count = 0
            self._success_count = 0
            self._half_open_calls = 0
        elif new_state == CircuitState.OPEN or new_state == CircuitState.HALF_OPEN:
            self._success_count = 0
            self._half_open_calls = 0
        self._update_gauge()

    def _update_gauge(self) -> None:
        state_val = {
            CircuitState.CLOSED: 0,
            CircuitState.OPEN: 1,
            CircuitState.HALF_OPEN: 2,
        }
        metrics.circuit_breaker_state.labels(name=self.name).set(state_val[self._state])

    # ------------------------------------------------------------------
    # Manual controls (useful for admin endpoints)
    # ------------------------------------------------------------------

    async def reset(self) -> None:
        """Force-reset the circuit breaker to CLOSED."""
        async with self._lock:
            self._transition(CircuitState.CLOSED)

    async def trip(self) -> None:
        """Force-trip the circuit breaker to OPEN."""
        async with self._lock:
            self._last_failure_time = time.monotonic()
            self._transition(CircuitState.OPEN)
