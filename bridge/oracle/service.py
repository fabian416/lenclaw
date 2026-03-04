"""Oracle service - aggregates connector data, validates revenue, signs attestations."""

from __future__ import annotations

import hashlib
import json
import logging
import time
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any

from eth_account import Account
from eth_account.messages import encode_defunct

from bridge.connectors.base_connector import BaseConnector, ConnectorError, Transaction
from bridge.oracle.config import OracleConfig

logger = logging.getLogger(__name__)


@dataclass
class RevenueAttestation:
    """A signed attestation of revenue from the oracle."""

    agent_id: str
    total_amount: Decimal
    currency: str
    transaction_count: int
    period_start: datetime
    period_end: datetime
    connector_source: str
    data_hash: str
    signature: str = ""
    signer_address: str = ""
    timestamp: float = 0.0
    nonce: int = 0

    def to_dict(self) -> dict[str, Any]:
        return {
            "agent_id": self.agent_id,
            "total_amount": str(self.total_amount),
            "currency": self.currency,
            "transaction_count": self.transaction_count,
            "period_start": self.period_start.isoformat(),
            "period_end": self.period_end.isoformat(),
            "connector_source": self.connector_source,
            "data_hash": self.data_hash,
            "signature": self.signature,
            "signer_address": self.signer_address,
            "timestamp": self.timestamp,
            "nonce": self.nonce,
        }


@dataclass
class AggregatedRevenue:
    """Revenue aggregated across one or more connectors for a single agent."""

    agent_id: str
    total_amount: Decimal = Decimal("0")
    currency: str = "USD"
    transaction_count: int = 0
    sources: list[str] = field(default_factory=list)
    transactions: list[Transaction] = field(default_factory=list)
    period_start: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    period_end: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    errors: list[str] = field(default_factory=list)


class OracleService:
    """Aggregates data from connectors, validates revenue, signs attestations."""

    def __init__(self, config: OracleConfig) -> None:
        self.config = config
        self._connectors: dict[str, tuple[BaseConnector, str]] = {}
        # Map: connector_key -> (connector_instance, agent_id)
        self._nonce_counter: int = 0

    def register_connector(
        self,
        key: str,
        connector: BaseConnector,
        agent_id: str,
    ) -> None:
        """Register a connector instance for an agent."""
        self._connectors[key] = (connector, agent_id)
        logger.info(
            "Registered connector key=%s type=%s agent=%s",
            key,
            connector.connector_type.value,
            agent_id,
        )

    def unregister_connector(self, key: str) -> None:
        """Remove a connector registration."""
        if key in self._connectors:
            del self._connectors[key]
            logger.info("Unregistered connector key=%s", key)

    def get_agent_ids(self) -> set[str]:
        """Return the set of all agent IDs with registered connectors."""
        return {agent_id for _, agent_id in self._connectors.values()}

    # ------------------------------------------------------------------
    # Aggregation
    # ------------------------------------------------------------------

    async def aggregate_revenue(
        self,
        agent_id: str,
        since: datetime,
        until: datetime | None = None,
    ) -> AggregatedRevenue:
        """Pull transactions from all connectors for an agent and aggregate."""
        if until is None:
            until = datetime.now(timezone.utc)

        result = AggregatedRevenue(
            agent_id=agent_id,
            period_start=since,
            period_end=until,
        )

        for key, (connector, cid) in self._connectors.items():
            if cid != agent_id:
                continue

            try:
                if not connector.is_connected:
                    await connector.connect()

                txns = await connector.fetch_transactions(since, until)
                result.transactions.extend(txns)
                result.sources.append(connector.connector_type.value)

                for txn in txns:
                    result.total_amount += txn.net_amount
                    result.transaction_count += 1

            except ConnectorError as exc:
                error_msg = f"Connector {key} ({connector.connector_type.value}): {exc}"
                result.errors.append(error_msg)
                logger.warning("Aggregation error: %s", error_msg)

        if result.sources:
            result.currency = "USD"  # Normalised to USD

        logger.info(
            "Aggregated revenue for agent=%s: total=%s txn_count=%d sources=%s errors=%d",
            agent_id,
            result.total_amount,
            result.transaction_count,
            result.sources,
            len(result.errors),
        )
        return result

    # ------------------------------------------------------------------
    # Validation
    # ------------------------------------------------------------------

    def validate_revenue(self, aggregated: AggregatedRevenue) -> bool:
        """Basic validation of aggregated revenue data."""
        if aggregated.total_amount < 0:
            logger.warning("Negative revenue amount for agent=%s", aggregated.agent_id)
            return False

        if aggregated.transaction_count == 0:
            logger.info("No transactions for agent=%s", aggregated.agent_id)
            return False

        min_amount = Decimal(str(self.config.min_report_amount_usd))
        if aggregated.total_amount < min_amount:
            logger.info(
                "Revenue below minimum for agent=%s: %s < %s",
                aggregated.agent_id,
                aggregated.total_amount,
                min_amount,
            )
            return False

        # Check for duplicate transaction IDs
        seen_ids: set[str] = set()
        for txn in aggregated.transactions:
            if txn.id in seen_ids:
                logger.warning(
                    "Duplicate transaction id=%s for agent=%s",
                    txn.id,
                    aggregated.agent_id,
                )
                return False
            seen_ids.add(txn.id)

        return True

    # ------------------------------------------------------------------
    # Signing
    # ------------------------------------------------------------------

    def compute_data_hash(self, aggregated: AggregatedRevenue) -> str:
        """Compute a deterministic hash of the revenue data."""
        txn_ids = sorted(t.id for t in aggregated.transactions)
        payload = {
            "agent_id": aggregated.agent_id,
            "total_amount": str(aggregated.total_amount),
            "currency": aggregated.currency,
            "transaction_count": aggregated.transaction_count,
            "period_start": aggregated.period_start.isoformat(),
            "period_end": aggregated.period_end.isoformat(),
            "transaction_ids": txn_ids,
        }
        canonical = json.dumps(payload, sort_keys=True, separators=(",", ":"))
        return "0x" + hashlib.sha256(canonical.encode()).hexdigest()

    def sign_attestation(self, aggregated: AggregatedRevenue) -> RevenueAttestation:
        """Create and sign a revenue attestation."""
        private_key = self.config.chain.oracle_private_key
        if not private_key:
            raise ValueError("Oracle private key not configured")

        data_hash = self.compute_data_hash(aggregated)
        self._nonce_counter += 1

        attestation = RevenueAttestation(
            agent_id=aggregated.agent_id,
            total_amount=aggregated.total_amount,
            currency=aggregated.currency,
            transaction_count=aggregated.transaction_count,
            period_start=aggregated.period_start,
            period_end=aggregated.period_end,
            connector_source=",".join(aggregated.sources),
            data_hash=data_hash,
            timestamp=time.time(),
            nonce=self._nonce_counter,
        )

        # Sign the data hash using EIP-191
        message = encode_defunct(text=data_hash)
        key = private_key if private_key.startswith("0x") else f"0x{private_key}"
        signed = Account.sign_message(message, private_key=key)
        attestation.signature = signed.signature.hex()
        attestation.signer_address = Account.from_key(key).address

        logger.info(
            "Signed attestation for agent=%s amount=%s hash=%s",
            aggregated.agent_id,
            aggregated.total_amount,
            data_hash,
        )
        return attestation

    # ------------------------------------------------------------------
    # Full pipeline
    # ------------------------------------------------------------------

    async def process_agent(
        self,
        agent_id: str,
        since: datetime,
        until: datetime | None = None,
    ) -> RevenueAttestation | None:
        """Full pipeline: aggregate, validate, sign. Returns None if nothing to report."""
        aggregated = await self.aggregate_revenue(agent_id, since, until)

        if not self.validate_revenue(aggregated):
            return None

        attestation = self.sign_attestation(aggregated)
        return attestation
