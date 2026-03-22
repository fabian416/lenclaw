"""Transak API client, webhook verification, and transaction tracking."""

from __future__ import annotations

import hashlib
import hmac
import logging
import os
from datetime import UTC, datetime
from decimal import Decimal
from urllib.parse import urlencode

import httpx
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.common.exceptions import BadRequestError, NotFoundError
from src.fiat.models import FiatRampType, FiatTransaction, FiatTransactionStatus

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Configuration — pulled from environment variables
# ---------------------------------------------------------------------------

TRANSAK_API_KEY: str = os.getenv("TRANSAK_API_KEY", "")
TRANSAK_API_SECRET: str = os.getenv("TRANSAK_API_SECRET", "")
TRANSAK_WEBHOOK_SECRET: str = os.getenv("TRANSAK_WEBHOOK_SECRET", "")
TRANSAK_ENV: str = os.getenv("TRANSAK_ENV", "STAGING")  # STAGING | PRODUCTION
TRANSAK_BASE_URL: str = (
    "https://global.transak.com"
    if TRANSAK_ENV == "PRODUCTION"
    else "https://global-stg.transak.com"
)
TRANSAK_API_URL: str = (
    "https://api.transak.com"
    if TRANSAK_ENV == "PRODUCTION"
    else "https://api-stg.transak.com"
)

# Supported currencies
SUPPORTED_FIAT = {"USD", "EUR"}
SUPPORTED_CRYPTO = {"USDC"}
SUPPORTED_NETWORKS = {"base"}

# Transak status mapping → internal status
_STATUS_MAP: dict[str, FiatTransactionStatus] = {
    "AWAITING_PAYMENT_FROM_USER": FiatTransactionStatus.PENDING,
    "PAYMENT_DONE_MARKED_BY_USER": FiatTransactionStatus.PROCESSING,
    "PROCESSING": FiatTransactionStatus.PROCESSING,
    "PENDING_DELIVERY_FROM_TRANSAK": FiatTransactionStatus.PROCESSING,
    "ON_HOLD_PENDING_DELIVERY_FROM_TRANSAK": FiatTransactionStatus.PROCESSING,
    "COMPLETED": FiatTransactionStatus.COMPLETED,
    "CANCELLED": FiatTransactionStatus.CANCELLED,
    "FAILED": FiatTransactionStatus.FAILED,
    "REFUNDED": FiatTransactionStatus.REFUNDED,
    "EXPIRED": FiatTransactionStatus.EXPIRED,
}


class FiatRampService:
    """Handles Transak sessions, webhook processing, and transaction queries."""

    def __init__(self) -> None:
        self._http = httpx.AsyncClient(timeout=30.0)

    # ------------------------------------------------------------------
    # Session creation
    # ------------------------------------------------------------------

    async def create_onramp_session(
        self,
        session: AsyncSession,
        user_address: str,
        fiat_currency: str,
        fiat_amount: Decimal,
        crypto_currency: str,
        wallet_address: str,
        network: str,
        redirect_url: str | None = None,
    ) -> dict:
        """Create a Transak buy (on-ramp) session and persist the transaction."""
        self._validate_currencies(fiat_currency, crypto_currency, network)

        # Persist local transaction record
        tx = FiatTransaction(
            user_address=user_address.lower(),
            type=FiatRampType.ONRAMP,
            amount_fiat=fiat_amount,
            fiat_currency=fiat_currency.upper(),
            crypto_currency=crypto_currency.upper(),
            status=FiatTransactionStatus.CREATED,
            provider="transak",
            network=network,
            wallet_address=wallet_address.lower(),
        )
        session.add(tx)
        await session.flush()

        # Build Transak widget URL
        params: dict[str, str] = {
            "apiKey": TRANSAK_API_KEY,
            "environment": TRANSAK_ENV,
            "cryptoCurrencyCode": crypto_currency.upper(),
            "fiatCurrency": fiat_currency.upper(),
            "defaultFiatAmount": str(fiat_amount),
            "walletAddress": wallet_address,
            "network": network,
            "productsAvailed": "BUY",
            "themeColor": "7c3aed",
            "hideMenu": "true",
            "disableWalletAddressForm": "true",
        }
        if redirect_url:
            params["redirectURL"] = redirect_url

        widget_url = f"{TRANSAK_BASE_URL}?{urlencode(params)}"

        logger.info(
            "Created onramp session tx_id=%s user=%s amount=%s %s",
            tx.id,
            user_address,
            fiat_amount,
            fiat_currency,
        )

        return {
            "session_id": str(tx.id),
            "widget_url": widget_url,
            "transaction_id": tx.id,
            "provider": "transak",
            "expires_in": 1800,
        }

    async def create_offramp_session(
        self,
        session: AsyncSession,
        user_address: str,
        fiat_currency: str,
        fiat_amount: Decimal,
        crypto_currency: str,
        wallet_address: str,
        network: str,
        redirect_url: str | None = None,
    ) -> dict:
        """Create a Transak sell (off-ramp) session and persist the transaction."""
        self._validate_currencies(fiat_currency, crypto_currency, network)

        tx = FiatTransaction(
            user_address=user_address.lower(),
            type=FiatRampType.OFFRAMP,
            amount_fiat=fiat_amount,
            fiat_currency=fiat_currency.upper(),
            crypto_currency=crypto_currency.upper(),
            status=FiatTransactionStatus.CREATED,
            provider="transak",
            network=network,
            wallet_address=wallet_address.lower(),
        )
        session.add(tx)
        await session.flush()

        params: dict[str, str] = {
            "apiKey": TRANSAK_API_KEY,
            "environment": TRANSAK_ENV,
            "cryptoCurrencyCode": crypto_currency.upper(),
            "fiatCurrency": fiat_currency.upper(),
            "defaultFiatAmount": str(fiat_amount),
            "walletAddress": wallet_address,
            "network": network,
            "productsAvailed": "SELL",
            "themeColor": "7c3aed",
            "hideMenu": "true",
            "disableWalletAddressForm": "true",
        }
        if redirect_url:
            params["redirectURL"] = redirect_url

        widget_url = f"{TRANSAK_BASE_URL}?{urlencode(params)}"

        logger.info(
            "Created offramp session tx_id=%s user=%s amount=%s %s",
            tx.id,
            user_address,
            fiat_amount,
            fiat_currency,
        )

        return {
            "session_id": str(tx.id),
            "widget_url": widget_url,
            "transaction_id": tx.id,
            "provider": "transak",
            "expires_in": 1800,
        }

    # ------------------------------------------------------------------
    # Webhook processing
    # ------------------------------------------------------------------

    @staticmethod
    def verify_webhook_signature(raw_body: bytes, signature: str) -> bool:
        """Verify HMAC-SHA512 webhook signature from Transak."""
        if not TRANSAK_WEBHOOK_SECRET:
            logger.warning(
                "TRANSAK_WEBHOOK_SECRET not configured; skipping verification"
            )
            return True

        expected = hmac.new(
            TRANSAK_WEBHOOK_SECRET.encode(),
            raw_body,
            hashlib.sha512,
        ).hexdigest()

        return hmac.compare_digest(expected, signature)

    async def process_webhook(
        self,
        session: AsyncSession,
        order_id: str,
        status: str,
        crypto_amount: Decimal | None = None,
        transaction_hash: str | None = None,
        fiat_amount: Decimal | None = None,
        wallet_address: str | None = None,
        failure_reason: str | None = None,
    ) -> FiatTransaction:
        """Process a webhook status update and persist changes."""

        # Look up by provider_order_id first; fall back to provider_tx_id
        result = await session.execute(
            select(FiatTransaction).where(FiatTransaction.provider_order_id == order_id)
        )
        tx = result.scalar_one_or_none()

        if tx is None:
            # First webhook for this order — find the matching CREATED transaction
            # by wallet address + status, or create a stub.
            result = await session.execute(
                select(FiatTransaction)
                .where(
                    FiatTransaction.status == FiatTransactionStatus.CREATED,
                    FiatTransaction.wallet_address == (wallet_address or "").lower(),
                )
                .order_by(FiatTransaction.created_at.desc())
                .limit(1)
            )
            tx = result.scalar_one_or_none()

            if tx is None:
                raise NotFoundError(f"No matching transaction for order {order_id}")

            tx.provider_order_id = order_id

        # Map Transak status to internal status
        new_status = _STATUS_MAP.get(status.upper())
        if new_status is None:
            logger.warning("Unknown Transak status %r for order %s", status, order_id)
            new_status = FiatTransactionStatus.PENDING

        tx.status = new_status

        if crypto_amount is not None:
            tx.amount_crypto = crypto_amount
        if fiat_amount is not None:
            tx.amount_fiat = fiat_amount
        if transaction_hash:
            tx.tx_hash = transaction_hash
        if failure_reason:
            tx.failure_reason = failure_reason
        if new_status == FiatTransactionStatus.COMPLETED:
            tx.completed_at = datetime.now(UTC)

        await session.flush()
        logger.info(
            "Webhook processed order=%s status=%s -> %s tx_id=%s",
            order_id,
            status,
            new_status.value,
            tx.id,
        )
        return tx

    # ------------------------------------------------------------------
    # Transaction queries
    # ------------------------------------------------------------------

    async def list_transactions(
        self,
        session: AsyncSession,
        user_address: str,
        page: int = 1,
        page_size: int = 20,
        ramp_type: FiatRampType | None = None,
    ) -> tuple[list[FiatTransaction], int]:
        """Return paginated fiat transactions for a user."""
        query = (
            select(FiatTransaction)
            .where(FiatTransaction.user_address == user_address.lower())
            .order_by(FiatTransaction.created_at.desc())
        )
        count_query = select(func.count(FiatTransaction.id)).where(
            FiatTransaction.user_address == user_address.lower()
        )

        if ramp_type is not None:
            query = query.where(FiatTransaction.type == ramp_type)
            count_query = count_query.where(FiatTransaction.type == ramp_type)

        total_result = await session.execute(count_query)
        total = total_result.scalar() or 0

        query = query.offset((page - 1) * page_size).limit(page_size)
        result = await session.execute(query)
        transactions = list(result.scalars().all())

        return transactions, total

    # ------------------------------------------------------------------
    # Rate quotes
    # ------------------------------------------------------------------

    async def get_rate_quote(
        self,
        fiat_currency: str,
        crypto_currency: str,
        fiat_amount: Decimal,
        network: str = "base",
    ) -> dict:
        """Fetch a live conversion rate quote from Transak."""
        self._validate_currencies(fiat_currency, crypto_currency, network)

        try:
            resp = await self._http.get(
                f"{TRANSAK_API_URL}/api/v1/pricing/public/quotes",
                params={
                    "fiatCurrency": fiat_currency.upper(),
                    "cryptoCurrency": crypto_currency.upper(),
                    "isBuyOrSell": "BUY",
                    "fiatAmount": str(fiat_amount),
                    "network": network,
                    "partnerApiKey": TRANSAK_API_KEY,
                },
            )
            resp.raise_for_status()
            data = resp.json().get("response", {})

            crypto_amount = Decimal(str(data.get("cryptoAmount", 0)))
            fee = Decimal(str(data.get("totalFee", 0)))
            rate = crypto_amount / fiat_amount if fiat_amount > 0 else Decimal(0)

            return {
                "fiat_currency": fiat_currency.upper(),
                "crypto_currency": crypto_currency.upper(),
                "rate": rate,
                "fiat_amount": fiat_amount,
                "crypto_amount": crypto_amount,
                "fee": fee,
                "network": network,
                "provider": "transak",
                "valid_for_seconds": 30,
            }

        except httpx.HTTPError as exc:
            logger.error("Transak rate quote failed: %s", exc)
            # Return a fallback estimate (1:1 minus ~1.5% fee) so the UI
            # always has something to display.
            estimated_fee = fiat_amount * Decimal("0.015")
            estimated_crypto = fiat_amount - estimated_fee

            return {
                "fiat_currency": fiat_currency.upper(),
                "crypto_currency": crypto_currency.upper(),
                "rate": Decimal("0.985"),
                "fiat_amount": fiat_amount,
                "crypto_amount": estimated_crypto,
                "fee": estimated_fee,
                "network": network,
                "provider": "transak",
                "valid_for_seconds": 30,
            }

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _validate_currencies(
        fiat_currency: str, crypto_currency: str, network: str
    ) -> None:
        if fiat_currency.upper() not in SUPPORTED_FIAT:
            raise BadRequestError(
                f"Unsupported fiat currency: {fiat_currency}. Supported: {', '.join(SUPPORTED_FIAT)}"
            )
        if crypto_currency.upper() not in SUPPORTED_CRYPTO:
            raise BadRequestError(
                f"Unsupported crypto currency: {crypto_currency}. Supported: {', '.join(SUPPORTED_CRYPTO)}"
            )
        if network.lower() not in SUPPORTED_NETWORKS:
            raise BadRequestError(
                f"Unsupported network: {network}. Supported: {', '.join(SUPPORTED_NETWORKS)}"
            )

    async def close(self) -> None:
        await self._http.aclose()
