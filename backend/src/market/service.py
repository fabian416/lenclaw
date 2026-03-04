"""Service layer for the secondary tranche market."""

from __future__ import annotations

import logging
from decimal import Decimal

from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.market.models import (
    MarketListing,
    MarketListingStatus,
    MarketTrade,
    MarketTrancheType,
)

logger = logging.getLogger(__name__)


class MarketService:
    """Queries and aggregates for market listings and trade history."""

    # ----------------------------------------------------------------
    # Listings
    # ----------------------------------------------------------------

    async def list_listings(
        self,
        session: AsyncSession,
        page: int = 1,
        page_size: int = 20,
        status: MarketListingStatus | None = None,
        tranche: MarketTrancheType | None = None,
        seller: str | None = None,
        sort_by: str = "listed_at",
        sort_dir: str = "desc",
    ) -> tuple[list[MarketListing], int]:
        query = select(MarketListing)
        count_query = select(func.count(MarketListing.id))

        # Filters
        if status is not None:
            query = query.where(MarketListing.status == status)
            count_query = count_query.where(MarketListing.status == status)
        if tranche is not None:
            query = query.where(MarketListing.tranche == tranche)
            count_query = count_query.where(MarketListing.tranche == tranche)
        if seller is not None:
            lower_seller = seller.lower()
            query = query.where(MarketListing.seller_address == lower_seller)
            count_query = count_query.where(
                MarketListing.seller_address == lower_seller
            )

        # Sorting
        sort_column = getattr(MarketListing, sort_by, MarketListing.listed_at)
        if sort_dir == "asc":
            query = query.order_by(sort_column.asc())
        else:
            query = query.order_by(sort_column.desc())

        # Count
        total_result = await session.execute(count_query)
        total = total_result.scalar() or 0

        # Paginate
        query = query.offset((page - 1) * page_size).limit(page_size)
        result = await session.execute(query)
        listings = list(result.scalars().all())

        return listings, total

    # ----------------------------------------------------------------
    # Trade history
    # ----------------------------------------------------------------

    async def list_trades(
        self,
        session: AsyncSession,
        page: int = 1,
        page_size: int = 20,
        tranche: MarketTrancheType | None = None,
        address: str | None = None,
    ) -> tuple[list[MarketTrade], int]:
        query = select(MarketTrade)
        count_query = select(func.count(MarketTrade.id))

        if tranche is not None:
            query = query.where(MarketTrade.tranche == tranche)
            count_query = count_query.where(MarketTrade.tranche == tranche)

        if address is not None:
            lower_addr = address.lower()
            addr_filter = (MarketTrade.buyer_address == lower_addr) | (
                MarketTrade.seller_address == lower_addr
            )
            query = query.where(addr_filter)
            count_query = count_query.where(addr_filter)

        query = query.order_by(MarketTrade.traded_at.desc())

        total_result = await session.execute(count_query)
        total = total_result.scalar() or 0

        query = query.offset((page - 1) * page_size).limit(page_size)
        result = await session.execute(query)
        trades = list(result.scalars().all())

        return trades, total

    # ----------------------------------------------------------------
    # Aggregate stats
    # ----------------------------------------------------------------

    async def get_stats(self, session: AsyncSession) -> dict:
        # Active listings count
        active_count_q = select(func.count(MarketListing.id)).where(
            MarketListing.status == MarketListingStatus.ACTIVE
        )
        active_res = await session.execute(active_count_q)
        total_active = active_res.scalar() or 0

        # Total volume and fees from trades
        vol_q = select(
            func.coalesce(func.sum(MarketTrade.total_price), 0),
            func.count(MarketTrade.id),
            func.coalesce(func.sum(MarketTrade.fee), 0),
        )
        vol_res = await session.execute(vol_q)
        vol_row = vol_res.one()
        total_volume = vol_row[0]
        total_trades = vol_row[1]
        total_fees = vol_row[2]

        # Average prices per tranche (active listings only)
        avg_q = select(
            MarketListing.tranche,
            func.coalesce(func.avg(MarketListing.price_per_share), 0),
            func.count(MarketListing.id),
        ).where(
            MarketListing.status == MarketListingStatus.ACTIVE
        ).group_by(MarketListing.tranche)

        avg_res = await session.execute(avg_q)
        avg_rows = avg_res.all()

        avg_senior = Decimal(0)
        avg_junior = Decimal(0)
        senior_count = 0
        junior_count = 0

        for row in avg_rows:
            if row[0] == MarketTrancheType.SENIOR:
                avg_senior = Decimal(str(row[1]))
                senior_count = row[2]
            elif row[0] == MarketTrancheType.JUNIOR:
                avg_junior = Decimal(str(row[1]))
                junior_count = row[2]

        return {
            "total_active_listings": total_active,
            "total_volume": Decimal(str(total_volume)),
            "total_trades": total_trades,
            "total_fees_collected": Decimal(str(total_fees)),
            "avg_senior_price": avg_senior,
            "avg_junior_price": avg_junior,
            "senior_listings_count": senior_count,
            "junior_listings_count": junior_count,
        }
