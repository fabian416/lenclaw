"""Tests for SIWE authentication service."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

try:
    from src.auth.service import AuthService
except ImportError:
    AuthService = None  # type: ignore[assignment,misc]

from src.common.exceptions import UnauthorizedError
from tests.conftest import make_access_token

pytestmark = pytest.mark.skipif(
    AuthService is None, reason="siwe package not installed"
)


class TestCreateNonce:
    async def test_creates_nonce_and_stores_in_db(
        self, auth_service: AuthService, mock_session: AsyncMock
    ):
        nonce = await auth_service.create_nonce(mock_session)

        assert isinstance(nonce, str)
        assert len(nonce) == 32  # 16 bytes hex = 32 chars
        mock_session.add.assert_called_once()
        mock_session.flush.assert_awaited_once()

    async def test_each_nonce_is_unique(
        self, auth_service: AuthService, mock_session: AsyncMock
    ):
        nonce1 = await auth_service.create_nonce(mock_session)
        nonce2 = await auth_service.create_nonce(mock_session)
        assert nonce1 != nonce2


class TestValidateToken:
    async def test_valid_token_returns_wallet(
        self, auth_service: AuthService, mock_session: AsyncMock
    ):
        wallet = "0x742d35cc6634c0532925a3b844bc9e7595f2bd1e"
        token = make_access_token(wallet)
        result_mock = MagicMock()
        result_mock.scalar_one_or_none.return_value = token
        mock_session.execute.return_value = result_mock

        result = await auth_service.validate_token(mock_session, token.token)
        assert result == wallet

    async def test_expired_token_raises_unauthorized(
        self, auth_service: AuthService, mock_session: AsyncMock
    ):
        result_mock = MagicMock()
        result_mock.scalar_one_or_none.return_value = None
        mock_session.execute.return_value = result_mock

        with pytest.raises(UnauthorizedError, match="Invalid or expired token"):
            await auth_service.validate_token(mock_session, "expired-token")

    async def test_revoked_token_returns_none(
        self, auth_service: AuthService, mock_session: AsyncMock
    ):
        # Revoked tokens should not be found by the query (revoked_at is not None)
        result_mock = MagicMock()
        result_mock.scalar_one_or_none.return_value = None
        mock_session.execute.return_value = result_mock

        with pytest.raises(UnauthorizedError):
            await auth_service.validate_token(mock_session, "revoked-token")


class TestRefreshToken:
    async def test_valid_refresh_revokes_old_and_creates_new(
        self, auth_service: AuthService, mock_session: AsyncMock
    ):
        wallet = "0x742d35cc6634c0532925a3b844bc9e7595f2bd1e"
        old_token = make_access_token(wallet)

        # First execute: find old token; second execute: flush new token
        result_mock = MagicMock()
        result_mock.scalar_one_or_none.return_value = old_token
        mock_session.execute.return_value = result_mock

        result = await auth_service.refresh_token(mock_session, old_token.token)

        assert result["wallet"] == wallet
        assert "access_token" in result
        assert old_token.revoked_at is not None

    async def test_invalid_token_raises_unauthorized(
        self, auth_service: AuthService, mock_session: AsyncMock
    ):
        result_mock = MagicMock()
        result_mock.scalar_one_or_none.return_value = None
        mock_session.execute.return_value = result_mock

        with pytest.raises(UnauthorizedError, match="Invalid token"):
            await auth_service.refresh_token(mock_session, "nonexistent-token")

    async def test_already_revoked_token_raises_unauthorized(
        self, auth_service: AuthService, mock_session: AsyncMock
    ):
        wallet = "0x742d35cc6634c0532925a3b844bc9e7595f2bd1e"
        revoked_token = make_access_token(wallet, {"revoked_at": datetime.now(UTC)})

        result_mock = MagicMock()
        result_mock.scalar_one_or_none.return_value = revoked_token
        mock_session.execute.return_value = result_mock

        with pytest.raises(UnauthorizedError, match="Token revoked"):
            await auth_service.refresh_token(mock_session, revoked_token.token)

    async def test_long_expired_token_raises_unauthorized(
        self, auth_service: AuthService, mock_session: AsyncMock
    ):
        wallet = "0x742d35cc6634c0532925a3b844bc9e7595f2bd1e"
        expired_token = make_access_token(
            wallet,
            {
                "expires_at": datetime.now(UTC) - timedelta(hours=2),
                "revoked_at": None,
            },
        )

        result_mock = MagicMock()
        result_mock.scalar_one_or_none.return_value = expired_token
        mock_session.execute.return_value = result_mock

        with pytest.raises(
            UnauthorizedError, match="Token expired beyond refresh window"
        ):
            await auth_service.refresh_token(mock_session, expired_token.token)


class TestVerifySiwe:
    async def test_missing_nonce_raises_unauthorized(
        self, auth_service: AuthService, mock_session: AsyncMock
    ):
        """SIWE message with empty nonce should fail."""
        with patch("src.auth.service.SiweMessage", create=True) as MockSiwe:
            mock_msg = MagicMock()
            mock_msg.address = "0x742d35Cc6634C0532925a3b844Bc9e7595f2bD1e"
            mock_msg.nonce = ""
            MockSiwe.from_message.return_value = mock_msg

            with pytest.raises(UnauthorizedError, match="Missing nonce"):
                await auth_service.verify_siwe(mock_session, "msg", "sig")

    async def test_invalid_siwe_message_raises_unauthorized(
        self, auth_service: AuthService, mock_session: AsyncMock
    ):
        """Malformed SIWE message should raise UnauthorizedError."""
        with patch("src.auth.service.SiweMessage", create=True) as MockSiwe:
            MockSiwe.from_message.side_effect = ValueError("parse error")

            with pytest.raises(UnauthorizedError, match="Invalid SIWE message"):
                await auth_service.verify_siwe(mock_session, "bad-message", "0xsig")

    async def test_expired_nonce_raises_unauthorized(
        self, auth_service: AuthService, mock_session: AsyncMock
    ):
        with patch("src.auth.service.SiweMessage", create=True) as MockSiwe:
            mock_msg = MagicMock()
            mock_msg.address = "0x742d35Cc6634C0532925a3b844Bc9e7595f2bD1e"
            mock_msg.nonce = "validnonce123"
            MockSiwe.from_message.return_value = mock_msg

            result_mock = MagicMock()
            result_mock.scalar_one_or_none.return_value = None  # nonce not found
            mock_session.execute.return_value = result_mock

            with pytest.raises(UnauthorizedError, match="Invalid or expired nonce"):
                await auth_service.verify_siwe(mock_session, "msg", "0xsig")
