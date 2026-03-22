"""Bridge management service - backend logic for connector management and revenue queries."""

from __future__ import annotations

import logging
import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

from src.bridge.schemas import (
    BridgeRevenueReport,
    BridgeTransaction,
    ConnectorInfo,
    ConnectorListResponse,
    ConnectorStatus,
    ConnectorStatusEnum,
    ConnectorTypeEnum,
    ConnectResponse,
)

logger = logging.getLogger(__name__)


# ------------------------------------------------------------------
# In-memory connector registry (production would use DB + encrypted vault)
# ------------------------------------------------------------------


class _ConnectorRecord:
    """Tracks a registered connector for an agent."""

    __slots__ = (
        "agent_id",
        "api_key",
        "connected_at",
        "connector_type",
        "error_message",
        "extra",
        "last_sync_at",
        "merchant_id",
        "merchant_name",
        "status",
    )

    def __init__(
        self,
        agent_id: uuid.UUID,
        connector_type: ConnectorTypeEnum,
        api_key: str,
        **extra: Any,
    ) -> None:
        self.agent_id = agent_id
        self.connector_type = connector_type
        self.api_key = api_key
        self.status = ConnectorStatusEnum.DISCONNECTED
        self.merchant_name: str | None = None
        self.merchant_id: str | None = None
        self.connected_at: datetime | None = None
        self.last_sync_at: datetime | None = None
        self.error_message: str | None = None
        self.extra: dict[str, Any] = extra


# Global in-memory store (keyed by (agent_id, connector_type))
_connector_store: dict[tuple[uuid.UUID, ConnectorTypeEnum], _ConnectorRecord] = {}

# Supported connectors metadata
_AVAILABLE_CONNECTORS: list[ConnectorInfo] = [
    ConnectorInfo(
        type=ConnectorTypeEnum.STRIPE,
        name="Stripe",
        description="Accept payments via Stripe. Supports charges, subscriptions, and payouts.",
        supported_features=["charges", "subscriptions", "payouts", "balance"],
    ),
    ConnectorInfo(
        type=ConnectorTypeEnum.SQUARE,
        name="Square",
        description="Accept payments via Square POS. Supports in-person and online payments.",
        supported_features=["payments", "orders", "locations"],
    ),
    ConnectorInfo(
        type=ConnectorTypeEnum.MERCADOPAGO,
        name="MercadoPago",
        description="Accept payments via MercadoPago. Popular in Latin America.",
        supported_features=["payments", "collections", "balance"],
    ),
]


class BridgeService:
    """Manages POS connector lifecycle and revenue queries for the backend API."""

    # ------------------------------------------------------------------
    # Connector catalogue
    # ------------------------------------------------------------------

    async def list_connectors(
        self,
        agent_id: uuid.UUID | None = None,
    ) -> ConnectorListResponse:
        """List available connectors and those connected for a given agent."""
        connected: list[ConnectorStatus] = []

        for key, record in _connector_store.items():
            if agent_id is not None and record.agent_id != agent_id:
                continue
            connected.append(
                ConnectorStatus(
                    agent_id=record.agent_id,
                    connector_type=record.connector_type,
                    status=record.status,
                    merchant_name=record.merchant_name,
                    merchant_id=record.merchant_id,
                    connected_at=record.connected_at,
                    last_sync_at=record.last_sync_at,
                    error_message=record.error_message,
                )
            )

        return ConnectorListResponse(
            available=_AVAILABLE_CONNECTORS,
            connected=connected,
        )

    # ------------------------------------------------------------------
    # Connect / Disconnect
    # ------------------------------------------------------------------

    async def connect_connector(
        self,
        agent_id: uuid.UUID,
        connector_type: ConnectorTypeEnum,
        api_key: str,
        **extra: Any,
    ) -> ConnectResponse:
        """Register and validate a connector for an agent."""
        # Lazy import to avoid circular / heavy deps at module load
        from bridge.connectors import ConnectorType, get_connector

        key = (agent_id, connector_type)

        # Create connector instance and validate credentials
        try:
            bridge_type = ConnectorType(connector_type.value)
            connector = get_connector(bridge_type, api_key=api_key, **extra)
            await connector.connect()
            merchant = await connector.verify_merchant()
            await connector.disconnect()
        except Exception as exc:
            logger.error(
                "Failed to connect %s for agent=%s: %s",
                connector_type,
                agent_id,
                exc,
            )
            # Store the failed attempt
            record = _ConnectorRecord(agent_id, connector_type, api_key, **extra)
            record.status = ConnectorStatusEnum.ERROR
            record.error_message = str(exc)
            _connector_store[key] = record

            return ConnectResponse(
                status=ConnectorStatusEnum.ERROR,
                connector_type=connector_type,
                agent_id=agent_id,
                message=f"Connection failed: {exc}",
            )

        # Store successful connection
        record = _ConnectorRecord(agent_id, connector_type, api_key, **extra)
        record.status = ConnectorStatusEnum.CONNECTED
        record.merchant_name = merchant.name
        record.merchant_id = merchant.merchant_id
        record.connected_at = datetime.now(UTC)
        _connector_store[key] = record

        logger.info(
            "Connected %s for agent=%s merchant=%s",
            connector_type,
            agent_id,
            merchant.name,
        )

        return ConnectResponse(
            status=ConnectorStatusEnum.CONNECTED,
            connector_type=connector_type,
            agent_id=agent_id,
            merchant_name=merchant.name,
            merchant_id=merchant.merchant_id,
            message="Connector linked successfully.",
        )

    async def disconnect_connector(
        self,
        agent_id: uuid.UUID,
        connector_type: ConnectorTypeEnum,
    ) -> bool:
        """Remove a connector registration for an agent."""
        key = (agent_id, connector_type)
        if key in _connector_store:
            del _connector_store[key]
            logger.info("Disconnected %s for agent=%s", connector_type, agent_id)
            return True
        return False

    # ------------------------------------------------------------------
    # Revenue queries
    # ------------------------------------------------------------------

    async def get_bridge_revenue(
        self,
        agent_id: uuid.UUID,
        days: int = 30,
    ) -> BridgeRevenueReport:
        """Fetch and aggregate revenue from all connected connectors for an agent."""
        from bridge.connectors import ConnectorType, get_connector

        now = datetime.now(UTC)
        since = now - timedelta(days=days)

        report = BridgeRevenueReport(
            agent_id=agent_id,
            period_start=since,
            period_end=now,
        )

        # Gather transactions from all connected connectors for this agent
        for key, record in _connector_store.items():
            if record.agent_id != agent_id:
                continue
            if record.status != ConnectorStatusEnum.CONNECTED:
                continue

            try:
                bridge_type = ConnectorType(record.connector_type.value)
                connector = get_connector(
                    bridge_type,
                    api_key=record.api_key,
                    **record.extra,
                )
                await connector.connect()
                txns = await connector.fetch_transactions(since, now)
                await connector.disconnect()

                for txn in txns:
                    report.transactions.append(
                        BridgeTransaction(
                            id=txn.id,
                            amount=txn.amount,
                            currency=txn.currency,
                            timestamp=txn.timestamp,
                            source=txn.source,
                            status=txn.status,
                            fee=txn.fee,
                            net_amount=txn.net_amount,
                            description=txn.description,
                        )
                    )
                    report.total_revenue += txn.net_amount
                    report.transaction_count += 1

                if record.connector_type.value not in report.sources:
                    report.sources.append(record.connector_type.value)

                # Update last sync
                record.last_sync_at = now

            except Exception as exc:
                logger.error(
                    "Failed to fetch transactions from %s for agent=%s: %s",
                    record.connector_type,
                    agent_id,
                    exc,
                )
                record.error_message = str(exc)

        return report

    # ------------------------------------------------------------------
    # Status
    # ------------------------------------------------------------------

    async def get_agent_connector_status(
        self,
        agent_id: uuid.UUID,
    ) -> list[ConnectorStatus]:
        """Get the status of all connectors for an agent."""
        statuses: list[ConnectorStatus] = []
        for key, record in _connector_store.items():
            if record.agent_id != agent_id:
                continue
            statuses.append(
                ConnectorStatus(
                    agent_id=record.agent_id,
                    connector_type=record.connector_type,
                    status=record.status,
                    merchant_name=record.merchant_name,
                    merchant_id=record.merchant_id,
                    connected_at=record.connected_at,
                    last_sync_at=record.last_sync_at,
                    error_message=record.error_message,
                )
            )
        return statuses
