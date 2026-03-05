"""Tests for pool statistics and APY calculations."""

from __future__ import annotations

from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock

import pytest

from src.pool.service import (
    BASE_APY_BPS,
    UTILIZATION_BONUS_MULTIPLIER,
    PoolService,
)


@pytest.fixture
def pool_service() -> PoolService:
    return PoolService()


def _mock_scalar(value):
    result_mock = MagicMock()
    result_mock.scalar.return_value = value
    return result_mock


class TestPoolStats:
    async def test_returns_all_expected_fields(
        self, pool_service: PoolService, mock_session: AsyncMock
    ):
        mock_session.execute.side_effect = [
            _mock_scalar(Decimal("1000000")),  # total deposits
            _mock_scalar(Decimal("800000")),   # total borrowed
            _mock_scalar(5),                    # active agents
            _mock_scalar(12),                   # total depositors
        ]

        stats = await pool_service.get_pool_stats(mock_session)

        assert "total_deposits" in stats
        assert "total_borrowed" in stats
        assert "utilization_rate_percent" in stats
        assert "active_agents" in stats
        assert "total_depositors" in stats

    async def test_utilization_rate_calculation(
        self, pool_service: PoolService, mock_session: AsyncMock
    ):
        # 800k borrowed from 1M total = 80%
        mock_session.execute.side_effect = [
            _mock_scalar(Decimal("1000000")),
            _mock_scalar(Decimal("800000")),
            _mock_scalar(5),
            _mock_scalar(10),
        ]

        stats = await pool_service.get_pool_stats(mock_session)

        assert stats["utilization_rate_percent"] == Decimal("80.00")

    async def test_zero_deposits_zero_utilization(
        self, pool_service: PoolService, mock_session: AsyncMock
    ):
        mock_session.execute.side_effect = [
            _mock_scalar(Decimal("0")),
            _mock_scalar(Decimal("0")),
            _mock_scalar(0),
            _mock_scalar(0),
        ]

        stats = await pool_service.get_pool_stats(mock_session)

        assert stats["utilization_rate_percent"] == Decimal("0")


class TestPoolAPY:
    async def test_apy_increases_with_utilization(
        self, pool_service: PoolService, mock_session: AsyncMock
    ):
        # Low utilization
        mock_session.execute.side_effect = [
            _mock_scalar(Decimal("1000000")),
            _mock_scalar(Decimal("100000")),  # 10% utilization
            _mock_scalar(5),
            _mock_scalar(10),
        ]
        low_util_apy = await pool_service.get_pool_apy(mock_session)

        # High utilization
        mock_session.execute.side_effect = [
            _mock_scalar(Decimal("1000000")),
            _mock_scalar(Decimal("800000")),  # 80% utilization
            _mock_scalar(5),
            _mock_scalar(10),
        ]
        high_util_apy = await pool_service.get_pool_apy(mock_session)

        assert high_util_apy["apy_percent"] > low_util_apy["apy_percent"]

    async def test_base_rate_applied_at_zero_utilization(
        self, pool_service: PoolService, mock_session: AsyncMock
    ):
        mock_session.execute.side_effect = [
            _mock_scalar(Decimal("1000000")),
            _mock_scalar(Decimal("0")),
            _mock_scalar(0),
            _mock_scalar(0),
        ]

        apy = await pool_service.get_pool_apy(mock_session)

        # At 0% utilization, should be base rate only
        expected_base = Decimal(BASE_APY_BPS) / 100
        assert apy["apy_percent"] == expected_base.quantize(Decimal("0.01"))
