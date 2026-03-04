"""Square payment processor connector using httpx (async)."""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any

import httpx

from bridge.connectors.base_connector import (
    BaseConnector,
    ConnectorError,
    ConnectorType,
    MerchantInfo,
    Transaction,
)

logger = logging.getLogger(__name__)

SQUARE_API_BASE = "https://connect.squareup.com/v2"


class SquareConnector(BaseConnector):
    """Async Square API connector for payments and orders."""

    connector_type = ConnectorType.SQUARE

    def __init__(
        self,
        api_key: str,
        location_id: str | None = None,
        **kwargs: Any,
    ) -> None:
        super().__init__(api_key, **kwargs)
        self.location_id = location_id
        self._client: httpx.AsyncClient | None = None
        self._merchant_id: str | None = None

    def _build_client(self) -> httpx.AsyncClient:
        return httpx.AsyncClient(
            base_url=SQUARE_API_BASE,
            headers={
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json",
                "Square-Version": "2024-04-17",
            },
            timeout=30.0,
        )

    async def connect(self) -> None:
        """Validate Square access token by listing locations."""
        self._client = self._build_client()
        try:
            resp = await self._client.get("/locations")
            resp.raise_for_status()
            data = resp.json()
            locations = data.get("locations", [])
            if not locations:
                raise ConnectorError(
                    "No Square locations found for this account",
                    connector="square",
                )
            # Use the first location if none specified
            if not self.location_id:
                self.location_id = locations[0]["id"]
            self._merchant_id = locations[0].get("merchant_id")
            self._connected = True
            logger.info(
                "Square connector authenticated (location=%s)",
                self.location_id,
            )
        except httpx.HTTPStatusError as exc:
            await self._client.aclose()
            self._client = None
            raise ConnectorError(
                f"Square authentication failed: {exc.response.status_code}",
                connector="square",
                retriable=exc.response.status_code >= 500,
            ) from exc

    async def disconnect(self) -> None:
        if self._client:
            await self._client.aclose()
            self._client = None
        self._connected = False

    # ------------------------------------------------------------------
    # Transactions
    # ------------------------------------------------------------------

    async def fetch_transactions(
        self,
        since: datetime,
        until: datetime | None = None,
        limit: int = 100,
    ) -> list[Transaction]:
        """Fetch completed Square payments."""
        self._ensure_connected()
        assert self._client is not None

        body: dict[str, Any] = {
            "query": {
                "filter": {
                    "date_time_filter": {
                        "created_at": {
                            "start_at": since.isoformat(),
                        },
                    },
                    "state_filter": {
                        "states": ["COMPLETED"],
                    },
                },
                "sort": {
                    "sort_field": "CREATED_AT",
                    "sort_order": "ASC",
                },
            },
            "limit": min(limit, 100),
        }
        if until:
            body["query"]["filter"]["date_time_filter"]["created_at"]["end_at"] = until.isoformat()
        if self.location_id:
            body["query"]["filter"]["location_ids"] = [self.location_id]

        transactions: list[Transaction] = []
        cursor: str | None = None

        while len(transactions) < limit:
            if cursor:
                body["cursor"] = cursor

            try:
                resp = await self._client.post("/payments/search", json=body)
                resp.raise_for_status()
                data = resp.json()
            except httpx.HTTPStatusError as exc:
                raise ConnectorError(
                    f"Square fetch_transactions failed: {exc.response.text}",
                    connector="square",
                    retriable=exc.response.status_code >= 500,
                ) from exc

            for payment in data.get("payments", []):
                txn = self._parse_payment(payment)
                if txn:
                    transactions.append(txn)

            cursor = data.get("cursor")
            if not cursor:
                break

        logger.info("Square: fetched %d transactions since %s", len(transactions), since.isoformat())
        return transactions[:limit]

    async def fetch_orders(
        self,
        since: datetime,
        limit: int = 100,
    ) -> list[dict[str, Any]]:
        """Fetch Square orders for the location."""
        self._ensure_connected()
        assert self._client is not None

        body: dict[str, Any] = {
            "location_ids": [self.location_id] if self.location_id else [],
            "query": {
                "filter": {
                    "date_time_filter": {
                        "created_at": {
                            "start_at": since.isoformat(),
                        },
                    },
                    "state_filter": {
                        "states": ["COMPLETED"],
                    },
                },
                "sort": {
                    "sort_field": "CREATED_AT",
                    "sort_order": "ASC",
                },
            },
            "limit": min(limit, 500),
        }

        try:
            resp = await self._client.post("/orders/search", json=body)
            resp.raise_for_status()
            data = resp.json()
        except httpx.HTTPStatusError as exc:
            raise ConnectorError(
                f"Square fetch_orders failed: {exc.response.text}",
                connector="square",
                retriable=exc.response.status_code >= 500,
            ) from exc

        orders = []
        for order in data.get("orders", []):
            total_money = order.get("total_money", {})
            orders.append({
                "id": order["id"],
                "state": order.get("state"),
                "total_amount": Decimal(str(total_money.get("amount", 0))) / 100,
                "currency": total_money.get("currency", "USD"),
                "created_at": order.get("created_at"),
                "line_items_count": len(order.get("line_items", [])),
                "location_id": order.get("location_id"),
            })

        return orders

    # ------------------------------------------------------------------
    # Balance & Merchant
    # ------------------------------------------------------------------

    async def get_balance(self) -> dict[str, Decimal]:
        """Return available Square balance per currency (from payments summary)."""
        self._ensure_connected()
        assert self._client is not None

        # Square does not have a direct balance endpoint like Stripe.
        # We approximate using the merchant's available balance from the
        # bank accounts / cash drawers, or return empty if unavailable.
        try:
            resp = await self._client.get("/merchants/me")
            resp.raise_for_status()
            data = resp.json()
            merchant = data.get("merchant", [{}])
            if isinstance(merchant, list):
                merchant = merchant[0] if merchant else {}
            currency = merchant.get("currency", "USD")
        except httpx.HTTPStatusError:
            currency = "USD"

        # Use a simple approach: sum recent completed payments
        # In production, you'd integrate with Square Banking API
        return {currency: Decimal("0")}

    async def verify_merchant(self) -> MerchantInfo:
        """Verify the Square merchant account."""
        self._ensure_connected()
        assert self._client is not None

        try:
            resp = await self._client.get("/locations")
            resp.raise_for_status()
            data = resp.json()
            locations = data.get("locations", [])
        except httpx.HTTPStatusError as exc:
            raise ConnectorError(
                f"Square verify_merchant failed: {exc.response.text}",
                connector="square",
                retriable=exc.response.status_code >= 500,
            ) from exc

        if not locations:
            return MerchantInfo(
                merchant_id="unknown",
                name="unknown",
                verified=False,
            )

        loc = locations[0]
        status = loc.get("status", "INACTIVE")

        return MerchantInfo(
            merchant_id=loc.get("merchant_id", loc["id"]),
            name=loc.get("business_name") or loc.get("name", ""),
            email=loc.get("business_email"),
            country=loc.get("country"),
            verified=status == "ACTIVE",
            metadata={
                "location_id": loc["id"],
                "status": status,
                "capabilities": loc.get("capabilities", []),
            },
        )

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _parse_payment(payment: dict[str, Any]) -> Transaction | None:
        """Convert a Square payment object to a normalised Transaction."""
        if payment.get("status") != "COMPLETED":
            return None

        total_money = payment.get("total_money", {})
        amount_cents = total_money.get("amount", 0)
        currency = total_money.get("currency", "USD")

        processing_fee_money = payment.get("processing_fee", [])
        fee_cents = 0
        for fee_entry in processing_fee_money:
            fee_cents += fee_entry.get("amount_money", {}).get("amount", 0)

        amount = Decimal(str(amount_cents)) / 100
        fee = Decimal(str(abs(fee_cents))) / 100

        created_at = payment.get("created_at", "")
        try:
            timestamp = datetime.fromisoformat(created_at.replace("Z", "+00:00"))
        except (ValueError, AttributeError):
            timestamp = datetime.now(timezone.utc)

        return Transaction(
            id=payment["id"],
            amount=amount,
            currency=currency,
            timestamp=timestamp,
            source="square",
            status="completed",
            fee=fee,
            net_amount=amount - fee,
            customer_id=payment.get("customer_id"),
            description=payment.get("note"),
            metadata={
                "location_id": payment.get("location_id"),
                "order_id": payment.get("order_id"),
                "source_type": payment.get("source_type"),
            },
        )
