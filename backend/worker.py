#!/usr/bin/env python3
"""Lenclaw worker CLI entrypoint.

Usage:
    python3 worker.py --workers all
    python3 worker.py --workers revenue_sync,monitoring
    python3 worker.py --workers chain_sync --no-json
    python3 worker.py --list
"""

from __future__ import annotations

import argparse
import asyncio
import sys


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="lenclaw-worker",
        description="Lenclaw background worker process",
    )
    parser.add_argument(
        "--workers",
        type=str,
        default="all",
        help=(
            'Comma-separated list of workers to run, or "all". '
            "Available: revenue_sync, credit_scoring, monitoring, chain_sync"
        ),
    )
    parser.add_argument(
        "--no-json",
        action="store_true",
        default=False,
        help="Use coloured console logging instead of JSON (for local dev).",
    )
    parser.add_argument(
        "--list",
        action="store_true",
        default=False,
        help="List available workers and exit.",
    )
    return parser


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()

    # Lazy import so --help is fast even if deps are missing.
    from src.workers.scheduler import WORKER_REGISTRY, WorkerScheduler, resolve_worker_names

    if args.list:
        print("Available workers:")
        for name in sorted(WORKER_REGISTRY.keys()):
            print(f"  - {name}")
        sys.exit(0)

    try:
        worker_names = resolve_worker_names(args.workers)
    except ValueError as exc:
        print(f"Error: {exc}", file=sys.stderr)
        sys.exit(1)

    print(f"Starting Lenclaw workers: {', '.join(worker_names)}")

    scheduler = WorkerScheduler(
        worker_names,
        json_logging=not args.no_json,
    )

    try:
        asyncio.run(scheduler.start())
    except KeyboardInterrupt:
        print("\nShutdown complete.")


if __name__ == "__main__":
    main()
