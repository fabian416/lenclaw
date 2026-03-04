from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.dependencies import get_auth_service
from src.auth.schemas import (
    AuthTokenResponse,
    NonceResponse,
    RefreshRequest,
    SiweVerifyRequest,
)
from src.auth.service import AuthService
from src.db.session import get_session

router = APIRouter(prefix="/auth/siwe", tags=["auth"])


@router.post("/nonce", response_model=NonceResponse)
async def get_nonce(
    session: AsyncSession = Depends(get_session),
    auth: AuthService = Depends(get_auth_service),
):
    nonce = await auth.create_nonce(session)
    return NonceResponse(nonce=nonce)


@router.post("/verify", response_model=AuthTokenResponse)
async def verify_siwe(
    body: SiweVerifyRequest,
    session: AsyncSession = Depends(get_session),
    auth: AuthService = Depends(get_auth_service),
):
    result = await auth.verify_siwe(session, body.message, body.signature)
    return AuthTokenResponse(
        wallet=result["wallet"],
        access_token=result["access_token"],
    )


@router.post("/refresh", response_model=AuthTokenResponse)
async def refresh_token(
    body: RefreshRequest,
    session: AsyncSession = Depends(get_session),
    auth: AuthService = Depends(get_auth_service),
):
    result = await auth.refresh_token(session, body.token)
    return AuthTokenResponse(
        wallet=result["wallet"],
        access_token=result["access_token"],
    )
