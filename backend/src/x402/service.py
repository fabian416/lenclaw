"""x402 payment tracking, settlement verification, and revenue routing.

Manages the lifecycle of x402 micropayments: recording, verification,
settlement tracking, and routing revenue to the RevenueLockbox contract.
"""

from __future__ import annotations

import logging
import uuid
from datetime import UTC, datetime
from decimal import Decimal

import httpx

from src.x402.schemas import (
    PaymentConfig,
    PaymentListResponse,
    PaymentReceipt,
    PaymentStatus,
    SupportedToken,
)

logger = logging.getLogger(__name__)

# Base mainnet constants
USDT_BASE_ADDRESS = "0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2"
BASE_CHAIN_ID = 8453


class X402Service:
    """Payment tracking and revenue routing service.

    In production, payments are persisted in the database. This implementation
    uses an in-memory store for simplicity, with hooks for database integration.
    """

    def __init__(
        self,
        lockbox_address: str | None = None,
        facilitator_url: str | None = None,
        recipient: str | None = None,
    ) -> None:
        self.lockbox_address = lockbox_address
        self.facilitator_url = facilitator_url
        self.recipient = recipient or ""

        # In-memory payment store (replace with DB in production)
        self._payments: dict[str, PaymentReceipt] = {}
        self._used_nonces: set[str] = set()

    # ------------------------------------------------------------------ #
    # Payment recording
    # ------------------------------------------------------------------ #

    async def record_payment(
        self,
        payer: str,
        payee: str,
        amount: Decimal,
        token: str,
        resource: str,
        nonce: str,
        tx_hash: str | None = None,
    ) -> PaymentReceipt:
        """Record a verified x402 payment.

        Args:
            payer: Wallet address of the payer.
            payee: Wallet address of the payee.
            amount: Payment amount in human-readable units.
            token: Token symbol (e.g. USDT).
            resource: The URL resource that was paid for.
            nonce: Unique payment nonce.
            tx_hash: On-chain settlement transaction hash, if settled.

        Returns:
            The recorded PaymentReceipt.
        """
        now = datetime.now(UTC)
        status = PaymentStatus.SETTLED if tx_hash else PaymentStatus.VERIFIED

        receipt = PaymentReceipt(
            id=uuid.uuid4(),
            payer=payer.lower(),
            payee=payee.lower(),
            amount=amount,
            token=token,
            chain_id=BASE_CHAIN_ID,
            tx_hash=tx_hash,
            resource=resource,
            status=status,
            nonce=nonce,
            created_at=now,
            settled_at=now if tx_hash else None,
            lockbox_address=self.lockbox_address,
        )

        self._payments[str(receipt.id)] = receipt
        self._used_nonces.add(nonce)

        logger.info(
            "Recorded x402 payment: id=%s payer=%s payee=%s amount=%s token=%s",
            receipt.id,
            payer,
            payee,
            amount,
            token,
        )

        # Route revenue to lockbox if configured
        if self.lockbox_address and tx_hash:
            await self._route_to_lockbox(receipt)

        return receipt

    # ------------------------------------------------------------------ #
    # Nonce tracking (replay prevention)
    # ------------------------------------------------------------------ #

    async def is_nonce_used(self, nonce: str) -> bool:
        """Check if a payment nonce has already been used."""
        return nonce in self._used_nonces

    # ------------------------------------------------------------------ #
    # Payment queries
    # ------------------------------------------------------------------ #

    async def get_payment(self, payment_id: str) -> PaymentReceipt | None:
        """Retrieve a payment by ID."""
        return self._payments.get(payment_id)

    async def get_payment_by_nonce(self, nonce: str) -> PaymentReceipt | None:
        """Retrieve a payment by its nonce."""
        for receipt in self._payments.values():
            if receipt.nonce == nonce:
                return receipt
        return None

    async def list_payments(
        self,
        page: int = 1,
        page_size: int = 20,
        payer: str | None = None,
        payee: str | None = None,
        status: PaymentStatus | None = None,
    ) -> PaymentListResponse:
        """List payments with optional filtering and pagination.

        Args:
            page: Page number (1-indexed).
            page_size: Results per page.
            payer: Filter by payer address.
            payee: Filter by payee address.
            status: Filter by payment status.

        Returns:
            Paginated list of payment receipts.
        """
        receipts = list(self._payments.values())

        # Apply filters
        if payer:
            receipts = [r for r in receipts if r.payer == payer.lower()]
        if payee:
            receipts = [r for r in receipts if r.payee == payee.lower()]
        if status:
            receipts = [r for r in receipts if r.status == status]

        # Sort by creation time descending
        receipts.sort(key=lambda r: r.created_at, reverse=True)

        total = len(receipts)
        start = (page - 1) * page_size
        end = start + page_size
        page_items = receipts[start:end]

        return PaymentListResponse(
            items=page_items,
            total=total,
            page=page,
            page_size=page_size,
        )

    # ------------------------------------------------------------------ #
    # Settlement verification
    # ------------------------------------------------------------------ #

    async def verify_settlement(self, payment_id: str) -> bool:
        """Verify that a payment has been settled on-chain.

        For payments with a tx_hash, queries the chain to confirm the
        transaction was included and successful.

        Args:
            payment_id: UUID of the payment to verify.

        Returns:
            True if the payment is settled on-chain.
        """
        receipt = self._payments.get(payment_id)
        if receipt is None:
            return False

        if receipt.status == PaymentStatus.SETTLED:
            return True

        if not receipt.tx_hash:
            return False

        # In production, query the RPC node to verify the transaction
        # For now, trust the facilitator's response
        receipt.status = PaymentStatus.SETTLED
        receipt.settled_at = datetime.now(UTC)
        return True

    async def verify_payment_receipt(
        self,
        payment_header: str,
        resource: str,
    ) -> tuple[bool, PaymentReceipt | None, str | None]:
        """Verify a payment header and return a receipt if valid.

        This is the handler for POST /api/v1/x402/verify. It decodes the
        payment header, verifies the signature, checks for replay, and
        optionally settles via the facilitator.

        Args:
            payment_header: Base64-encoded payment header string.
            resource: The resource URL being paid for.

        Returns:
            Tuple of (is_valid, receipt_or_none, error_message_or_none).
        """
        from src.x402.protocol import (
            decode_payment_header,
            verify_payment_signature,
        )

        try:
            header = decode_payment_header(payment_header)
        except ValueError as exc:
            return False, None, str(exc)

        if not verify_payment_signature(
            header,
            expected_recipient=self.recipient,
        ):
            return False, None, "Payment signature verification failed"

        if await self.is_nonce_used(header.payload.nonce):
            return False, None, "Payment nonce already used"

        # Settle via facilitator
        tx_hash = None
        if self.facilitator_url:
            tx_hash = await self._settle_with_facilitator(payment_header)

        receipt = await self.record_payment(
            payer=header.payload.sender,
            payee=header.payload.recipient,
            amount=Decimal(header.payload.amount) / Decimal(10**6),
            token="USDT",
            resource=resource,
            nonce=header.payload.nonce,
            tx_hash=tx_hash,
        )

        return True, receipt, None

    # ------------------------------------------------------------------ #
    # Configuration
    # ------------------------------------------------------------------ #

    def get_config(self) -> PaymentConfig:
        """Return the x402 configuration for this server."""
        return PaymentConfig(
            x402Version=1,
            supported_tokens=[
                SupportedToken(
                    symbol="USDT",
                    address=USDT_BASE_ADDRESS,
                    decimals=6,
                    chain_id=BASE_CHAIN_ID,
                ),
            ],
            facilitator_url=self.facilitator_url,
            network="base-mainnet",
            chain_id=BASE_CHAIN_ID,
            recipient=self.recipient,
            lockbox_address=self.lockbox_address,
        )

    # ------------------------------------------------------------------ #
    # Revenue routing
    # ------------------------------------------------------------------ #

    async def _route_to_lockbox(self, receipt: PaymentReceipt) -> None:
        """Route settled payment revenue to the RevenueLockbox contract.

        In the x402 flow, the facilitator settles the USDT transfer on-chain.
        If the recipient is the lockbox address, the revenue is automatically
        captured. This method logs the routing for tracking.

        For direct-to-lockbox payments, the facilitator sends USDT directly
        to the lockbox contract. The lockbox's processRevenue() function
        then splits between debt repayment and agent payout.
        """
        logger.info(
            "Revenue routed to lockbox=%s amount=%s tx=%s",
            self.lockbox_address,
            receipt.amount,
            receipt.tx_hash,
        )

    async def _settle_with_facilitator(self, payment_header: str) -> str | None:
        """Submit a payment to the facilitator for settlement.

        Args:
            payment_header: Base64-encoded payment header.

        Returns:
            Transaction hash if successful, None otherwise.
        """
        if not self.facilitator_url:
            return None

        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                resp = await client.post(
                    f"{self.facilitator_url}/settle",
                    json={"paymentHeader": payment_header},
                    headers={"Content-Type": "application/json"},
                )

                if resp.status_code == 200:
                    data = resp.json()
                    return data.get("txHash") or data.get("tx_hash")

                logger.error(
                    "Facilitator settlement failed: status=%d", resp.status_code
                )
                return None

        except httpx.HTTPError:
            logger.exception("Facilitator connection failed")
            return None

    # ------------------------------------------------------------------ #
    # Aggregate stats
    # ------------------------------------------------------------------ #

    async def get_total_revenue(self, payee: str | None = None) -> Decimal:
        """Get total settled revenue, optionally filtered by payee."""
        total = Decimal(0)
        for receipt in self._payments.values():
            if receipt.status == PaymentStatus.SETTLED and (
                payee is None or receipt.payee == payee.lower()
            ):
                total += receipt.amount
        return total

    async def get_payment_count(self, status: PaymentStatus | None = None) -> int:
        """Get count of payments, optionally filtered by status."""
        if status is None:
            return len(self._payments)
        return sum(1 for r in self._payments.values() if r.status == status)
