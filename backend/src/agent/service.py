from __future__ import annotations

import logging
import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.common.exceptions import BadRequestError, ForbiddenError, NotFoundError
from src.db.models import Agent, AgentStatus, CreditLine, RevenueRecord

logger = logging.getLogger(__name__)


class AgentService:
    async def list_agents(
        self,
        session: AsyncSession,
        page: int = 1,
        page_size: int = 20,
        status: AgentStatus | None = None,
    ) -> tuple[list[Agent], int]:
        query = select(Agent).order_by(Agent.created_at.desc())
        count_query = select(func.count(Agent.id))

        if status is not None:
            query = query.where(Agent.status == status)
            count_query = count_query.where(Agent.status == status)

        total_result = await session.execute(count_query)
        total = total_result.scalar() or 0

        query = query.offset((page - 1) * page_size).limit(page_size)
        result = await session.execute(query)
        agents = list(result.scalars().all())

        return agents, total

    async def get_agent(self, session: AsyncSession, agent_id: uuid.UUID) -> Agent:
        result = await session.execute(select(Agent).where(Agent.id == agent_id))
        agent = result.scalar_one_or_none()
        if agent is None:
            raise NotFoundError(f"Agent {agent_id} not found")
        return agent

    async def create_agent(
        self, session: AsyncSession, owner_address: str, data: dict
    ) -> Agent:
        agent = Agent(
            owner_address=owner_address.lower(),
            name=data["name"],
            description=data.get("description"),
            erc8004_token_id=data.get("erc8004_token_id"),
            erc8004_contract=data.get("erc8004_contract"),
            code_hash=data.get("code_hash"),
            tee_attestation=data.get("tee_attestation"),
            lockbox_address=data.get("lockbox_address"),
            status=AgentStatus.PENDING,
        )
        session.add(agent)
        await session.flush()
        logger.info("Created agent id=%s name=%s owner=%s", agent.id, agent.name, owner_address)
        return agent

    async def update_agent(
        self,
        session: AsyncSession,
        agent_id: uuid.UUID,
        owner_address: str,
        data: dict,
    ) -> Agent:
        agent = await self.get_agent(session, agent_id)
        if agent.owner_address != owner_address.lower():
            raise ForbiddenError("Not the agent owner")

        for key, value in data.items():
            if value is not None and hasattr(agent, key):
                setattr(agent, key, value)

        await session.flush()
        return agent

    async def activate_agent(
        self,
        session: AsyncSession,
        agent_id: uuid.UUID,
        owner_address: str,
        lockbox_address: str,
    ) -> Agent:
        agent = await self.get_agent(session, agent_id)
        if agent.owner_address != owner_address.lower():
            raise ForbiddenError("Not the agent owner")

        if agent.status != AgentStatus.PENDING:
            raise BadRequestError(
                f"Agent cannot be activated from status {agent.status}"
            )

        agent.lockbox_address = lockbox_address.lower()
        agent.status = AgentStatus.ACTIVE
        await session.flush()
        logger.info("Activated agent id=%s lockbox=%s", agent_id, lockbox_address)
        return agent

    async def get_agent_summary(
        self, session: AsyncSession, agent_id: uuid.UUID
    ) -> dict:
        agent = await self.get_agent(session, agent_id)

        # Revenue last 30 days
        thirty_days_ago = datetime.now(timezone.utc) - timedelta(days=30)
        rev_result = await session.execute(
            select(func.coalesce(func.sum(RevenueRecord.amount), 0)).where(
                RevenueRecord.agent_id == agent_id,
                RevenueRecord.recorded_at >= thirty_days_ago,
            )
        )
        revenue_30d = rev_result.scalar() or Decimal(0)

        # Credit line info
        cl_result = await session.execute(
            select(CreditLine).where(CreditLine.agent_id == agent_id)
        )
        credit_line = cl_result.scalar_one_or_none()

        max_credit = credit_line.max_amount if credit_line else Decimal(0)
        used_credit = credit_line.used_amount if credit_line else Decimal(0)
        utilization = (
            (used_credit / max_credit * 100) if max_credit > 0 else Decimal(0)
        )

        return {
            "id": agent.id,
            "name": agent.name,
            "owner_address": agent.owner_address,
            "reputation_score": agent.reputation_score,
            "status": agent.status,
            "revenue_30d": revenue_30d,
            "credit_line": max_credit,
            "credit_utilization": utilization,
        }
