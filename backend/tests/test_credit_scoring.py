"""Tests for the credit scoring algorithm."""

from decimal import Decimal

from src.credit.scoring import CreditScoreInput, compute_credit_score


class TestCreditScoring:
    def test_zero_revenue_no_credit(self):
        result = compute_credit_score(
            CreditScoreInput(
                revenue_30d=Decimal(0),
                revenue_60d=Decimal(0),
                revenue_90d=Decimal(0),
                consistency_score=Decimal(0),
                reputation_score=0,
                code_verified=False,
            )
        )
        assert result.credit_line_amount == Decimal(0)
        assert result.interest_rate_bps == 0

    def test_below_minimum_revenue_no_credit(self):
        result = compute_credit_score(
            CreditScoreInput(
                revenue_30d=Decimal("50"),
                revenue_60d=Decimal("100"),
                revenue_90d=Decimal("150"),
                consistency_score=Decimal("80"),
                reputation_score=500,
                code_verified=True,
            )
        )
        assert result.credit_line_amount == Decimal(0)

    def test_good_agent_gets_credit(self):
        result = compute_credit_score(
            CreditScoreInput(
                revenue_30d=Decimal("5000"),
                revenue_60d=Decimal("10000"),
                revenue_90d=Decimal("14000"),
                consistency_score=Decimal("85"),
                reputation_score=700,
                code_verified=True,
            )
        )
        assert result.credit_score > 0
        assert result.credit_line_amount > Decimal(0)
        assert result.interest_rate_bps > 0
        assert result.repayment_rate_bps > 0

    def test_higher_consistency_better_score(self):
        base = {
            "revenue_30d": Decimal("1000"),
            "revenue_60d": Decimal("2000"),
            "revenue_90d": Decimal("3000"),
            "reputation_score": 500,
            "code_verified": False,
        }

        low = compute_credit_score(
            CreditScoreInput(consistency_score=Decimal("20"), **base)
        )
        high = compute_credit_score(
            CreditScoreInput(consistency_score=Decimal("90"), **base)
        )

        assert high.credit_score > low.credit_score

    def test_code_verification_bonus(self):
        base = {
            "revenue_30d": Decimal("1000"),
            "revenue_60d": Decimal("2000"),
            "revenue_90d": Decimal("3000"),
            "consistency_score": Decimal("50"),
            "reputation_score": 500,
        }

        unverified = compute_credit_score(CreditScoreInput(code_verified=False, **base))
        verified = compute_credit_score(CreditScoreInput(code_verified=True, **base))

        assert verified.credit_score > unverified.credit_score

    def test_excellent_agent_gets_best_terms(self):
        result = compute_credit_score(
            CreditScoreInput(
                revenue_30d=Decimal("50000"),
                revenue_60d=Decimal("100000"),
                revenue_90d=Decimal("150000"),
                consistency_score=Decimal("95"),
                reputation_score=900,
                code_verified=True,
            )
        )
        assert result.credit_score >= 800
        assert result.interest_rate_bps == 500  # Best tier: 5%
        assert result.repayment_rate_bps == 3000  # Best tier: 30%

    def test_credit_line_proportional_to_revenue(self):
        low_rev = compute_credit_score(
            CreditScoreInput(
                revenue_30d=Decimal("500"),
                revenue_60d=Decimal("1000"),
                revenue_90d=Decimal("1500"),
                consistency_score=Decimal("70"),
                reputation_score=600,
                code_verified=True,
            )
        )
        high_rev = compute_credit_score(
            CreditScoreInput(
                revenue_30d=Decimal("5000"),
                revenue_60d=Decimal("10000"),
                revenue_90d=Decimal("15000"),
                consistency_score=Decimal("70"),
                reputation_score=600,
                code_verified=True,
            )
        )
        assert high_rev.credit_line_amount > low_rev.credit_line_amount

    def test_score_bounds(self):
        result = compute_credit_score(
            CreditScoreInput(
                revenue_30d=Decimal("999999999"),
                revenue_60d=Decimal("999999999"),
                revenue_90d=Decimal("999999999"),
                consistency_score=Decimal("100"),
                reputation_score=1000,
                code_verified=True,
            )
        )
        assert 0 <= result.credit_score <= 1000
