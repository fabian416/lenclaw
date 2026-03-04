from __future__ import annotations

from fastapi import Depends, Header
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.service import AuthService
from src.common.exceptions import UnauthorizedError
from src.db.session import get_session

_auth_service: AuthService | None = None


def get_auth_service() -> AuthService:
    if _auth_service is None:
        raise RuntimeError("AuthService not initialized")
    return _auth_service


def init_auth_service(service: AuthService) -> None:
    global _auth_service
    _auth_service = service


async def get_current_wallet(
    authorization: str = Header(..., alias="Authorization"),
    session: AsyncSession = Depends(get_session),
    auth: AuthService = Depends(get_auth_service),
) -> str:
    """Extract and validate the bearer token, return the wallet address."""
    if not authorization.startswith("Bearer "):
        raise UnauthorizedError("Invalid authorization header")

    token = authorization[7:]
    return await auth.validate_token(session, token)
