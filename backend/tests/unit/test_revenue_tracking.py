"""Tests for revenue tracking service."""

from __future__ import annotations

import uuid
from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock

import pytest

from src.common.exceptions import NotFoundError
from src.revenue.service import RevenueService
from tests.conftest import make_agent, make_revenue_record


@pytest.fixture
def revenue_service() -> RevenueService:
    return RevenueService()


class TestRecordRevenue:
    async def test_records_revenue_for_existing_agent(
        self, revenue_service: RevenueService, mock_session: AsyncMock
    ):
        agent = make_agent()
        agent_result = MagicMock()
        agent_result.scalar_one_or_none.return_value = agent
        mock_session.execute.return_value = agent_result

        data = {
            "amount": Decimal("1500.50"),
            "currency": "USDC",
            "tx_hash": "0x" + "a" * 64,
            "block_number": 12345,
            "source": "lockbox",
        }

        await revenue_service.record_revenue(mock_session, agent.id, data)

        mock_session.add.assert_called_once()
        mock_session.flush.assert_awaited_once()

    async def test_raises_not_found_for_nonexistent_agent(
        self, revenue_service: RevenueService, mock_session: AsyncMock
    ):
        result_mock = MagicMock()
        result_mock.scalar_one_or_none.return_value = None
        mock_session.execute.return_value = result_mock

        with pytest.raises(NotFoundError, match="not found"):
            await revenue_service.record_revenue(
                mock_session,
                uuid.uuid4(),
                {"amount": Decimal("100")},
            )


class TestGetRevenueHistory:
    async def test_returns_list_of_records(
        self, revenue_service: RevenueService, mock_session: AsyncMock
    ):
        agent_id = uuid.uuid4()
        records = [
            make_revenue_record(agent_id, {"amount": Decimal("100")}),
            make_revenue_record(agent_id, {"amount": Decimal("200")}),
        ]
        result_mock = MagicMock()
        scalars_mock = MagicMock()
        scalars_mock.all.return_value = records
        result_mock.scalars.return_value = scalars_mock
        mock_session.execute.return_value = result_mock

        history = await revenue_service.get_revenue_history(mock_session, agent_id)

        assert len(history) == 2

    async def test_filters_by_days_parameter(
        self, revenue_service: RevenueService, mock_session: AsyncMock
    ):
        agent_id = uuid.uuid4()
        result_mock = MagicMock()
        scalars_mock = MagicMock()
        scalars_mock.all.return_value = []
        result_mock.scalars.return_value = scalars_mock
        mock_session.execute.return_value = result_mock

        # Should not raise, just return filtered results
        history = await revenue_service.get_revenue_history(
            mock_session, agent_id, days=30
        )

        assert isinstance(history, list)


class TestGetRevenueForPeriod:
    async def test_returns_decimal_total(
        self, revenue_service: RevenueService, mock_session: AsyncMock
    ):
        result_mock = MagicMock()
        result_mock.scalar.return_value = Decimal("5000")
        mock_session.execute.return_value = result_mock

        total = await revenue_service.get_revenue_for_period(
            mock_session, uuid.uuid4(), 30
        )

        assert total == Decimal("5000")

    async def test_returns_zero_when_no_records(
        self, revenue_service: RevenueService, mock_session: AsyncMock
    ):
        result_mock = MagicMock()
        result_mock.scalar.return_value = Decimal(0)
        mock_session.execute.return_value = result_mock

        total = await revenue_service.get_revenue_for_period(
            mock_session, uuid.uuid4(), 30
        )

        assert total == Decimal(0)


class TestGetRevenueSummary:
    async def test_raises_not_found_for_nonexistent_agent(
        self, revenue_service: RevenueService, mock_session: AsyncMock
    ):
        result_mock = MagicMock()
        result_mock.scalar_one_or_none.return_value = None
        mock_session.execute.return_value = result_mock

        with pytest.raises(NotFoundError, match="not found"):
            await revenue_service.get_revenue_summary(mock_session, uuid.uuid4())

    async def test_returns_all_expected_fields(
        self, revenue_service: RevenueService, mock_session: AsyncMock
    ):
        agent = make_agent()
        agent_id = agent.id

        # Setup mock returns: agent check, total, 30d, 60d, 90d, consistency
        agent_result = MagicMock()
        agent_result.scalar_one_or_none.return_value = agent

        total_result = MagicMock()
        total_result.scalar.return_value = Decimal("50000")

        period_result = MagicMock()
        period_result.scalar.return_value = Decimal("5000")

        consistency_result = MagicMock()
        consistency_result.all.return_value = []  # empty -> 0 consistency

        mock_session.execute.side_effect = [
            agent_result,      # agent check
            total_result,      # total
            period_result,     # 30d
            period_result,     # 60d
            period_result,     # 90d
            consistency_result,  # consistency
        ]

        summary = await revenue_service.get_revenue_summary(mock_session, agent_id)

        assert summary["agent_id"] == agent_id
        assert "total_revenue" in summary
        assert "revenue_30d" in summary
        assert "revenue_60d" in summary
        assert "revenue_90d" in summary
        assert "avg_daily_30d" in summary
        assert "consistency_score" in summary
