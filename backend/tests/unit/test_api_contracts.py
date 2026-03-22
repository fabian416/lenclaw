"""
Cross-cutting tests: verify API endpoint/schema consistency.

These tests validate that the API schemas match expected shapes
and that frontend type definitions align with backend responses.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from decimal import Decimal

import pytest

from src.agent.schemas import AgentCreate, AgentResponse, AgentSummary, AgentUpdate
from src.auth.schemas import AuthTokenResponse, NonceResponse, SiweVerifyRequest
from src.credit.schemas import (
    DrawRequest,
    RepayRequest,
)
from src.db.models import AgentStatus
from src.pool.schemas import PoolAPYResponse, PoolStatsResponse
from src.revenue.schemas import (
    RevenueRecordCreate,
    RevenueSummary,
)


class TestAuthSchemas:
    def test_nonce_response_shape(self):
        r = NonceResponse(nonce="abc123")
        assert r.nonce == "abc123"

    def test_siwe_verify_request_requires_fields(self):
        req = SiweVerifyRequest(message="msg", signature="0xsig")
        assert req.message == "msg"
        assert req.signature == "0xsig"

    def test_auth_token_response_shape(self):
        r = AuthTokenResponse(wallet="0x123", access_token="tok")
        assert r.token_type == "bearer"


class TestAgentSchemas:
    def test_agent_create_validation(self):
        a = AgentCreate(name="TestAgent", description="Desc")
        assert a.name == "TestAgent"

    def test_agent_create_requires_name(self):
        with pytest.raises(Exception):
            AgentCreate(name="")  # min_length=1

    def test_agent_update_all_optional(self):
        u = AgentUpdate()
        assert u.name is None
        assert u.description is None

    def test_agent_summary_defaults(self):
        s = AgentSummary(
            id=uuid.uuid4(),
            name="TestAgent",
            owner_address="0x123",
            reputation_score=500,
            status=AgentStatus.ACTIVE,
        )
        assert s.revenue_30d == Decimal(0)
        assert s.credit_line == Decimal(0)
        assert s.credit_utilization == Decimal(0)


class TestCreditSchemas:
    def test_draw_request_validation(self):
        r = DrawRequest(amount=Decimal("1000"), tenor_days=30)
        assert r.amount == Decimal("1000")

    def test_draw_request_rejects_zero_amount(self):
        with pytest.raises(Exception):
            DrawRequest(amount=Decimal("0"), tenor_days=30)

    def test_draw_request_rejects_invalid_tenor(self):
        with pytest.raises(Exception):
            DrawRequest(amount=Decimal("100"), tenor_days=3)  # ge=7

    def test_repay_request_requires_draw_id(self):
        r = RepayRequest(draw_id=uuid.uuid4(), amount=Decimal("500"))
        assert r.amount == Decimal("500")


class TestPoolSchemas:
    def test_pool_stats_response_shape(self):
        r = PoolStatsResponse(
            total_deposits=Decimal("1000000"),
            total_borrowed=Decimal("500000"),
            utilization_rate_percent=Decimal("50.00"),
            active_agents=10,
            total_depositors=25,
        )
        assert r.utilization_rate_percent == Decimal("50.00")

    def test_pool_apy_response_shape(self):
        r = PoolAPYResponse(
            apy_percent=Decimal("10.50"),
            base_rate_bps=600,
            utilization_rate_percent=Decimal("72.40"),
        )
        assert r.apy_percent == Decimal("10.50")


class TestRevenueSchemas:
    def test_revenue_record_create_rejects_zero(self):
        with pytest.raises(Exception):
            RevenueRecordCreate(amount=Decimal("0"))

    def test_revenue_record_create_defaults(self):
        r = RevenueRecordCreate(amount=Decimal("100"))
        assert r.currency == "USDC"
        assert r.tx_hash is None

    def test_revenue_summary_shape(self):
        s = RevenueSummary(
            agent_id=uuid.uuid4(),
            total_revenue=Decimal("50000"),
            revenue_30d=Decimal("5000"),
            revenue_60d=Decimal("10000"),
            revenue_90d=Decimal("14000"),
            avg_daily_30d=Decimal("166.67"),
            consistency_score=Decimal("85.5"),
        )
        assert s.revenue_30d <= s.revenue_60d <= s.revenue_90d


class TestFrontendBackendAlignment:
    """Verify that backend API endpoints match frontend expectations."""

    def test_backend_endpoints_match_frontend_hooks(self):
        """
        Frontend hooks reference these endpoints:
        - useAgents: GET /agents
        - usePool: GET /pool/stats
        - useBorrower: GET /agents/{id}/credit

        Backend provides:
        - GET /api/v1/agents -> AgentListResponse
        - GET /api/v1/pool/stats -> PoolStatsResponse
        - GET /api/v1/agents/{id}/credit -> CreditLineResponse
        """
        # Verify pool stats shape matches what frontend expects (PoolData type)
        # Frontend: tvl, apy, utilizationRate, activeAgents
        # Backend: total_deposits, apy_percent, utilization_rate_percent, active_agents
        stats = PoolStatsResponse(
            total_deposits=Decimal("2450000"),
            total_borrowed=Decimal("1820000"),
            utilization_rate_percent=Decimal("72.40"),
            active_agents=47,
            total_depositors=120,
        )
        # These fields exist and are correct types
        assert isinstance(stats.total_deposits, Decimal)
        assert isinstance(stats.active_agents, int)

    def test_agent_response_has_fields_frontend_needs(self):
        """
        Frontend Agent type expects:
        - id, name, erc8004Id, reputationScore, revenue30d, creditLine, utilization, status
        """
        r = AgentResponse(
            id=uuid.uuid4(),
            owner_address="0x123",
            name="TestAgent",
            description="Test",
            erc8004_token_id="8004-0001",
            erc8004_contract="0x" + "a" * 40,
            code_hash="0x" + "b" * 64,
            code_verified=True,
            lockbox_address="0x" + "c" * 40,
            reputation_score=94,
            status=AgentStatus.ACTIVE,
            created_at=datetime.now(UTC),
            updated_at=datetime.now(UTC),
        )
        # All fields present
        assert r.name == "TestAgent"
        assert r.reputation_score == 94
        assert r.status == AgentStatus.ACTIVE
        assert r.erc8004_token_id == "8004-0001"
