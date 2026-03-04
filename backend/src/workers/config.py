"""Worker configuration — Redis URL, concurrency, queue names, and schedule intervals."""

from __future__ import annotations

from pydantic import BaseModel

from src.common.config import load_settings


class RedisSettings(BaseModel):
    url: str = "redis://localhost:6379/0"
    max_connections: int = 20
    socket_timeout: float = 5.0
    socket_connect_timeout: float = 5.0


class QueueSettings(BaseModel):
    default: str = "lenclaw:default"
    revenue_sync: str = "lenclaw:revenue_sync"
    credit_scoring: str = "lenclaw:credit_scoring"
    monitoring: str = "lenclaw:monitoring"
    chain_sync: str = "lenclaw:chain_sync"
    dead_letter: str = "lenclaw:dead_letter"


class ScheduleSettings(BaseModel):
    """Intervals in seconds for periodic tasks."""

    revenue_sync_interval: int = 300       # 5 minutes
    credit_scoring_interval: int = 3600    # 1 hour
    monitoring_interval: int = 900         # 15 minutes
    chain_sync_interval: int = 60          # 1 minute


class ConcurrencySettings(BaseModel):
    revenue_sync: int = 4
    credit_scoring: int = 2
    monitoring: int = 2
    chain_sync: int = 4


class CircuitBreakerSettings(BaseModel):
    failure_threshold: int = 5
    recovery_timeout: float = 60.0
    half_open_max_calls: int = 3


class RetrySettings(BaseModel):
    max_retries: int = 5
    base_delay: float = 1.0
    max_delay: float = 60.0
    exponential_base: float = 2.0


class RateLimiterSettings(BaseModel):
    rpc_rate: float = 10.0       # tokens per second
    rpc_burst: int = 20          # max burst
    api_rate: float = 50.0
    api_burst: int = 100


class WorkerSettings(BaseModel):
    redis: RedisSettings = RedisSettings()
    queues: QueueSettings = QueueSettings()
    schedule: ScheduleSettings = ScheduleSettings()
    concurrency: ConcurrencySettings = ConcurrencySettings()
    circuit_breaker: CircuitBreakerSettings = CircuitBreakerSettings()
    retry: RetrySettings = RetrySettings()
    rate_limiter: RateLimiterSettings = RateLimiterSettings()
    graceful_shutdown_timeout: float = 30.0


def load_worker_settings() -> WorkerSettings:
    """Load worker settings from the app config TOML file.

    Looks for a [workers] section in config.toml. Falls back to defaults
    if the section is missing.
    """
    from src.common.config import CONFIG_DIR, get_current_env, _load_toml

    env = get_current_env()
    config_path = CONFIG_DIR / env / "config.toml"

    if config_path.is_file():
        raw = _load_toml(config_path)
        workers_block = raw.get("workers", {})
        if workers_block:
            return WorkerSettings.model_validate(workers_block)

    return WorkerSettings()
