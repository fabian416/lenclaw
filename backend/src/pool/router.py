from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from src.db.session import get_session
from src.pool.schemas import PoolAPYResponse, PoolStatsResponse
from src.pool.service import PoolService

router = APIRouter(prefix="/pool", tags=["pool"])

_service = PoolService()


@router.get("/stats", response_model=PoolStatsResponse)
async def get_pool_stats(
    session: AsyncSession = Depends(get_session),
):
    data = await _service.get_pool_stats(session)
    return PoolStatsResponse(**data)


@router.get("/apy", response_model=PoolAPYResponse)
async def get_pool_apy(
    session: AsyncSession = Depends(get_session),
):
    data = await _service.get_pool_apy(session)
    return PoolAPYResponse(**data)
