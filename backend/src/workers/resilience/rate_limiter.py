"""Token bucket rate limiter for throttling RPC and API calls.

Usage:
    limiter = TokenBucketRateLimiter(rate=10.0, burst=20)
    await limiter.acquire()          # blocks until a token is available
    if limiter.try_acquire():        # non-blocking check
        ...
"""

from __future__ import annotations

import asyncio
import time


class RateLimitExceeded(Exception):
    """Raised when a non-blocking acquire finds no tokens available."""


class TokenBucketRateLimiter:
    """Async-safe token bucket rate limiter.

    Args:
        rate: Tokens added per second.
        burst: Maximum number of tokens that can accumulate.
    """

    def __init__(self, rate: float, burst: int) -> None:
        if rate <= 0:
            raise ValueError("rate must be positive")
        if burst <= 0:
            raise ValueError("burst must be positive")

        self.rate = rate
        self.burst = burst
        self._tokens: float = float(burst)
        self._last_refill: float = time.monotonic()
        self._lock = asyncio.Lock()

    def _refill(self) -> None:
        """Add tokens based on elapsed time since last refill."""
        now = time.monotonic()
        elapsed = now - self._last_refill
        self._tokens = min(self.burst, self._tokens + elapsed * self.rate)
        self._last_refill = now

    async def acquire(self, tokens: int = 1) -> None:
        """Wait until ``tokens`` tokens are available, then consume them.

        This method blocks (via asyncio.sleep) if the bucket is empty.
        """
        while True:
            async with self._lock:
                self._refill()
                if self._tokens >= tokens:
                    self._tokens -= tokens
                    return
                # Calculate how long we need to wait for enough tokens.
                deficit = tokens - self._tokens
                wait_time = deficit / self.rate

            await asyncio.sleep(wait_time)

    def try_acquire(self, tokens: int = 1) -> bool:
        """Try to consume tokens without blocking.

        Returns True if tokens were consumed, False otherwise.

        Note: This is *not* async-safe by itself. For concurrent access,
        prefer :meth:`acquire`.
        """
        self._refill()
        if self._tokens >= tokens:
            self._tokens -= tokens
            return True
        return False

    @property
    def available_tokens(self) -> float:
        """Current number of available tokens (approximate)."""
        self._refill()
        return self._tokens
