"""FastAPI router for fiat on/off ramp endpoints."""

from __future__ import annotations

import logging
from decimal import Decimal

from fastapi import APIRouter, Depends, Header, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.dependencies import get_current_wallet
from src.common.exceptions import BadRequestError
from src.db.session import get_session
from src.fiat.models import FiatRampType
from src.fiat.schemas import (
    CreateRampSessionRequest,
    FiatTransactionListResponse,
    FiatTransactionResponse,
    RampSession,
    RateQuote,
)
from src.fiat.service import FiatRampService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/fiat", tags=["fiat"])

_service = FiatRampService()


# ---------- On-ramp (buy crypto) ---------- #


@router.post("/onramp/session", response_model=RampSession, status_code=201)
async def create_onramp_session(
    body: CreateRampSessionRequest,
    session: AsyncSession = Depends(get_session),
    wallet: str = Depends(get_current_wallet),
):
    """Create a Transak on-ramp session to buy USDC with fiat."""
    result = await _service.create_onramp_session(
        session=session,
        user_address=wallet,
        fiat_currency=body.fiat_currency,
        fiat_amount=body.fiat_amount,
        crypto_currency=body.crypto_currency,
        wallet_address=body.wallet_address,
        network=body.network,
        redirect_url=body.redirect_url,
    )
    return RampSession(**result)


# ---------- Off-ramp (sell crypto) ---------- #


@router.post("/offramp/session", response_model=RampSession, status_code=201)
async def create_offramp_session(
    body: CreateRampSessionRequest,
    session: AsyncSession = Depends(get_session),
    wallet: str = Depends(get_current_wallet),
):
    """Create a Transak off-ramp session to sell USDC for fiat."""
    result = await _service.create_offramp_session(
        session=session,
        user_address=wallet,
        fiat_currency=body.fiat_currency,
        fiat_amount=body.fiat_amount,
        crypto_currency=body.crypto_currency,
        wallet_address=body.wallet_address,
        network=body.network,
        redirect_url=body.redirect_url,
    )
    return RampSession(**result)


# ---------- Webhook ---------- #


@router.post("/webhook", status_code=200)
async def handle_webhook(
    request: Request,
    session: AsyncSession = Depends(get_session),
    x_transak_signature: str = Header("", alias="x-transak-signature"),
):
    """Receive Transak webhook for transaction status updates.

    This endpoint must be publicly accessible (no auth).
    Verification is done via HMAC signature in the x-transak-signature header.
    """
    raw_body = await request.body()

    # Verify HMAC signature
    if not _service.verify_webhook_signature(raw_body, x_transak_signature):
        raise BadRequestError("Invalid webhook signature")

    payload = await request.json()
    webhook_data = payload.get("webhookData") or payload.get("webhook_data")
    if not webhook_data:
        raise BadRequestError("Missing webhookData in payload")

    order_id = webhook_data.get("id")
    status = webhook_data.get("status")
    if not order_id or not status:
        raise BadRequestError("Missing id or status in webhookData")

    tx = await _service.process_webhook(
        session=session,
        order_id=order_id,
        status=status,
        crypto_amount=(
            Decimal(str(webhook_data["cryptoAmount"]))
            if webhook_data.get("cryptoAmount")
            else None
        ),
        transaction_hash=webhook_data.get("transactionHash"),
        fiat_amount=(
            Decimal(str(webhook_data["fiatAmount"]))
            if webhook_data.get("fiatAmount")
            else None
        ),
        wallet_address=webhook_data.get("walletAddress"),
        failure_reason=webhook_data.get("statusReason"),
    )

    return {"status": "ok", "transaction_id": str(tx.id), "new_status": tx.status.value}


# ---------- Transaction history ---------- #


@router.get("/transactions", response_model=FiatTransactionListResponse)
async def list_transactions(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    type: FiatRampType | None = Query(None, description="Filter by onramp or offramp"),
    session: AsyncSession = Depends(get_session),
    wallet: str = Depends(get_current_wallet),
):
    """List the authenticated user's fiat ramp transactions."""
    transactions, total = await _service.list_transactions(
        session=session,
        user_address=wallet,
        page=page,
        page_size=page_size,
        ramp_type=type,
    )
    return FiatTransactionListResponse(
        items=[FiatTransactionResponse.model_validate(t) for t in transactions],
        total=total,
        page=page,
        page_size=page_size,
    )


# ---------- Rate quotes ---------- #


@router.get("/rates", response_model=RateQuote)
async def get_rates(
    fiat_currency: str = Query("USD", pattern=r"^(USD|EUR)$"),
    crypto_currency: str = Query("USDC"),
    fiat_amount: Decimal = Query(Decimal("100"), gt=0),
    network: str = Query("base"),
):
    """Get a live conversion rate quote. No authentication required."""
    result = await _service.get_rate_quote(
        fiat_currency=fiat_currency,
        crypto_currency=crypto_currency,
        fiat_amount=fiat_amount,
        network=network,
    )
    return RateQuote(**result)
