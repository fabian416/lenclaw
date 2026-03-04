"""Prometheus metrics for the Lenclaw worker system.

Exposes counters, histograms, and gauges that can be scraped by Prometheus
or pushed to a gateway.
"""

from __future__ import annotations

from prometheus_client import (
    CollectorRegistry,
    Counter,
    Gauge,
    Histogram,
    generate_latest,
)


class WorkerMetrics:
    """Centralised metrics registry for all worker instrumentation."""

    def __init__(self, registry: CollectorRegistry | None = None) -> None:
        self.registry = registry or CollectorRegistry()

        # --- Counters -----------------------------------------------------------
        self.tasks_processed_total = Counter(
            "lenclaw_worker_tasks_processed_total",
            "Total number of tasks processed",
            labelnames=["worker", "task"],
            registry=self.registry,
        )

        self.tasks_failed_total = Counter(
            "lenclaw_worker_tasks_failed_total",
            "Total number of tasks that failed",
            labelnames=["worker", "task", "error_type"],
            registry=self.registry,
        )

        self.rpc_calls_total = Counter(
            "lenclaw_worker_rpc_calls_total",
            "Total RPC calls made to blockchain nodes",
            labelnames=["worker", "method", "status"],
            registry=self.registry,
        )

        self.retries_total = Counter(
            "lenclaw_worker_retries_total",
            "Total number of task retries",
            labelnames=["worker", "task"],
            registry=self.registry,
        )

        self.dead_letter_total = Counter(
            "lenclaw_worker_dead_letter_total",
            "Tasks moved to the dead letter queue",
            labelnames=["worker", "task"],
            registry=self.registry,
        )

        # --- Histograms ---------------------------------------------------------
        self.task_duration_seconds = Histogram(
            "lenclaw_worker_task_duration_seconds",
            "Duration of task execution in seconds",
            labelnames=["worker", "task"],
            buckets=(0.01, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0, 30.0, 60.0),
            registry=self.registry,
        )

        # --- Gauges --------------------------------------------------------------
        self.queue_depth = Gauge(
            "lenclaw_worker_queue_depth",
            "Current number of pending items in a queue",
            labelnames=["queue"],
            registry=self.registry,
        )

        self.circuit_breaker_state = Gauge(
            "lenclaw_worker_circuit_breaker_state",
            "Circuit breaker state: 0=closed, 1=open, 2=half-open",
            labelnames=["name"],
            registry=self.registry,
        )

        self.active_workers = Gauge(
            "lenclaw_worker_active_count",
            "Number of currently active worker instances",
            labelnames=["worker"],
            registry=self.registry,
        )

        self.last_run_timestamp = Gauge(
            "lenclaw_worker_last_run_timestamp",
            "Unix timestamp of the last successful run",
            labelnames=["worker"],
            registry=self.registry,
        )

    # ------------------------------------------------------------------
    # Convenience helpers
    # ------------------------------------------------------------------

    def record_task_success(
        self, worker: str, task: str, duration_seconds: float
    ) -> None:
        """Record a successful task execution."""
        self.tasks_processed_total.labels(worker=worker, task=task).inc()
        self.task_duration_seconds.labels(worker=worker, task=task).observe(
            duration_seconds
        )

    def record_task_failure(
        self, worker: str, task: str, error_type: str, duration_seconds: float
    ) -> None:
        """Record a failed task execution."""
        self.tasks_failed_total.labels(
            worker=worker, task=task, error_type=error_type
        ).inc()
        self.task_duration_seconds.labels(worker=worker, task=task).observe(
            duration_seconds
        )

    def record_rpc_call(self, worker: str, method: str, *, success: bool) -> None:
        """Record an RPC call."""
        status = "success" if success else "error"
        self.rpc_calls_total.labels(worker=worker, method=method, status=status).inc()

    def serialize(self) -> bytes:
        """Serialize all metrics to Prometheus exposition format."""
        return generate_latest(self.registry)


# Module-level singleton so all workers share one registry.
metrics = WorkerMetrics()
