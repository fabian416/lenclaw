"""Shared fixtures for Lenclaw backend tests."""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock

import pytest

try:
    from src.auth.service import AuthService
except ImportError:
    AuthService = None  # type: ignore[assignment,misc]

from src.common.config import AuthSettings
from src.db.models import (
    AccessToken,
    Agent,
    AgentStatus,
    CreditDraw,
    CreditDrawStatus,
    CreditLine,
    RevenueRecord,
    SiweNonce,
)


@pytest.fixture
def auth_settings() -> AuthSettings:
    return AuthSettings(
        jwt_secret="test-secret-key",
        jwt_algorithm="HS256",
        access_token_expire_minutes=60,
        nonce_expire_minutes=10,
    )


@pytest.fixture
def auth_service(auth_settings: AuthSettings):
    if AuthService is None:
        pytest.skip("siwe package not installed")
    return AuthService(auth_settings)


@pytest.fixture
def mock_session() -> AsyncMock:
    session = AsyncMock()
    session.add = MagicMock()
    session.flush = AsyncMock()
    session.execute = AsyncMock()
    session.commit = AsyncMock()
    session.rollback = AsyncMock()
    return session


VALID_WALLET = "0x742d35cc6634c0532925a3b844bc9e7595f2bd1e"


@pytest.fixture
def valid_wallet() -> str:
    return VALID_WALLET


def make_agent(overrides: dict | None = None) -> Agent:
    defaults = {
        "id": uuid.uuid4(),
        "owner_address": VALID_WALLET,
        "name": "TestAgent-v1",
        "description": "A test AI agent",
        "erc8004_token_id": "8004-0001",
        "erc8004_contract": "0x" + "a" * 40,
        "code_hash": "0x" + "b" * 64,
        "tee_attestation": None,
        "code_verified": False,
        "lockbox_address": None,
        "reputation_score": 500,
        "status": AgentStatus.PENDING,
        "created_at": datetime.now(timezone.utc),
        "updated_at": datetime.now(timezone.utc),
    }
    if overrides:
        defaults.update(overrides)
    agent = MagicMock(spec=Agent)
    for k, v in defaults.items():
        setattr(agent, k, v)
    return agent


def make_credit_line(agent_id: uuid.UUID, overrides: dict | None = None) -> CreditLine:
    defaults = {
        "id": uuid.uuid4(),
        "agent_id": agent_id,
        "max_amount": Decimal("50000"),
        "used_amount": Decimal("20000"),
        "interest_rate_bps": 800,
        "repayment_rate_bps": 5000,
        "credit_score": 85,
        "last_scored_at": datetime.now(timezone.utc),
        "created_at": datetime.now(timezone.utc),
        "updated_at": datetime.now(timezone.utc),
    }
    if overrides:
        defaults.update(overrides)
    cl = MagicMock(spec=CreditLine)
    for k, v in defaults.items():
        setattr(cl, k, v)
    cl.available_amount = defaults["max_amount"] - defaults["used_amount"]
    return cl


def make_revenue_record(agent_id: uuid.UUID, overrides: dict | None = None) -> RevenueRecord:
    defaults = {
        "id": uuid.uuid4(),
        "agent_id": agent_id,
        "amount": Decimal("1000"),
        "currency": "USDC",
        "tx_hash": "0x" + "c" * 64,
        "block_number": 12345,
        "source": "lockbox",
        "recorded_at": datetime.now(timezone.utc),
        "created_at": datetime.now(timezone.utc),
    }
    if overrides:
        defaults.update(overrides)
    rr = MagicMock(spec=RevenueRecord)
    for k, v in defaults.items():
        setattr(rr, k, v)
    return rr


def make_nonce(overrides: dict | None = None) -> SiweNonce:
    defaults = {
        "id": uuid.uuid4(),
        "nonce": "a" * 32,
        "used": False,
        "expires_at": datetime.now(timezone.utc) + timedelta(minutes=10),
        "created_at": datetime.now(timezone.utc),
    }
    if overrides:
        defaults.update(overrides)
    nonce = MagicMock(spec=SiweNonce)
    for k, v in defaults.items():
        setattr(nonce, k, v)
    return nonce


def make_access_token(wallet: str, overrides: dict | None = None) -> AccessToken:
    defaults = {
        "id": uuid.uuid4(),
        "token": "test-token-" + uuid.uuid4().hex[:16],
        "wallet_address": wallet.lower(),
        "expires_at": datetime.now(timezone.utc) + timedelta(hours=1),
        "revoked_at": None,
        "created_at": datetime.now(timezone.utc),
    }
    if overrides:
        defaults.update(overrides)
    at = MagicMock(spec=AccessToken)
    for k, v in defaults.items():
        setattr(at, k, v)
    return at
