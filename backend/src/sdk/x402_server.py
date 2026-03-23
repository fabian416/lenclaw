"""x402 Server SDK for AI agents accepting payments.

Provides a decorator and middleware for FastAPI endpoints to require
x402 micropayments and route revenue to the RevenueLockbox.

Usage:
    from src.sdk.x402_server import X402Server, x402_paywall

    server = X402Server(
        recipient="0x...",
        lockbox_address="0x...",
    )

    # Decorator usage
    @app.get("/premium/data")
    @x402_paywall(amount="0.01", token="USDT")
    async def premium_data(request: Request):
        return {"data": "premium content"}

    # Or integrate as middleware
    server.mount(app, protected_routes={
        "/api/v1/premium/*": {"amount": "0.01"},
    })
"""

from __future__ import annotations

import functools
import logging
from collections.abc import Callable
from datetime import UTC
from decimal import Decimal
from typing import Any

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from src.x402.middleware import X402Middleware, setup_x402_middleware
from src.x402.protocol import (
    X402Protocol,
    decode_payment_header,
    verify_payment_signature,
)
from src.x402.schemas import PaymentReceipt, PaywallConfig
from src.x402.service import X402Service

logger = logging.getLogger(__name__)

# Header names per x402 spec
X_PAYMENT_HEADER = "X-PAYMENT"


class X402Server:
    """Server-side SDK for accepting x402 payments.

    Manages paywall configuration, middleware integration, and revenue
    routing for FastAPI applications that accept x402 micropayments.
    """

    def __init__(
        self,
        recipient: str,
        lockbox_address: str | None = None,
        facilitator_url: str | None = None,
        chain_id: int = 8453,
    ) -> None:
        """Initialize the x402 server SDK.

        Args:
            recipient: Wallet address to receive payments. If lockbox_address
                is set, payments are routed there for revenue splitting.
            lockbox_address: RevenueLockbox contract address.
            facilitator_url: URL of the x402 payment facilitator.
            chain_id: Chain ID (default 8453 for Base mainnet).
        """
        self.recipient = recipient
        self.lockbox_address = lockbox_address
        self.facilitator_url = facilitator_url
        self.chain_id = chain_id

        # Use lockbox as recipient if available (revenue routing)
        effective_recipient = lockbox_address or recipient

        self.protocol = X402Protocol(
            recipient=effective_recipient,
            chain_id=chain_id,
            facilitator_url=facilitator_url,
        )

        self.service = X402Service(
            lockbox_address=lockbox_address,
            facilitator_url=facilitator_url,
            recipient=effective_recipient,
        )

        self._middleware: X402Middleware | None = None

    def mount(
        self,
        app: FastAPI,
        protected_routes: dict[str, dict[str, Any]] | None = None,
    ) -> X402Middleware:
        """Mount x402 middleware on a FastAPI application.

        Args:
            app: The FastAPI application instance.
            protected_routes: Dict mapping path patterns to paywall configs.

        Returns:
            The configured X402Middleware instance.

        Example:
            server.mount(app, protected_routes={
                "/api/v1/premium/*": {"amount": "0.01", "description": "Premium API"},
                "/api/v1/data/export": {"amount": "0.10"},
            })
        """
        effective_recipient = self.lockbox_address or self.recipient

        self._middleware = setup_x402_middleware(
            app=app,
            recipient=effective_recipient,
            facilitator_url=self.facilitator_url,
            lockbox_address=self.lockbox_address,
            protected_routes=protected_routes,
        )
        return self._middleware

    def protect(
        self,
        path: str,
        amount: Decimal | str,
        token: str = "USDT",
        description: str | None = None,
    ) -> None:
        """Register a path as requiring x402 payment.

        Must be called after mount().

        Args:
            path: URL path pattern to protect.
            amount: Payment amount in USD.
            token: Token symbol.
            description: Human-readable description.
        """
        if self._middleware is None:
            raise RuntimeError(
                "Must call mount() before protect(). "
                "Use mount() to attach middleware to the FastAPI app first."
            )
        self._middleware.protect_route(
            path=path,
            amount=Decimal(str(amount)),
            token=token,
            description=description,
        )

    async def get_revenue_stats(self) -> dict[str, Any]:
        """Get revenue statistics for this server.

        Returns:
            Dict with total revenue, payment count, and lockbox info.
        """
        total = await self.service.get_total_revenue()
        count = await self.service.get_payment_count()

        return {
            "total_revenue_usd": str(total),
            "payment_count": count,
            "recipient": self.recipient,
            "lockbox_address": self.lockbox_address,
            "facilitator_url": self.facilitator_url,
        }


# ------------------------------------------------------------------ #
# Paywall registry for the decorator
# ------------------------------------------------------------------ #

# Global registry of paywalled endpoints: maps endpoint function names
# to their paywall configurations. Used by the x402 middleware to look
# up paywall settings when a route match is found.
_paywall_registry: dict[str, PaywallConfig] = {}


def get_paywall_registry() -> dict[str, PaywallConfig]:
    """Get the global paywall registry."""
    return _paywall_registry


def x402_paywall(
    amount: str | Decimal = "0.01",
    token: str = "USDT",
    description: str | None = None,
    recipient: str | None = None,
) -> Callable:
    """Decorator to require x402 payment for a FastAPI endpoint.

    When applied to a route handler, the endpoint will:
    1. Check for an X-PAYMENT header
    2. If absent, return 402 with payment instructions
    3. If present, verify the payment and process the request
    4. Attach the PaymentReceipt to request.state.x402_receipt

    Args:
        amount: Payment amount in USD (e.g. "0.01" for one cent).
        token: Token symbol (default USDT).
        description: Human-readable description of the payment.
        recipient: Override the default recipient address.

    Returns:
        Decorated endpoint function.

    Example:
        @app.get("/api/v1/premium/data")
        @x402_paywall(amount="0.05", description="Premium data access")
        async def get_premium_data(request: Request):
            receipt = request.state.x402_receipt
            return {"data": "premium", "paid": str(receipt.amount)}
    """
    paywall_config = PaywallConfig(
        amount=Decimal(str(amount)),
        token=token,
        description=description,
        recipient=recipient,
    )

    def decorator(func: Callable) -> Callable:
        # Register in the global paywall registry
        _paywall_registry[func.__qualname__] = paywall_config

        @functools.wraps(func)
        async def wrapper(*args: Any, **kwargs: Any) -> Any:
            # Find the Request object in args or kwargs
            request: Request | None = None
            for arg in args:
                if isinstance(arg, Request):
                    request = arg
                    break
            if request is None:
                request = kwargs.get("request")

            if request is None:
                # No request object found, just call the function
                return await func(*args, **kwargs)

            # Check for payment header
            payment_header_raw = request.headers.get(X_PAYMENT_HEADER)

            if not payment_header_raw:
                # Return 402 Payment Required
                # Get the recipient from config or env
                import os

                server_recipient = paywall_config.recipient or os.getenv(
                    "X402_RECIPIENT", ""
                )

                protocol = X402Protocol(recipient=server_recipient)
                payment_required = protocol.create_payment_required(
                    resource=str(request.url),
                    amount_usd=paywall_config.amount,
                    description=paywall_config.description,
                )

                return JSONResponse(
                    status_code=402,
                    content=payment_required.model_dump(by_alias=True),
                    headers={"X-Payment-Required": "true"},
                )

            # Verify payment
            try:
                payment_header = decode_payment_header(payment_header_raw)
            except ValueError as exc:
                return JSONResponse(
                    status_code=400,
                    content={"detail": f"Invalid payment header: {exc}"},
                )

            import os

            server_recipient = paywall_config.recipient or os.getenv(
                "X402_RECIPIENT", ""
            )

            protocol = X402Protocol(recipient=server_recipient)
            expected_amount = protocol.amount_to_raw(paywall_config.amount)

            if not verify_payment_signature(
                payment_header,
                expected_recipient=server_recipient,
                expected_amount=expected_amount,
            ):
                return JSONResponse(
                    status_code=401,
                    content={"detail": "Payment verification failed"},
                )

            # Create a lightweight receipt for the request
            import uuid
            from datetime import datetime

            receipt = PaymentReceipt(
                id=uuid.uuid4(),
                payer=payment_header.payload.sender,
                payee=payment_header.payload.recipient,
                amount=Decimal(payment_header.payload.amount) / Decimal(10**6),
                token=paywall_config.token,
                resource=str(request.url),
                nonce=payment_header.payload.nonce,
                created_at=datetime.now(UTC),
            )

            request.state.x402_receipt = receipt

            return await func(*args, **kwargs)

        # Store the paywall config on the wrapper for introspection
        wrapper._x402_paywall = paywall_config  # type: ignore[attr-defined]
        return wrapper

    return decorator
