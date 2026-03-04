"""Observability layer for the Lenclaw worker system.

Provides structured JSON logging via structlog and Prometheus metrics
(counters, histograms, gauges).
"""

from src.workers.observability.logging import configure_worker_logging, get_worker_logger
from src.workers.observability.metrics import WorkerMetrics

__all__ = [
    "configure_worker_logging",
    "get_worker_logger",
    "WorkerMetrics",
]
