"""Pydantic schemas for the secondary tranche market API."""

from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel

from src.market.models import MarketListingStatus, MarketTrancheType


# ---------- Listing ---------- #


class ListingResponse(BaseModel):
    id: uuid.UUID
    chain_listing_id: int
    seller_address: str
    tranche: MarketTrancheType
    shares: Decimal
    price_per_share: Decimal
    total_price: Decimal
    status: MarketListingStatus
    tx_hash: str | None
    block_number: int | None
    listed_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ListingListResponse(BaseModel):
    items: list[ListingResponse]
    total: int
    page: int
    page_size: int


# ---------- Trade ---------- #


class TradeResponse(BaseModel):
    id: uuid.UUID
    chain_listing_id: int
    buyer_address: str
    seller_address: str
    tranche: MarketTrancheType
    shares: Decimal
    total_price: Decimal
    fee: Decimal
    tx_hash: str | None
    block_number: int | None
    traded_at: datetime

    model_config = {"from_attributes": True}


class TradeListResponse(BaseModel):
    items: list[TradeResponse]
    total: int
    page: int
    page_size: int


# ---------- Stats ---------- #


class MarketStats(BaseModel):
    total_active_listings: int
    total_volume: Decimal
    total_trades: int
    total_fees_collected: Decimal
    avg_senior_price: Decimal
    avg_junior_price: Decimal
    senior_listings_count: int
    junior_listings_count: int
