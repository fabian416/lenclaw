"""Stripe payment processor connector using httpx (async)."""

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

STRIPE_API_BASE = "https://api.stripe.com/v1"


class StripeConnector(BaseConnector):
    """Async Stripe API connector for charges, subscriptions, and payouts."""

    connector_type = ConnectorType.STRIPE

    def __init__(self, api_key: str, **kwargs: Any) -> None:
        super().__init__(api_key, **kwargs)
        self._client: httpx.AsyncClient | None = None

    def _build_client(self) -> httpx.AsyncClient:
        return httpx.AsyncClient(
            base_url=STRIPE_API_BASE,
            auth=(self.api_key, ""),
            headers={
                "Stripe-Version": "2024-04-10",
                "Content-Type": "application/x-www-form-urlencoded",
            },
            timeout=30.0,
        )

    async def connect(self) -> None:
        """Validate Stripe API key by fetching the account."""
        self._client = self._build_client()
        try:
            resp = await self._client.get("/account")
            resp.raise_for_status()
            self._connected = True
            logger.info("Stripe connector authenticated (account=%s)", resp.json().get("id"))
        except httpx.HTTPStatusError as exc:
            await self._client.aclose()
            self._client = None
            raise ConnectorError(
                f"Stripe authentication failed: {exc.response.status_code}",
                connector="stripe",
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
        """Fetch completed Stripe charges (payments)."""
        self._ensure_connected()
        assert self._client is not None

        params: dict[str, Any] = {
            "created[gte]": int(since.timestamp()),
            "limit": min(limit, 100),
            "status": "succeeded",
        }
        if until:
            params["created[lte]"] = int(until.timestamp())

        transactions: list[Transaction] = []
        has_more = True

        while has_more and len(transactions) < limit:
            try:
                resp = await self._client.get("/charges", params=params)
                resp.raise_for_status()
                data = resp.json()
            except httpx.HTTPStatusError as exc:
                raise ConnectorError(
                    f"Stripe fetch_transactions failed: {exc.response.text}",
                    connector="stripe",
                    retriable=exc.response.status_code >= 500,
                ) from exc

            for charge in data.get("data", []):
                txn = self._parse_charge(charge)
                if txn:
                    transactions.append(txn)

            has_more = data.get("has_more", False)
            if has_more and data["data"]:
                params["starting_after"] = data["data"][-1]["id"]

        logger.info("Stripe: fetched %d transactions since %s", len(transactions), since.isoformat())
        return transactions[:limit]

    async def fetch_subscriptions(
        self,
        status: str = "active",
        limit: int = 100,
    ) -> list[dict[str, Any]]:
        """Fetch active subscriptions."""
        self._ensure_connected()
        assert self._client is not None

        try:
            resp = await self._client.get(
                "/subscriptions",
                params={"status": status, "limit": min(limit, 100)},
            )
            resp.raise_for_status()
            data = resp.json()
        except httpx.HTTPStatusError as exc:
            raise ConnectorError(
                f"Stripe fetch_subscriptions failed: {exc.response.text}",
                connector="stripe",
                retriable=exc.response.status_code >= 500,
            ) from exc

        subscriptions = []
        for sub in data.get("data", []):
            subscriptions.append({
                "id": sub["id"],
                "status": sub["status"],
                "currency": sub.get("currency", "usd").upper(),
                "current_period_start": datetime.fromtimestamp(
                    sub["current_period_start"], tz=timezone.utc
                ),
                "current_period_end": datetime.fromtimestamp(
                    sub["current_period_end"], tz=timezone.utc
                ),
                "plan_amount": Decimal(str(sub.get("plan", {}).get("amount", 0))) / 100,
                "interval": sub.get("plan", {}).get("interval", "month"),
                "customer": sub.get("customer"),
            })

        return subscriptions

    async def fetch_payouts(
        self,
        since: datetime,
        limit: int = 100,
    ) -> list[dict[str, Any]]:
        """Fetch completed payouts."""
        self._ensure_connected()
        assert self._client is not None

        try:
            resp = await self._client.get(
                "/payouts",
                params={
                    "created[gte]": int(since.timestamp()),
                    "status": "paid",
                    "limit": min(limit, 100),
                },
            )
            resp.raise_for_status()
            data = resp.json()
        except httpx.HTTPStatusError as exc:
            raise ConnectorError(
                f"Stripe fetch_payouts failed: {exc.response.text}",
                connector="stripe",
                retriable=exc.response.status_code >= 500,
            ) from exc

        payouts = []
        for payout in data.get("data", []):
            payouts.append({
                "id": payout["id"],
                "amount": Decimal(str(payout["amount"])) / 100,
                "currency": payout.get("currency", "usd").upper(),
                "arrival_date": datetime.fromtimestamp(
                    payout["arrival_date"], tz=timezone.utc
                ),
                "status": payout["status"],
                "method": payout.get("method", "standard"),
            })

        return payouts

    # ------------------------------------------------------------------
    # Balance & Merchant
    # ------------------------------------------------------------------

    async def get_balance(self) -> dict[str, Decimal]:
        """Return available Stripe balance per currency."""
        self._ensure_connected()
        assert self._client is not None

        try:
            resp = await self._client.get("/balance")
            resp.raise_for_status()
            data = resp.json()
        except httpx.HTTPStatusError as exc:
            raise ConnectorError(
                f"Stripe get_balance failed: {exc.response.text}",
                connector="stripe",
                retriable=exc.response.status_code >= 500,
            ) from exc

        balances: dict[str, Decimal] = {}
        for entry in data.get("available", []):
            currency = entry["currency"].upper()
            # Stripe amounts are in cents
            balances[currency] = Decimal(str(entry["amount"])) / 100
        return balances

    async def verify_merchant(self) -> MerchantInfo:
        """Verify the Stripe account identity."""
        self._ensure_connected()
        assert self._client is not None

        try:
            resp = await self._client.get("/account")
            resp.raise_for_status()
            acct = resp.json()
        except httpx.HTTPStatusError as exc:
            raise ConnectorError(
                f"Stripe verify_merchant failed: {exc.response.text}",
                connector="stripe",
                retriable=exc.response.status_code >= 500,
            ) from exc

        charges_enabled = acct.get("charges_enabled", False)
        payouts_enabled = acct.get("payouts_enabled", False)

        return MerchantInfo(
            merchant_id=acct["id"],
            name=acct.get("business_profile", {}).get("name") or acct.get("email", ""),
            email=acct.get("email"),
            country=acct.get("country"),
            verified=charges_enabled and payouts_enabled,
            metadata={
                "charges_enabled": charges_enabled,
                "payouts_enabled": payouts_enabled,
                "type": acct.get("type"),
            },
        )

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _parse_charge(charge: dict[str, Any]) -> Transaction | None:
        """Convert a Stripe charge object to a normalised Transaction."""
        if charge.get("status") != "succeeded":
            return None

        amount_cents = charge.get("amount", 0)
        fee_cents = charge.get("application_fee_amount") or 0
        # If balance_transaction details are embedded, prefer those
        bt = charge.get("balance_transaction")
        if isinstance(bt, dict):
            fee_cents = bt.get("fee", fee_cents)

        amount = Decimal(str(amount_cents)) / 100
        fee = Decimal(str(fee_cents)) / 100

        return Transaction(
            id=charge["id"],
            amount=amount,
            currency=charge.get("currency", "usd").upper(),
            timestamp=datetime.fromtimestamp(charge["created"], tz=timezone.utc),
            source="stripe",
            status="completed",
            fee=fee,
            net_amount=amount - fee,
            customer_id=charge.get("customer"),
            description=charge.get("description"),
            metadata=charge.get("metadata") or {},
        )
