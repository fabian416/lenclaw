"""Bridge daemon - long-running process that polls connectors, aggregates, and submits on-chain."""

from __future__ import annotations

import asyncio
import logging
import signal
import sys
from datetime import datetime, timedelta, timezone
from typing import Any

from bridge.connectors import ConnectorType, get_connector
from bridge.oracle.config import ConnectorCredentials, OracleConfig
from bridge.oracle.reporter import OracleReporter
from bridge.oracle.service import OracleService, RevenueAttestation

logger = logging.getLogger(__name__)


class BridgeDaemon:
    """Long-running daemon that periodically polls POS connectors,
    aggregates revenue, validates it, and submits on-chain attestations."""

    def __init__(self, config: OracleConfig) -> None:
        self.config = config
        self.oracle = OracleService(config)
        self.reporter = OracleReporter(config)
        self._running = False
        self._last_poll: dict[str, datetime] = {}
        # Track submitted attestations for idempotency
        self._submitted_hashes: set[str] = set()

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------

    async def start(self) -> None:
        """Initialise and start the daemon loop."""
        logger.info("Bridge daemon starting...")
        self._running = True

        # Set up signal handlers
        loop = asyncio.get_running_loop()
        for sig in (signal.SIGINT, signal.SIGTERM):
            loop.add_signal_handler(sig, lambda: asyncio.create_task(self.stop()))

        # Initialise reporter (web3 connection)
        try:
            await self.reporter.initialise()
        except Exception as exc:
            logger.error("Failed to initialise reporter: %s", exc)
            logger.warning("Daemon will run in attestation-only mode (no on-chain submission)")

        # Register connectors from config
        await self._register_connectors()

        # Main loop
        logger.info(
            "Daemon running. Poll interval: %ds. Registered agents: %s",
            self.config.poll_interval_seconds,
            self.oracle.get_agent_ids(),
        )

        while self._running:
            try:
                await self._poll_cycle()
            except Exception as exc:
                logger.error("Poll cycle error: %s", exc, exc_info=True)

            if self._running:
                await asyncio.sleep(self.config.poll_interval_seconds)

    async def stop(self) -> None:
        """Gracefully shut down the daemon."""
        logger.info("Bridge daemon stopping...")
        self._running = False

        # Disconnect all connectors
        for key, (connector, _) in list(self.oracle._connectors.items()):
            try:
                await connector.disconnect()
                logger.info("Disconnected connector: %s", key)
            except Exception as exc:
                logger.warning("Error disconnecting %s: %s", key, exc)

        await self.reporter.close()
        logger.info("Bridge daemon stopped.")

    # ------------------------------------------------------------------
    # Registration
    # ------------------------------------------------------------------

    async def _register_connectors(self) -> None:
        """Register connector instances from config."""
        for cred in self.config.connectors:
            try:
                connector_type = ConnectorType(cred.connector_type)
                connector = get_connector(
                    connector_type,
                    api_key=cred.api_key,
                    **cred.extra,
                )
                key = f"{cred.connector_type}:{cred.agent_id}"
                self.oracle.register_connector(key, connector, cred.agent_id)

                # Try to connect immediately
                await connector.connect()
                logger.info("Connector %s connected successfully.", key)

            except Exception as exc:
                logger.error(
                    "Failed to register connector type=%s agent=%s: %s",
                    cred.connector_type,
                    cred.agent_id,
                    exc,
                )

    def add_connector(
        self,
        connector_type: str,
        api_key: str,
        agent_id: str,
        **extra: Any,
    ) -> None:
        """Dynamically add a connector credential (will be registered on next cycle)."""
        cred = ConnectorCredentials(
            connector_type=connector_type,
            api_key=api_key,
            agent_id=agent_id,
            extra=extra,
        )
        self.config.connectors.append(cred)

    # ------------------------------------------------------------------
    # Poll cycle
    # ------------------------------------------------------------------

    async def _poll_cycle(self) -> None:
        """Execute one full poll-aggregate-submit cycle for all agents."""
        agent_ids = self.oracle.get_agent_ids()
        if not agent_ids:
            logger.debug("No agents registered, skipping poll cycle.")
            return

        logger.info("Poll cycle starting for %d agent(s).", len(agent_ids))

        for agent_id in agent_ids:
            await self._process_agent(agent_id)

        logger.info("Poll cycle complete.")

    async def _process_agent(self, agent_id: str) -> None:
        """Process a single agent: aggregate revenue and submit attestation."""
        # Determine poll window
        now = datetime.now(timezone.utc)
        since = self._last_poll.get(
            agent_id,
            now - timedelta(seconds=self.config.poll_interval_seconds),
        )

        try:
            attestation = await self.oracle.process_agent(agent_id, since, now)
        except Exception as exc:
            logger.error("Oracle processing failed for agent=%s: %s", agent_id, exc)
            return

        if attestation is None:
            logger.debug("No reportable revenue for agent=%s since %s", agent_id, since.isoformat())
            self._last_poll[agent_id] = now
            return

        # Idempotency check
        if attestation.data_hash in self._submitted_hashes:
            logger.info(
                "Attestation already submitted for hash=%s agent=%s",
                attestation.data_hash,
                agent_id,
            )
            self._last_poll[agent_id] = now
            return

        # Submit on-chain with retries
        submitted = await self._submit_with_retries(attestation)

        if submitted:
            self._submitted_hashes.add(attestation.data_hash)
            self._last_poll[agent_id] = now
            logger.info(
                "Revenue reported on-chain for agent=%s amount=%s",
                agent_id,
                attestation.total_amount,
            )
        else:
            logger.warning(
                "Failed to submit on-chain for agent=%s after retries",
                agent_id,
            )

    async def _submit_with_retries(
        self,
        attestation: RevenueAttestation,
    ) -> bool:
        """Submit attestation on-chain with exponential backoff retries."""
        for attempt in range(1, self.config.max_retries + 1):
            try:
                receipt = await self.reporter.submit_attestation(attestation)
                if receipt is None:
                    # No contract configured; attestation was logged
                    return True
                if receipt["status"] == 1:
                    return True
                logger.warning(
                    "Attestation tx reverted (attempt %d/%d)",
                    attempt,
                    self.config.max_retries,
                )
            except Exception as exc:
                logger.error(
                    "Submit attempt %d/%d failed: %s",
                    attempt,
                    self.config.max_retries,
                    exc,
                )

            if attempt < self.config.max_retries:
                backoff = self.config.retry_backoff_base * (2 ** (attempt - 1))
                logger.info("Retrying in %.1f seconds...", backoff)
                await asyncio.sleep(backoff)

        return False


# ------------------------------------------------------------------
# Entry point
# ------------------------------------------------------------------


async def run_daemon() -> None:
    """Entry point for running the bridge daemon."""
    config = OracleConfig.from_env()

    logging.basicConfig(
        level=getattr(logging, config.log_level, logging.INFO),
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    )

    daemon = BridgeDaemon(config)
    await daemon.start()


def main() -> None:
    """CLI entry point."""
    try:
        asyncio.run(run_daemon())
    except KeyboardInterrupt:
        logger.info("Daemon interrupted.")
        sys.exit(0)


if __name__ == "__main__":
    main()
