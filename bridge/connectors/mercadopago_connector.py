"""MercadoPago payment processor connector using httpx (async)."""

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

MERCADOPAGO_API_BASE = "https://api.mercadopago.com"


class MercadoPagoConnector(BaseConnector):
    """Async MercadoPago API connector for payments and collections."""

    connector_type = ConnectorType.MERCADOPAGO

    def __init__(self, api_key: str, **kwargs: Any) -> None:
        super().__init__(api_key, **kwargs)
        self._client: httpx.AsyncClient | None = None
        self._user_id: str | None = None

    def _build_client(self) -> httpx.AsyncClient:
        return httpx.AsyncClient(
            base_url=MERCADOPAGO_API_BASE,
            headers={
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json",
            },
            timeout=30.0,
        )

    async def connect(self) -> None:
        """Validate MercadoPago access token by fetching user info."""
        self._client = self._build_client()
        try:
            resp = await self._client.get("/users/me")
            resp.raise_for_status()
            data = resp.json()
            self._user_id = str(data.get("id", ""))
            self._connected = True
            logger.info(
                "MercadoPago connector authenticated (user_id=%s)",
                self._user_id,
            )
        except httpx.HTTPStatusError as exc:
            await self._client.aclose()
            self._client = None
            raise ConnectorError(
                f"MercadoPago authentication failed: {exc.response.status_code}",
                connector="mercadopago",
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
        """Fetch approved MercadoPago payments."""
        self._ensure_connected()
        assert self._client is not None

        params: dict[str, Any] = {
            "sort": "date_created",
            "criteria": "asc",
            "begin_date": since.strftime("%Y-%m-%dT%H:%M:%S.000-00:00"),
            "status": "approved",
            "limit": min(limit, 50),
            "offset": 0,
        }
        if until:
            params["end_date"] = until.strftime("%Y-%m-%dT%H:%M:%S.000-00:00")

        transactions: list[Transaction] = []

        while len(transactions) < limit:
            try:
                resp = await self._client.get("/v1/payments/search", params=params)
                resp.raise_for_status()
                data = resp.json()
            except httpx.HTTPStatusError as exc:
                raise ConnectorError(
                    f"MercadoPago fetch_transactions failed: {exc.response.text}",
                    connector="mercadopago",
                    retriable=exc.response.status_code >= 500,
                ) from exc

            results = data.get("results", [])
            if not results:
                break

            for payment in results:
                txn = self._parse_payment(payment)
                if txn:
                    transactions.append(txn)

            paging = data.get("paging", {})
            total = paging.get("total", 0)
            offset = paging.get("offset", 0)
            page_limit = paging.get("limit", 50)
            if offset + page_limit >= total:
                break
            params["offset"] = offset + page_limit

        logger.info(
            "MercadoPago: fetched %d transactions since %s",
            len(transactions),
            since.isoformat(),
        )
        return transactions[:limit]

    async def fetch_collections(
        self,
        since: datetime,
        limit: int = 100,
    ) -> list[dict[str, Any]]:
        """Fetch MercadoPago collections (merchant orders / IPN-style)."""
        self._ensure_connected()
        assert self._client is not None

        params: dict[str, Any] = {
            "begin_date": since.strftime("%Y-%m-%dT%H:%M:%S.000-00:00"),
            "limit": min(limit, 50),
            "offset": 0,
        }

        try:
            resp = await self._client.get("/merchant_orders/search", params=params)
            resp.raise_for_status()
            data = resp.json()
        except httpx.HTTPStatusError as exc:
            raise ConnectorError(
                f"MercadoPago fetch_collections failed: {exc.response.text}",
                connector="mercadopago",
                retriable=exc.response.status_code >= 500,
            ) from exc

        collections = []
        for order in data.get("elements", []):
            total_amount = Decimal(str(order.get("total_amount", 0)))
            paid_amount = Decimal(str(order.get("paid_amount", 0)))
            collections.append({
                "id": str(order.get("id")),
                "status": order.get("status"),
                "total_amount": total_amount,
                "paid_amount": paid_amount,
                "currency": order.get("currency_id", "ARS"),
                "created_date": order.get("date_created"),
                "items_count": len(order.get("items", [])),
                "payments_count": len(order.get("payments", [])),
            })

        return collections

    # ------------------------------------------------------------------
    # Balance & Merchant
    # ------------------------------------------------------------------

    async def get_balance(self) -> dict[str, Decimal]:
        """Return available MercadoPago balance per currency."""
        self._ensure_connected()
        assert self._client is not None

        try:
            resp = await self._client.get(f"/users/{self._user_id}/mercadopago_account/balance")
            resp.raise_for_status()
            data = resp.json()
        except httpx.HTTPStatusError as exc:
            raise ConnectorError(
                f"MercadoPago get_balance failed: {exc.response.text}",
                connector="mercadopago",
                retriable=exc.response.status_code >= 500,
            ) from exc

        currency = data.get("currency_id", "ARS")
        available = Decimal(str(data.get("available_balance", 0)))
        return {currency: available}

    async def verify_merchant(self) -> MerchantInfo:
        """Verify the MercadoPago user account."""
        self._ensure_connected()
        assert self._client is not None

        try:
            resp = await self._client.get("/users/me")
            resp.raise_for_status()
            data = resp.json()
        except httpx.HTTPStatusError as exc:
            raise ConnectorError(
                f"MercadoPago verify_merchant failed: {exc.response.text}",
                connector="mercadopago",
                retriable=exc.response.status_code >= 500,
            ) from exc

        status = data.get("status", {})
        site_status = status.get("site_status", "inactive") if isinstance(status, dict) else "inactive"

        return MerchantInfo(
            merchant_id=str(data.get("id", "")),
            name=f"{data.get('first_name', '')} {data.get('last_name', '')}".strip()
            or data.get("nickname", ""),
            email=data.get("email"),
            country=data.get("country_id"),
            verified=site_status == "active",
            metadata={
                "site_id": data.get("site_id"),
                "nickname": data.get("nickname"),
                "site_status": site_status,
            },
        )

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _parse_payment(payment: dict[str, Any]) -> Transaction | None:
        """Convert a MercadoPago payment object to a normalised Transaction."""
        if payment.get("status") != "approved":
            return None

        amount = Decimal(str(payment.get("transaction_amount", 0)))
        fee_detail = payment.get("fee_details", [])
        fee = Decimal("0")
        for fd in fee_detail:
            fee += Decimal(str(fd.get("amount", 0)))

        date_created = payment.get("date_created", "")
        try:
            timestamp = datetime.fromisoformat(date_created)
            if timestamp.tzinfo is None:
                timestamp = timestamp.replace(tzinfo=timezone.utc)
        except (ValueError, AttributeError):
            timestamp = datetime.now(timezone.utc)

        return Transaction(
            id=str(payment["id"]),
            amount=amount,
            currency=payment.get("currency_id", "ARS"),
            timestamp=timestamp,
            source="mercadopago",
            status="completed",
            fee=fee,
            net_amount=Decimal(str(payment.get("net_received_amount", 0))) or (amount - fee),
            customer_id=str(payment.get("payer", {}).get("id", "")),
            description=payment.get("description"),
            metadata={
                "payment_method": payment.get("payment_method_id"),
                "payment_type": payment.get("payment_type_id"),
                "external_reference": payment.get("external_reference"),
                "installments": payment.get("installments"),
            },
        )
