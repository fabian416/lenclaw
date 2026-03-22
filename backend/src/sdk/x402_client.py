"""x402 Client SDK for AI agents.

Provides an HTTP client that automatically handles 402 Payment Required
responses by signing and submitting x402 payments, then retrying the request.

Usage:
    async with X402Client(private_key="0x...") as client:
        response = await client.get("https://api.example.com/premium/data")
        print(response.json())  # Payment handled transparently

    # Or with explicit wallet address:
    async with X402Client(
        private_key="0x...",
        sender_address="0x...",
    ) as client:
        response = await client.post(url, json={"query": "..."})
"""

from __future__ import annotations

import logging
from decimal import Decimal
from types import TracebackType
from typing import Any

import httpx
from eth_account import Account

from src.x402.protocol import (
    build_payment_header,
    parse_payment_required,
)
from src.x402.schemas import PaymentRequired

logger = logging.getLogger(__name__)

# Header names per x402 spec
X_PAYMENT_HEADER = "X-PAYMENT"


class X402Client:
    """HTTP client with automatic x402 payment handling.

    When a request returns HTTP 402, this client:
    1. Parses the payment instructions from the response body
    2. Signs the payment using the provided wallet private key
    3. Retries the request with the X-PAYMENT header attached

    Attributes:
        private_key: Hex-encoded private key for signing payments.
        sender_address: Wallet address derived from the private key.
        max_payment: Maximum allowed payment per request (in USD).
        auto_pay: Whether to automatically pay on 402 (default True).
        payment_history: List of payments made in this session.
    """

    def __init__(
        self,
        private_key: str,
        sender_address: str | None = None,
        max_payment: Decimal = Decimal("1.00"),
        auto_pay: bool = True,
        base_url: str = "",
        timeout: float = 30.0,
        headers: dict[str, str] | None = None,
    ) -> None:
        """Initialize the x402 client.

        Args:
            private_key: Hex-encoded private key for signing payments.
            sender_address: Wallet address. If None, derived from private_key.
            max_payment: Maximum single payment in USD (safety limit).
            auto_pay: Automatically pay on 402 responses.
            base_url: Base URL prefix for all requests.
            timeout: HTTP request timeout in seconds.
            headers: Additional headers to include in all requests.
        """
        self.private_key = private_key
        self.max_payment = max_payment
        self.auto_pay = auto_pay
        self.payment_history: list[dict[str, Any]] = []

        # Derive sender address from private key if not provided
        if sender_address:
            self.sender_address = sender_address
        else:
            account = Account.from_key(private_key)
            self.sender_address = account.address

        # Configure httpx client
        default_headers = {"User-Agent": "lenclaw-x402-sdk/1.0"}
        if headers:
            default_headers.update(headers)

        self._client = httpx.AsyncClient(
            base_url=base_url,
            timeout=timeout,
            headers=default_headers,
        )

    async def __aenter__(self) -> X402Client:
        """Enter async context manager."""
        return self

    async def __aexit__(
        self,
        exc_type: type[BaseException] | None,
        exc_val: BaseException | None,
        exc_tb: TracebackType | None,
    ) -> None:
        """Exit async context manager, closing the HTTP client."""
        await self.close()

    async def close(self) -> None:
        """Close the underlying HTTP client."""
        await self._client.aclose()

    # ------------------------------------------------------------------ #
    # HTTP methods with x402 handling
    # ------------------------------------------------------------------ #

    async def get(self, url: str, **kwargs: Any) -> httpx.Response:
        """Send a GET request, handling 402 automatically."""
        return await self._request("GET", url, **kwargs)

    async def post(self, url: str, **kwargs: Any) -> httpx.Response:
        """Send a POST request, handling 402 automatically."""
        return await self._request("POST", url, **kwargs)

    async def put(self, url: str, **kwargs: Any) -> httpx.Response:
        """Send a PUT request, handling 402 automatically."""
        return await self._request("PUT", url, **kwargs)

    async def patch(self, url: str, **kwargs: Any) -> httpx.Response:
        """Send a PATCH request, handling 402 automatically."""
        return await self._request("PATCH", url, **kwargs)

    async def delete(self, url: str, **kwargs: Any) -> httpx.Response:
        """Send a DELETE request, handling 402 automatically."""
        return await self._request("DELETE", url, **kwargs)

    # ------------------------------------------------------------------ #
    # Core request logic
    # ------------------------------------------------------------------ #

    async def _request(
        self,
        method: str,
        url: str,
        max_retries: int = 1,
        **kwargs: Any,
    ) -> httpx.Response:
        """Send an HTTP request with automatic x402 payment handling.

        If the server responds with 402 and auto_pay is enabled, parses the
        payment instructions, signs the payment, and retries with the
        X-PAYMENT header.

        Args:
            method: HTTP method.
            url: Request URL.
            max_retries: Maximum number of payment retries (default 1).
            **kwargs: Additional arguments passed to httpx.

        Returns:
            The HTTP response (either original or after payment).
        """
        response = await self._client.request(method, url, **kwargs)

        if response.status_code != 402 or not self.auto_pay:
            return response

        # Handle 402 Payment Required
        for attempt in range(max_retries):
            logger.info(
                "Received 402 for %s %s (attempt %d/%d)",
                method,
                url,
                attempt + 1,
                max_retries,
            )

            try:
                payment_required = parse_payment_required(response.json())
            except (ValueError, Exception) as exc:
                logger.error("Failed to parse 402 response: %s", exc)
                return response

            # Safety check: don't exceed max payment
            amount_usd = Decimal(payment_required.amount) / Decimal(10**6)
            if amount_usd > self.max_payment:
                logger.warning(
                    "Payment amount $%s exceeds max $%s, refusing to pay",
                    amount_usd,
                    self.max_payment,
                )
                return response

            # Sign and construct payment header
            try:
                payment_header = build_payment_header(
                    private_key=self.private_key,
                    payment_required=payment_required,
                    sender=self.sender_address,
                )
            except Exception as exc:
                logger.error("Failed to sign payment: %s", exc)
                return response

            # Record payment attempt
            self.payment_history.append(
                {
                    "url": url,
                    "method": method,
                    "amount": str(amount_usd),
                    "recipient": payment_required.recipient,
                    "attempt": attempt + 1,
                }
            )

            # Retry request with payment header
            headers = dict(kwargs.get("headers", {}))
            headers[X_PAYMENT_HEADER] = payment_header
            kwargs["headers"] = headers

            response = await self._client.request(method, url, **kwargs)

            if response.status_code != 402:
                logger.info(
                    "Payment accepted for %s %s (status=%d)",
                    method,
                    url,
                    response.status_code,
                )
                return response

        return response

    # ------------------------------------------------------------------ #
    # Payment info
    # ------------------------------------------------------------------ #

    async def check_payment_required(self, url: str) -> PaymentRequired | None:
        """Check if a URL requires x402 payment without paying.

        Sends a request with auto_pay disabled to see if the server
        responds with 402.

        Args:
            url: URL to check.

        Returns:
            PaymentRequired instructions if 402, None otherwise.
        """
        response = await self._client.get(url)

        if response.status_code == 402:
            try:
                return parse_payment_required(response.json())
            except ValueError:
                return None

        return None

    @property
    def total_spent(self) -> Decimal:
        """Total USD spent on x402 payments in this session."""
        return sum(Decimal(p["amount"]) for p in self.payment_history)

    @property
    def address(self) -> str:
        """The wallet address used for payments."""
        return self.sender_address
