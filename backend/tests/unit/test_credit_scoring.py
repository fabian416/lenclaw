"""Tests for credit scoring algorithm correctness."""

from __future__ import annotations

from decimal import Decimal

from src.credit.scoring import (
    MIN_REVENUE_30D,
    CreditScoreInput,
    CreditScoreResult,
    compute_credit_score,
)


def _make_input(**overrides) -> CreditScoreInput:
    defaults = {
        "revenue_30d": Decimal("5000"),
        "revenue_60d": Decimal("10000"),
        "revenue_90d": Decimal("14000"),
        "consistency_score": Decimal("80"),
        "reputation_score": 700,
        "code_verified": True,
    }
    defaults.update(overrides)
    return CreditScoreInput(**defaults)


class TestCreditScoreComputation:
    def test_returns_credit_score_result(self):
        result = compute_credit_score(_make_input())
        assert isinstance(result, CreditScoreResult)
        assert 0 <= result.credit_score <= 1000

    def test_zero_revenue_gives_zero_credit_line(self):
        result = compute_credit_score(
            _make_input(
                revenue_30d=Decimal("0"),
                revenue_60d=Decimal("0"),
                revenue_90d=Decimal("0"),
            )
        )
        assert result.credit_line_amount == Decimal(0)
        assert result.interest_rate_bps == 0
        assert result.repayment_rate_bps == 0

    def test_below_minimum_revenue_gives_zero_credit(self):
        result = compute_credit_score(
            _make_input(revenue_30d=Decimal("50"))  # Below MIN_REVENUE_30D
        )
        assert result.credit_line_amount == Decimal(0)

    def test_minimum_revenue_threshold_boundary(self):
        # Exactly at minimum should qualify
        result = compute_credit_score(_make_input(revenue_30d=MIN_REVENUE_30D))
        assert result.credit_line_amount > Decimal(0)

    def test_higher_revenue_gives_higher_score(self):
        low = compute_credit_score(_make_input(revenue_30d=Decimal("500")))
        high = compute_credit_score(_make_input(revenue_30d=Decimal("10000")))
        assert high.credit_score >= low.credit_score

    def test_higher_reputation_gives_higher_score(self):
        low_rep = compute_credit_score(_make_input(reputation_score=200))
        high_rep = compute_credit_score(_make_input(reputation_score=900))
        assert high_rep.credit_score >= low_rep.credit_score

    def test_code_verified_gives_higher_score(self):
        unverified = compute_credit_score(_make_input(code_verified=False))
        verified = compute_credit_score(_make_input(code_verified=True))
        assert verified.credit_score >= unverified.credit_score

    def test_higher_consistency_gives_higher_score(self):
        low = compute_credit_score(_make_input(consistency_score=Decimal("10")))
        high = compute_credit_score(_make_input(consistency_score=Decimal("95")))
        assert high.credit_score >= low.credit_score

    def test_excellent_agent_gets_best_tier(self):
        """An agent with top-tier stats should get the best credit terms."""
        result = compute_credit_score(
            _make_input(
                revenue_30d=Decimal("50000"),
                revenue_60d=Decimal("100000"),
                revenue_90d=Decimal("150000"),
                consistency_score=Decimal("95"),
                reputation_score=950,
                code_verified=True,
            )
        )
        assert result.credit_score >= 800
        assert result.interest_rate_bps == 500  # Best rate tier
        assert result.repayment_rate_bps == 3000  # Lowest repayment

    def test_poor_agent_gets_worst_tier(self):
        """A low-performing agent should get worst credit terms."""
        result = compute_credit_score(
            _make_input(
                revenue_30d=Decimal("200"),
                revenue_60d=Decimal("300"),
                revenue_90d=Decimal("400"),
                consistency_score=Decimal("10"),
                reputation_score=100,
                code_verified=False,
            )
        )
        assert result.credit_score < 400
        assert result.interest_rate_bps >= 1800


class TestCreditLineAmount:
    def test_credit_line_positive_for_qualifying_agent(self):
        result = compute_credit_score(_make_input())
        assert result.credit_line_amount > 0

    def test_credit_line_scales_with_revenue(self):
        low = compute_credit_score(_make_input(revenue_30d=Decimal("1000")))
        high = compute_credit_score(_make_input(revenue_30d=Decimal("10000")))
        assert high.credit_line_amount >= low.credit_line_amount


class TestInterestRate:
    def test_rate_is_positive_for_qualifying_agents(self):
        result = compute_credit_score(_make_input())
        assert result.interest_rate_bps > 0

    def test_better_score_lower_rate(self):
        """Higher credit score should yield lower interest rate."""
        poor = compute_credit_score(
            _make_input(
                revenue_30d=Decimal("200"),
                consistency_score=Decimal("20"),
                reputation_score=150,
                code_verified=False,
            )
        )
        good = compute_credit_score(
            _make_input(
                revenue_30d=Decimal("20000"),
                consistency_score=Decimal("90"),
                reputation_score=900,
                code_verified=True,
            )
        )
        assert good.interest_rate_bps <= poor.interest_rate_bps


class TestRepaymentRate:
    def test_better_score_lower_repayment_rate(self):
        """Higher credit score should require lower auto-repayment percentage."""
        poor = compute_credit_score(
            _make_input(
                revenue_30d=Decimal("200"),
                consistency_score=Decimal("20"),
                reputation_score=150,
                code_verified=False,
            )
        )
        good = compute_credit_score(
            _make_input(
                revenue_30d=Decimal("20000"),
                consistency_score=Decimal("90"),
                reputation_score=900,
                code_verified=True,
            )
        )
        assert good.repayment_rate_bps <= poor.repayment_rate_bps
