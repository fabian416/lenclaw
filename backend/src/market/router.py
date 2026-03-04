"""FastAPI router for the secondary tranche market."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from src.db.session import get_session
from src.market.models import MarketListingStatus, MarketTrancheType
from src.market.schemas import (
    ListingListResponse,
    ListingResponse,
    MarketStats,
    TradeListResponse,
    TradeResponse,
)
from src.market.service import MarketService

router = APIRouter(prefix="/market", tags=["market"])

_service = MarketService()


@router.get("/listings", response_model=ListingListResponse)
async def list_listings(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    status: MarketListingStatus | None = None,
    tranche: MarketTrancheType | None = None,
    seller: str | None = None,
    sort_by: str = Query("listed_at", pattern="^(listed_at|price_per_share|shares|total_price)$"),
    sort_dir: str = Query("desc", pattern="^(asc|desc)$"),
    session: AsyncSession = Depends(get_session),
):
    """List market listings with optional filters and sorting."""
    listings, total = await _service.list_listings(
        session,
        page=page,
        page_size=page_size,
        status=status,
        tranche=tranche,
        seller=seller,
        sort_by=sort_by,
        sort_dir=sort_dir,
    )
    return ListingListResponse(
        items=[ListingResponse.model_validate(l) for l in listings],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/history", response_model=TradeListResponse)
async def list_trade_history(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    tranche: MarketTrancheType | None = None,
    address: str | None = None,
    session: AsyncSession = Depends(get_session),
):
    """List trade history with optional filters."""
    trades, total = await _service.list_trades(
        session,
        page=page,
        page_size=page_size,
        tranche=tranche,
        address=address,
    )
    return TradeListResponse(
        items=[TradeResponse.model_validate(t) for t in trades],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/stats", response_model=MarketStats)
async def get_market_stats(
    session: AsyncSession = Depends(get_session),
):
    """Get aggregated market statistics."""
    data = await _service.get_stats(session)
    return MarketStats(**data)
