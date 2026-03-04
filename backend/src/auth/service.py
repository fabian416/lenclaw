from __future__ import annotations

import logging
import secrets
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from siwe import SiweMessage

from src.common.config import AuthSettings
from src.common.exceptions import UnauthorizedError
from src.db.models import AccessToken, SiweNonce

logger = logging.getLogger(__name__)


class AuthService:
    def __init__(self, settings: AuthSettings):
        self.settings = settings

    async def create_nonce(self, session: AsyncSession) -> str:
        nonce = secrets.token_hex(16)
        expires_at = datetime.now(timezone.utc) + timedelta(
            minutes=self.settings.nonce_expire_minutes
        )
        db_nonce = SiweNonce(nonce=nonce, expires_at=expires_at)
        session.add(db_nonce)
        await session.flush()
        logger.info("Created nonce=%s expires_at=%s", nonce[:8], expires_at.isoformat())
        return nonce

    async def verify_siwe(
        self, session: AsyncSession, message: str, signature: str
    ) -> dict[str, str]:
        """Verify SIWE message and signature, return wallet + access token."""
        try:
            siwe_msg = SiweMessage.from_message(message)
        except Exception as e:
            logger.error("Failed to parse SIWE message: %s", e)
            raise UnauthorizedError("Invalid SIWE message") from e

        address = siwe_msg.address.lower()
        nonce_value = siwe_msg.nonce

        if not nonce_value:
            raise UnauthorizedError("Missing nonce in SIWE message")

        # Validate nonce in DB
        now = datetime.now(timezone.utc)
        result = await session.execute(
            select(SiweNonce).where(
                SiweNonce.nonce == nonce_value,
                SiweNonce.used.is_(False),
                SiweNonce.expires_at > now,
            )
        )
        stored_nonce = result.scalar_one_or_none()

        if stored_nonce is None:
            logger.warning("Invalid or expired nonce: %s", nonce_value[:8])
            raise UnauthorizedError("Invalid or expired nonce")

        # Verify signature
        try:
            siwe_msg.verify(signature)
        except Exception as e:
            logger.warning(
                "SIWE signature verification failed for address=%s: %s", address, e
            )
            raise UnauthorizedError("Invalid SIWE signature") from e

        # Mark nonce as used
        stored_nonce.used = True
        await session.flush()

        # Create access token
        token = await self._create_access_token(session, address)
        logger.info("SIWE verified for address=%s", address)

        return {"wallet": address, "access_token": token}

    async def validate_token(self, session: AsyncSession, token: str) -> str:
        """Validate an access token and return the wallet address."""
        now = datetime.now(timezone.utc)
        result = await session.execute(
            select(AccessToken).where(
                AccessToken.token == token,
                AccessToken.expires_at > now,
                AccessToken.revoked_at.is_(None),
            )
        )
        record = result.scalar_one_or_none()

        if record is None:
            raise UnauthorizedError("Invalid or expired token")

        return record.wallet_address

    async def refresh_token(
        self, session: AsyncSession, current_token: str
    ) -> dict[str, str]:
        """Refresh an access token."""
        result = await session.execute(
            select(AccessToken).where(AccessToken.token == current_token)
        )
        record = result.scalar_one_or_none()

        if record is None:
            raise UnauthorizedError("Invalid token")

        if record.revoked_at is not None:
            raise UnauthorizedError("Token revoked")

        grace_minutes = 15
        if (
            record.expires_at
            and record.expires_at + timedelta(minutes=grace_minutes)
            < datetime.now(timezone.utc)
        ):
            raise UnauthorizedError("Token expired beyond refresh window")

        # Revoke old token
        record.revoked_at = datetime.now(timezone.utc)
        await session.flush()

        # Issue new token
        new_token = await self._create_access_token(session, record.wallet_address)
        return {"wallet": record.wallet_address, "access_token": new_token}

    async def _create_access_token(
        self, session: AsyncSession, wallet: str
    ) -> str:
        token = secrets.token_hex(24)
        expires_at = datetime.now(timezone.utc) + timedelta(
            minutes=self.settings.access_token_expire_minutes
        )
        db_token = AccessToken(
            token=token,
            wallet_address=wallet.lower(),
            expires_at=expires_at,
        )
        session.add(db_token)
        await session.flush()
        return token
