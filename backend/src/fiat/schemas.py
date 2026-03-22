"""Pydantic v2 schemas for fiat on/off ramp endpoints."""

from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, Field

from src.fiat.models import FiatRampType, FiatTransactionStatus

# ---------- Request Schemas ---------- #


class CreateRampSessionRequest(BaseModel):
    """Request body for creating an on-ramp or off-ramp session."""

    fiat_currency: str = Field(
        "USD", pattern=r"^(USD|EUR)$", description="Fiat currency code"
    )
    fiat_amount: Decimal = Field(
        ..., gt=0, le=50_000, description="Amount in fiat currency"
    )
    crypto_currency: str = Field("USDC", description="Target crypto currency")
    wallet_address: str = Field(
        ..., min_length=42, max_length=42, description="Destination wallet address"
    )
    network: str = Field("base", description="Blockchain network")
    redirect_url: str | None = Field(
        None, description="URL to redirect after completion"
    )


# ---------- Response Schemas ---------- #


class RampSession(BaseModel):
    """Response containing the ramp session/widget URL."""

    session_id: str = Field(..., description="Provider session or order ID")
    widget_url: str = Field(..., description="URL to embed in iframe or open")
    transaction_id: uuid.UUID = Field(
        ..., description="Internal transaction tracking ID"
    )
    provider: str = Field("transak", description="Ramp provider name")
    expires_in: int = Field(1800, description="Session expiry in seconds")


class FiatTransactionResponse(BaseModel):
    """Fiat transaction record for API responses."""

    id: uuid.UUID
    user_address: str
    type: FiatRampType
    amount_fiat: Decimal
    amount_crypto: Decimal | None
    fiat_currency: str
    crypto_currency: str
    status: FiatTransactionStatus
    provider: str
    provider_order_id: str | None
    network: str
    wallet_address: str | None
    tx_hash: str | None
    failure_reason: str | None
    created_at: datetime
    updated_at: datetime
    completed_at: datetime | None

    model_config = {"from_attributes": True}


class FiatTransactionListResponse(BaseModel):
    """Paginated list of fiat transactions."""

    items: list[FiatTransactionResponse]
    total: int
    page: int
    page_size: int


# ---------- Webhook Schemas ---------- #


class WebhookPayload(BaseModel):
    """Inbound webhook payload from Transak."""

    webhook_data: WebhookData


class WebhookData(BaseModel):
    """Nested data object within Transak webhook."""

    id: str = Field(..., description="Transak order ID")
    status: str = Field(..., description="Transak order status")
    fiat_currency: str | None = Field(None, alias="fiatCurrency")
    fiat_amount: Decimal | None = Field(None, alias="fiatAmount")
    crypto_currency: str | None = Field(None, alias="cryptoCurrency")
    crypto_amount: Decimal | None = Field(None, alias="cryptoAmount")
    wallet_address: str | None = Field(None, alias="walletAddress")
    transaction_hash: str | None = Field(None, alias="transactionHash")
    network: str | None = None
    status_reason: str | None = Field(None, alias="statusReason")
    is_buy_or_sell: str | None = Field(None, alias="isBuyOrSell")

    model_config = {"populate_by_name": True}


# Re-order to allow forward reference resolution
WebhookPayload.model_rebuild()


# ---------- Rate Quote ---------- #


class RateQuote(BaseModel):
    """Conversion rate quote for a fiat/crypto pair."""

    fiat_currency: str = Field(..., description="Source fiat currency")
    crypto_currency: str = Field(..., description="Target crypto currency")
    rate: Decimal = Field(..., description="Conversion rate (crypto per 1 fiat unit)")
    fiat_amount: Decimal = Field(..., description="Quoted fiat amount")
    crypto_amount: Decimal = Field(
        ..., description="Estimated crypto amount after fees"
    )
    fee: Decimal = Field(..., description="Provider fee in fiat currency")
    network: str = Field("base", description="Blockchain network")
    provider: str = Field("transak", description="Quote source")
    valid_for_seconds: int = Field(30, description="Quote validity window")
