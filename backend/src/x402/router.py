"""x402 payment API endpoints.

Provides configuration, payment history, and verification endpoints
for the x402 micropayment protocol.
"""

from __future__ import annotations

import os

from fastapi import APIRouter, Depends, Query

from src.x402.schemas import (
    PaymentConfig,
    PaymentListResponse,
    PaymentStatus,
    PaymentVerifyRequest,
    PaymentVerifyResponse,
)
from src.x402.service import X402Service

router = APIRouter(prefix="/x402", tags=["x402"])

# Module-level service instance, initialized at import time with env vars.
# In production, inject via dependency or lifespan initialization.
_service: X402Service | None = None


def _get_service() -> X402Service:
    """Lazy-initialize and return the X402Service singleton."""
    global _service
    if _service is None:
        _service = X402Service(
            lockbox_address=os.getenv("X402_LOCKBOX_ADDRESS"),
            facilitator_url=os.getenv("X402_FACILITATOR_URL"),
            recipient=os.getenv("X402_RECIPIENT", ""),
        )
    return _service


def init_x402_service(service: X402Service) -> None:
    """Initialize the x402 service (called from app lifespan or setup)."""
    global _service
    _service = service


def get_x402_service() -> X402Service:
    """FastAPI dependency to get the x402 service."""
    return _get_service()


@router.get("/config", response_model=PaymentConfig)
async def get_config(
    service: X402Service = Depends(get_x402_service),
) -> PaymentConfig:
    """Get x402 payment configuration.

    Returns supported tokens, chains, facilitator URL, and payment recipient
    information needed by clients to construct x402 payments.
    """
    return service.get_config()


@router.get("/payments", response_model=PaymentListResponse)
async def list_payments(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    payer: str | None = Query(None, description="Filter by payer address"),
    payee: str | None = Query(None, description="Filter by payee address"),
    status: PaymentStatus | None = Query(None, description="Filter by status"),
    service: X402Service = Depends(get_x402_service),
) -> PaymentListResponse:
    """List x402 payment receipts with optional filtering.

    Returns paginated payment history, filterable by payer, payee, or status.
    """
    return await service.list_payments(
        page=page,
        page_size=page_size,
        payer=payer,
        payee=payee,
        status=status,
    )


@router.post("/verify", response_model=PaymentVerifyResponse)
async def verify_payment(
    body: PaymentVerifyRequest,
    service: X402Service = Depends(get_x402_service),
) -> PaymentVerifyResponse:
    """Verify an x402 payment header and return a receipt.

    Accepts a base64-encoded payment header and the resource URL. Verifies
    the signature, checks for replay, optionally settles via the facilitator,
    and returns a payment receipt.
    """
    valid, receipt, error = await service.verify_payment_receipt(
        payment_header=body.payment_header,
        resource=body.resource,
    )

    return PaymentVerifyResponse(
        valid=valid,
        receipt=receipt,
        error=error,
    )
