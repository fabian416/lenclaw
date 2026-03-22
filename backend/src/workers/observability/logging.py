"""Structured JSON logging for the worker system using structlog.

Every log entry includes: timestamp, level, worker_name, task_id, duration_ms, error.
"""

from __future__ import annotations

import logging
import sys
from typing import Any

import structlog


def configure_worker_logging(
    *, json_output: bool = True, log_level: str = "INFO"
) -> None:
    """Configure structlog for worker processes.

    Args:
        json_output: If True, emit newline-delimited JSON. Otherwise use
            coloured console output (useful for local development).
        log_level: Root log level string (DEBUG, INFO, WARNING, ERROR).
    """
    shared_processors: list[structlog.types.Processor] = [
        structlog.contextvars.merge_contextvars,
        structlog.stdlib.add_log_level,
        structlog.stdlib.add_logger_name,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.StackInfoRenderer(),
        structlog.processors.UnicodeDecoder(),
    ]

    if json_output:
        renderer: structlog.types.Processor = structlog.processors.JSONRenderer()
    else:
        renderer = structlog.dev.ConsoleRenderer()

    structlog.configure(
        processors=[
            *shared_processors,
            structlog.stdlib.ProcessorFormatter.wrap_for_formatter,
        ],
        logger_factory=structlog.stdlib.LoggerFactory(),
        wrapper_class=structlog.stdlib.BoundLogger,
        cache_logger_on_first_use=True,
    )

    formatter = structlog.stdlib.ProcessorFormatter(
        processors=[
            structlog.stdlib.ProcessorFormatter.remove_processors_meta,
            renderer,
        ],
    )

    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(formatter)

    root_logger = logging.getLogger()
    root_logger.handlers.clear()
    root_logger.addHandler(handler)
    root_logger.setLevel(getattr(logging, log_level.upper(), logging.INFO))

    # Reduce noise from third-party libraries
    for noisy in ("asyncio", "sqlalchemy.engine", "httpx", "httpcore", "web3"):
        logging.getLogger(noisy).setLevel(logging.WARNING)


def get_worker_logger(worker_name: str) -> structlog.stdlib.BoundLogger:
    """Return a structlog logger pre-bound with the worker name."""
    return structlog.get_logger(worker_name).bind(worker_name=worker_name)


def log_task_start(
    logger: structlog.stdlib.BoundLogger,
    task_id: str,
    **extra: Any,
) -> None:
    """Log the start of a task execution."""
    logger.info("task_started", task_id=task_id, **extra)


def log_task_success(
    logger: structlog.stdlib.BoundLogger,
    task_id: str,
    duration_ms: float,
    **extra: Any,
) -> None:
    """Log successful task completion."""
    logger.info(
        "task_completed", task_id=task_id, duration_ms=round(duration_ms, 2), **extra
    )


def log_task_failure(
    logger: structlog.stdlib.BoundLogger,
    task_id: str,
    error: str,
    duration_ms: float,
    **extra: Any,
) -> None:
    """Log a task failure."""
    logger.error(
        "task_failed",
        task_id=task_id,
        error=error,
        duration_ms=round(duration_ms, 2),
        **extra,
    )
