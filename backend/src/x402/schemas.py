"""Pydantic models for x402 micropayment protocol."""

from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal
from enum import StrEnum

from pydantic import BaseModel, Field


class PaymentStatus(StrEnum):
    PENDING = "pending"
    VERIFIED = "verified"
    SETTLED = "settled"
    FAILED = "failed"
    EXPIRED = "expired"


class SupportedToken(BaseModel):
    """A token accepted for x402 payments."""

    symbol: str = Field(..., description="Token symbol, e.g. USDC")
    address: str = Field(..., description="Token contract address")
    decimals: int = Field(..., description="Token decimal places")
    chain_id: int = Field(..., description="Chain ID where token lives")


class PaymentRequired(BaseModel):
    """The 402 Payment Required response body sent to clients.

    Follows the x402 protocol specification for payment instructions.
    """

    x402_version: int = Field(default=1, alias="x402Version")
    scheme: str = Field(default="exact", description="Payment scheme: exact or upto")
    network: str = Field(default="base-mainnet", description="Network identifier")
    recipient: str = Field(..., description="Payment recipient address (payee)")
    token: str = Field(..., description="Token contract address for payment")
    amount: str = Field(
        ..., description="Payment amount in smallest unit (e.g. USDC has 6 decimals)"
    )
    description: str | None = Field(
        default=None, description="Human-readable payment description"
    )
    resource: str = Field(..., description="The URL of the resource being paid for")
    max_timeout_seconds: int = Field(
        default=60,
        alias="maxTimeoutSeconds",
        description="Maximum seconds before payment expires",
    )
    facilitator: str | None = Field(
        default=None, description="Facilitator URL for payment settlement"
    )
    extra: dict | None = Field(
        default=None, description="Additional protocol-specific fields"
    )

    model_config = {"populate_by_name": True}


class PaymentHeader(BaseModel):
    """Parsed x402 payment header from the client request.

    The client sends this as the X-PAYMENT or PAYMENT-SIGNATURE header
    after receiving a 402 response.
    """

    x402_version: int = Field(default=1, alias="x402Version")
    scheme: str = Field(default="exact")
    network: str = Field(default="base-mainnet")
    payload: PaymentPayload
    signature: str = Field(..., description="EIP-712 typed data signature")

    model_config = {"populate_by_name": True}


class PaymentPayload(BaseModel):
    """The signed payment payload within a payment header."""

    sender: str = Field(..., description="Payer wallet address")
    recipient: str = Field(..., description="Payee wallet address")
    token: str = Field(..., description="Token contract address")
    amount: str = Field(..., description="Amount in token smallest unit")
    nonce: str = Field(..., description="Unique nonce to prevent replay")
    valid_until: int = Field(
        ..., alias="validUntil", description="Unix timestamp expiry"
    )

    model_config = {"populate_by_name": True}


class PaymentReceipt(BaseModel):
    """A verified and settled payment receipt."""

    id: uuid.UUID = Field(default_factory=uuid.uuid4)
    payer: str = Field(..., description="Payer wallet address")
    payee: str = Field(..., description="Payee wallet address")
    amount: Decimal = Field(..., description="Amount in human-readable units")
    token: str = Field(default="USDC", description="Token symbol")
    chain_id: int = Field(default=8453, description="Chain ID")
    tx_hash: str | None = Field(
        default=None, description="On-chain settlement transaction hash"
    )
    resource: str = Field(..., description="URL of the resource paid for")
    status: PaymentStatus = Field(default=PaymentStatus.VERIFIED)
    nonce: str = Field(..., description="Payment nonce")
    created_at: datetime = Field(default_factory=datetime.utcnow)
    settled_at: datetime | None = Field(default=None)
    lockbox_address: str | None = Field(
        default=None, description="RevenueLockbox that received the payment"
    )

    model_config = {"from_attributes": True}


class PaymentConfig(BaseModel):
    """x402 configuration for this server."""

    x402_version: int = Field(default=1, alias="x402Version")
    supported_tokens: list[SupportedToken] = Field(default_factory=list)
    facilitator_url: str | None = Field(
        default=None, description="URL of the payment facilitator"
    )
    network: str = Field(default="base-mainnet")
    chain_id: int = Field(default=8453)
    recipient: str = Field(..., description="Default payment recipient (server wallet)")
    lockbox_address: str | None = Field(
        default=None, description="RevenueLockbox contract for revenue routing"
    )
    min_payment_usd: Decimal = Field(
        default=Decimal("0.001"), description="Minimum payment amount in USD"
    )
    max_payment_usd: Decimal = Field(
        default=Decimal("100.00"), description="Maximum single payment in USD"
    )

    model_config = {"populate_by_name": True}


class PaymentVerifyRequest(BaseModel):
    """Request body for POST /api/v1/x402/verify."""

    payment_header: str = Field(..., description="Base64-encoded payment header JSON")
    resource: str = Field(..., description="The resource URL being paid for")


class PaymentVerifyResponse(BaseModel):
    """Response for payment verification."""

    valid: bool
    receipt: PaymentReceipt | None = None
    error: str | None = None


class PaymentListResponse(BaseModel):
    """Paginated payment history response."""

    items: list[PaymentReceipt]
    total: int
    page: int
    page_size: int


class PaywallConfig(BaseModel):
    """Configuration for a paywalled endpoint."""

    amount: Decimal = Field(..., description="Payment amount in USD")
    token: str = Field(default="USDC", description="Token symbol")
    description: str | None = Field(default=None)
    recipient: str | None = Field(
        default=None, description="Override default recipient"
    )
