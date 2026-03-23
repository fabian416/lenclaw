"""FastAPI middleware for x402 micropayment protocol.

Intercepts requests to protected endpoints, returns 402 Payment Required with
payment instructions, verifies payment headers on subsequent requests, and
settles payments via the facilitator.
"""

from __future__ import annotations

import logging
from decimal import Decimal
from typing import Any

import httpx
from fastapi import FastAPI, Request, Response
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint

from src.x402.protocol import (
    X402Protocol,
    decode_payment_header,
    verify_payment_signature,
)
from src.x402.schemas import PaywallConfig
from src.x402.service import X402Service

logger = logging.getLogger(__name__)

# Header names per x402 spec
X_PAYMENT_HEADER = "X-PAYMENT"
X_PAYMENT_RESPONSE_HEADER = "X-PAYMENT-RESPONSE"


class X402Middleware(BaseHTTPMiddleware):
    """FastAPI middleware that enforces x402 payment requirements.

    For each incoming request, checks if the route is protected by a paywall.
    If so:
    1. Looks for an X-PAYMENT header. If absent, responds with 402.
    2. If present, decodes and verifies the payment signature.
    3. Settles the payment via the configured facilitator.
    4. If settlement succeeds, attaches a PaymentReceipt and forwards to the handler.
    """

    def __init__(
        self,
        app: FastAPI,
        protocol: X402Protocol,
        service: X402Service,
        facilitator_url: str | None = None,
    ) -> None:
        super().__init__(app)
        self.protocol = protocol
        self.service = service
        self.facilitator_url = facilitator_url or protocol.facilitator_url
        self._protected_routes: dict[str, PaywallConfig] = {}

    def protect_route(
        self,
        path: str,
        amount: Decimal,
        token: str = "USDT",
        description: str | None = None,
        recipient: str | None = None,
    ) -> None:
        """Register a route as requiring x402 payment.

        Args:
            path: The URL path pattern to protect (e.g. "/api/v1/premium/data").
            amount: Payment amount in USD.
            token: Token symbol (default USDT).
            description: Human-readable description of what is being paid for.
            recipient: Override default payment recipient.
        """
        self._protected_routes[path] = PaywallConfig(
            amount=amount,
            token=token,
            description=description,
            recipient=recipient,
        )

    def is_protected(self, path: str) -> PaywallConfig | None:
        """Check if a request path matches a protected route.

        Supports exact match and prefix matching for parameterized routes.
        """
        # Exact match
        if path in self._protected_routes:
            return self._protected_routes[path]

        # Prefix match: check if any registered prefix covers this path
        for route_path, config in self._protected_routes.items():
            if route_path.endswith("*") and path.startswith(route_path[:-1]):
                return config

        return None

    async def dispatch(
        self, request: Request, call_next: RequestResponseEndpoint
    ) -> Response:
        """Intercept requests and enforce x402 payment requirements."""
        paywall = self.is_protected(request.url.path)

        if paywall is None:
            # Not a protected route, pass through
            return await call_next(request)

        # Check for payment header
        payment_header_raw = request.headers.get(X_PAYMENT_HEADER)

        if not payment_header_raw:
            # No payment header: return 402 Payment Required
            return self._create_402_response(request, paywall)

        # Decode and verify payment header
        try:
            payment_header = decode_payment_header(payment_header_raw)
        except ValueError as exc:
            return JSONResponse(
                status_code=400,
                content={"detail": f"Invalid payment header: {exc}"},
            )

        recipient = (paywall.recipient or self.protocol.recipient).lower()
        expected_amount = self.protocol.amount_to_raw(paywall.amount)

        if not verify_payment_signature(
            payment_header,
            expected_recipient=recipient,
            expected_amount=expected_amount,
        ):
            return JSONResponse(
                status_code=401,
                content={"detail": "Payment signature verification failed"},
            )

        # Check for replay (duplicate nonce)
        nonce = payment_header.payload.nonce
        if await self.service.is_nonce_used(nonce):
            return JSONResponse(
                status_code=409,
                content={"detail": "Payment nonce already used (replay detected)"},
            )

        # Settle via facilitator if configured
        tx_hash = None
        if self.facilitator_url:
            tx_hash = await self._settle_via_facilitator(payment_header_raw)
            if tx_hash is None:
                return JSONResponse(
                    status_code=502,
                    content={"detail": "Payment settlement failed"},
                )

        # Record the payment
        receipt = await self.service.record_payment(
            payer=payment_header.payload.sender,
            payee=recipient,
            amount=self.protocol.raw_to_amount(payment_header.payload.amount),
            token=paywall.token,
            resource=str(request.url),
            nonce=nonce,
            tx_hash=tx_hash,
        )

        # Attach receipt to request state for downstream handlers
        request.state.x402_receipt = receipt

        # Process the actual request
        response = await call_next(request)

        # Add payment receipt info to response header
        response.headers[X_PAYMENT_RESPONSE_HEADER] = receipt.id.hex

        return response

    def _create_402_response(
        self, request: Request, paywall: PaywallConfig
    ) -> JSONResponse:
        """Build a 402 Payment Required response with payment instructions."""
        payment_required = self.protocol.create_payment_required(
            resource=str(request.url),
            amount_usd=paywall.amount,
            description=paywall.description,
        )

        return JSONResponse(
            status_code=402,
            content=payment_required.model_dump(by_alias=True),
            headers={
                "X-Payment-Required": "true",
                "Content-Type": "application/json",
            },
        )

    async def _settle_via_facilitator(self, payment_header_raw: str) -> str | None:
        """Submit payment to the facilitator for on-chain settlement.

        Args:
            payment_header_raw: The raw base64-encoded payment header.

        Returns:
            Transaction hash if settlement succeeded, None otherwise.
        """
        if not self.facilitator_url:
            return None

        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                resp = await client.post(
                    f"{self.facilitator_url}/settle",
                    json={"paymentHeader": payment_header_raw},
                    headers={"Content-Type": "application/json"},
                )

                if resp.status_code == 200:
                    data = resp.json()
                    return data.get("txHash") or data.get("tx_hash")

                logger.error(
                    "Facilitator settlement failed: status=%d body=%s",
                    resp.status_code,
                    resp.text,
                )
                return None

        except httpx.HTTPError:
            logger.exception(
                "Failed to connect to facilitator at %s", self.facilitator_url
            )
            return None


def setup_x402_middleware(
    app: FastAPI,
    recipient: str,
    facilitator_url: str | None = None,
    lockbox_address: str | None = None,
    protected_routes: dict[str, dict[str, Any]] | None = None,
) -> X402Middleware:
    """Convenience function to configure and add x402 middleware to a FastAPI app.

    Args:
        app: The FastAPI application instance.
        recipient: Default payment recipient wallet address.
        facilitator_url: URL of the x402 facilitator service.
        lockbox_address: RevenueLockbox contract address for revenue routing.
        protected_routes: Dict mapping path patterns to paywall configs,
            e.g. {"/api/v1/premium/*": {"amount": "0.01", "description": "Premium API"}}.

    Returns:
        The configured X402Middleware instance.
    """
    protocol = X402Protocol(
        recipient=recipient,
        facilitator_url=facilitator_url,
    )
    service = X402Service(lockbox_address=lockbox_address)

    middleware = X402Middleware(
        app=app,
        protocol=protocol,
        service=service,
        facilitator_url=facilitator_url,
    )

    if protected_routes:
        for path, config in protected_routes.items():
            middleware.protect_route(
                path=path,
                amount=Decimal(str(config.get("amount", "0.01"))),
                token=config.get("token", "USDT"),
                description=config.get("description"),
                recipient=config.get("recipient"),
            )

    return middleware
