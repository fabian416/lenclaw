from __future__ import annotations

import logging
import uuid
from datetime import UTC, datetime, timedelta
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.common.exceptions import (
    BadRequestError,
    InsufficientCreditError,
    NotFoundError,
)
from src.credit.scoring import CreditScoreInput, compute_credit_score
from src.db.models import (
    Agent,
    AgentStatus,
    CreditDraw,
    CreditDrawStatus,
    CreditLine,
)
from src.revenue.service import RevenueService

logger = logging.getLogger(__name__)


class CreditService:
    def __init__(self):
        self._revenue_service = RevenueService()

    async def get_credit_line(
        self, session: AsyncSession, agent_id: uuid.UUID
    ) -> CreditLine:
        result = await session.execute(
            select(CreditLine).where(CreditLine.agent_id == agent_id)
        )
        credit_line = result.scalar_one_or_none()
        if credit_line is None:
            raise NotFoundError(f"No credit line for agent {agent_id}")
        return credit_line

    async def score_agent(self, session: AsyncSession, agent_id: uuid.UUID) -> dict:
        """Run credit scoring algorithm for an agent."""
        # Fetch agent
        agent_result = await session.execute(select(Agent).where(Agent.id == agent_id))
        agent = agent_result.scalar_one_or_none()
        if agent is None:
            raise NotFoundError(f"Agent {agent_id} not found")

        if agent.status not in (AgentStatus.ACTIVE, AgentStatus.DELINQUENT):
            raise BadRequestError(
                f"Agent must be active to score (current: {agent.status})"
            )

        # Gather revenue data
        summary = await self._revenue_service.get_revenue_summary(session, agent_id)

        score_input = CreditScoreInput(
            revenue_30d=summary["revenue_30d"],
            revenue_60d=summary["revenue_60d"],
            revenue_90d=summary["revenue_90d"],
            consistency_score=summary["consistency_score"],
            reputation_score=agent.reputation_score,
            code_verified=agent.code_verified,
        )

        result = compute_credit_score(score_input)

        # Upsert credit line
        cl_result = await session.execute(
            select(CreditLine).where(CreditLine.agent_id == agent_id)
        )
        credit_line = cl_result.scalar_one_or_none()

        if credit_line is None:
            credit_line = CreditLine(
                agent_id=agent_id,
                max_amount=result.credit_line_amount,
                interest_rate_bps=result.interest_rate_bps,
                repayment_rate_bps=result.repayment_rate_bps,
                credit_score=result.credit_score,
            )
            session.add(credit_line)
        else:
            credit_line.max_amount = result.credit_line_amount
            credit_line.interest_rate_bps = result.interest_rate_bps
            credit_line.repayment_rate_bps = result.repayment_rate_bps
            credit_line.credit_score = result.credit_score
            credit_line.last_scored_at = datetime.now(UTC)

        await session.flush()

        logger.info(
            "Scored agent=%s score=%d credit_line=%s rate=%d",
            agent_id,
            result.credit_score,
            result.credit_line_amount,
            result.interest_rate_bps,
        )

        return {
            "agent_id": agent_id,
            "credit_score": result.credit_score,
            "revenue_30d": summary["revenue_30d"],
            "revenue_60d": summary["revenue_60d"],
            "revenue_90d": summary["revenue_90d"],
            "consistency_score": summary["consistency_score"],
            "reputation_score": agent.reputation_score,
            "code_verified": agent.code_verified,
            "credit_line_amount": result.credit_line_amount,
            "interest_rate_bps": result.interest_rate_bps,
            "repayment_rate_bps": result.repayment_rate_bps,
        }

    async def draw_credit(
        self,
        session: AsyncSession,
        agent_id: uuid.UUID,
        amount: Decimal,
        tenor_days: int,
    ) -> CreditDraw:
        """Draw from an agent's credit line."""
        credit_line = await self.get_credit_line(session, agent_id)
        available = credit_line.max_amount - credit_line.used_amount

        if amount > available:
            raise InsufficientCreditError(f"Requested {amount}, available {available}")

        # Calculate interest for the tenor period
        annual_rate = Decimal(credit_line.interest_rate_bps) / Decimal(10000)
        period_rate = annual_rate * Decimal(tenor_days) / Decimal(365)
        interest = (amount * period_rate).quantize(Decimal("0.000001"))
        amount_due = amount + interest

        due_at = datetime.now(UTC) + timedelta(days=tenor_days)

        draw = CreditDraw(
            agent_id=agent_id,
            amount=amount,
            interest_rate_bps=credit_line.interest_rate_bps,
            amount_due=amount_due,
            status=CreditDrawStatus.ACTIVE,
            due_at=due_at,
        )
        session.add(draw)

        # Update used amount
        credit_line.used_amount += amount
        await session.flush()

        logger.info(
            "Credit draw for agent=%s amount=%s due=%s interest=%s",
            agent_id,
            amount,
            amount_due,
            interest,
        )

        return draw

    async def get_draws(
        self,
        session: AsyncSession,
        agent_id: uuid.UUID,
        status: CreditDrawStatus | None = None,
    ) -> list[CreditDraw]:
        query = (
            select(CreditDraw)
            .where(CreditDraw.agent_id == agent_id)
            .order_by(CreditDraw.created_at.desc())
        )
        if status is not None:
            query = query.where(CreditDraw.status == status)

        result = await session.execute(query)
        return list(result.scalars().all())

    async def repay_credit(
        self,
        session: AsyncSession,
        agent_id: uuid.UUID,
        draw_id: uuid.UUID,
        amount: Decimal,
    ) -> dict:
        """Manually repay against a specific credit draw."""
        # Fetch the draw
        result = await session.execute(
            select(CreditDraw).where(
                CreditDraw.id == draw_id,
                CreditDraw.agent_id == agent_id,
            )
        )
        draw = result.scalar_one_or_none()
        if draw is None:
            raise NotFoundError(f"Credit draw {draw_id} not found for agent {agent_id}")

        if draw.status not in (CreditDrawStatus.ACTIVE, CreditDrawStatus.PENDING):
            raise BadRequestError(f"Cannot repay draw with status {draw.status}")

        remaining = draw.amount_due - draw.amount_repaid
        if amount > remaining:
            raise BadRequestError(
                f"Repayment amount {amount} exceeds remaining due {remaining}"
            )

        draw.amount_repaid += amount
        fully_repaid = draw.amount_repaid >= draw.amount_due

        if fully_repaid:
            draw.status = CreditDrawStatus.REPAID
            draw.repaid_at = datetime.now(UTC)

        # Release used amount on credit line
        cl_result = await session.execute(
            select(CreditLine).where(CreditLine.agent_id == agent_id)
        )
        credit_line = cl_result.scalar_one_or_none()
        if credit_line is not None:
            # Release the principal portion proportional to repayment
            principal_ratio = draw.amount / draw.amount_due
            principal_released = (amount * principal_ratio).quantize(
                Decimal("0.000001")
            )
            credit_line.used_amount = max(
                Decimal(0), credit_line.used_amount - principal_released
            )

        await session.flush()

        new_remaining = draw.amount_due - draw.amount_repaid
        logger.info(
            "Repayment for agent=%s draw=%s amount=%s remaining=%s fully_repaid=%s",
            agent_id,
            draw_id,
            amount,
            new_remaining,
            fully_repaid,
        )

        return {
            "draw_id": draw_id,
            "amount_repaid": amount,
            "remaining_due": new_remaining,
            "status": draw.status,
            "fully_repaid": fully_repaid,
        }

    async def get_outstanding_total(
        self, session: AsyncSession, agent_id: uuid.UUID
    ) -> Decimal:
        result = await session.execute(
            select(
                func.coalesce(
                    func.sum(CreditDraw.amount_due - CreditDraw.amount_repaid), 0
                )
            ).where(
                CreditDraw.agent_id == agent_id,
                CreditDraw.status == CreditDrawStatus.ACTIVE,
            )
        )
        return result.scalar() or Decimal(0)
