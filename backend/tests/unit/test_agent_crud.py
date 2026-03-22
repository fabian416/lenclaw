"""Tests for Agent CRUD service."""

from __future__ import annotations

import uuid
from unittest.mock import AsyncMock, MagicMock

import pytest

from src.agent.service import AgentService
from src.common.exceptions import BadRequestError, ForbiddenError, NotFoundError
from src.db.models import AgentStatus
from tests.conftest import VALID_WALLET, make_agent


@pytest.fixture
def agent_service() -> AgentService:
    return AgentService()


class TestListAgents:
    async def test_returns_agents_and_total(
        self, agent_service: AgentService, mock_session: AsyncMock
    ):
        agent1 = make_agent({"name": "Agent-1"})
        agent2 = make_agent({"name": "Agent-2"})

        # First call: count query; second call: list query
        count_result = MagicMock()
        count_result.scalar.return_value = 2

        list_result = MagicMock()
        scalars_mock = MagicMock()
        scalars_mock.all.return_value = [agent1, agent2]
        list_result.scalars.return_value = scalars_mock

        mock_session.execute.side_effect = [count_result, list_result]

        agents, total = await agent_service.list_agents(mock_session)

        assert total == 2
        assert len(agents) == 2
        assert agents[0].name == "Agent-1"
        assert agents[1].name == "Agent-2"

    async def test_filter_by_status(
        self, agent_service: AgentService, mock_session: AsyncMock
    ):
        active_agent = make_agent({"status": AgentStatus.ACTIVE})

        count_result = MagicMock()
        count_result.scalar.return_value = 1

        list_result = MagicMock()
        scalars_mock = MagicMock()
        scalars_mock.all.return_value = [active_agent]
        list_result.scalars.return_value = scalars_mock

        mock_session.execute.side_effect = [count_result, list_result]

        agents, total = await agent_service.list_agents(
            mock_session, status=AgentStatus.ACTIVE
        )

        assert total == 1
        assert agents[0].status == AgentStatus.ACTIVE

    async def test_pagination(
        self, agent_service: AgentService, mock_session: AsyncMock
    ):
        count_result = MagicMock()
        count_result.scalar.return_value = 50

        list_result = MagicMock()
        scalars_mock = MagicMock()
        scalars_mock.all.return_value = [make_agent() for _ in range(10)]
        list_result.scalars.return_value = scalars_mock

        mock_session.execute.side_effect = [count_result, list_result]

        agents, total = await agent_service.list_agents(
            mock_session, page=3, page_size=10
        )

        assert total == 50
        assert len(agents) == 10


class TestGetAgent:
    async def test_returns_agent_when_found(
        self, agent_service: AgentService, mock_session: AsyncMock
    ):
        agent = make_agent()
        result_mock = MagicMock()
        result_mock.scalar_one_or_none.return_value = agent
        mock_session.execute.return_value = result_mock

        found = await agent_service.get_agent(mock_session, agent.id)
        assert found.id == agent.id
        assert found.name == agent.name

    async def test_raises_not_found_when_missing(
        self, agent_service: AgentService, mock_session: AsyncMock
    ):
        result_mock = MagicMock()
        result_mock.scalar_one_or_none.return_value = None
        mock_session.execute.return_value = result_mock

        with pytest.raises(NotFoundError, match="not found"):
            await agent_service.get_agent(mock_session, uuid.uuid4())


class TestCreateAgent:
    async def test_creates_agent_with_correct_fields(
        self, agent_service: AgentService, mock_session: AsyncMock
    ):
        data = {
            "name": "NewAgent",
            "description": "A new agent",
            "code_hash": "0x" + "d" * 64,
        }

        await agent_service.create_agent(mock_session, VALID_WALLET, data)

        mock_session.add.assert_called_once()
        mock_session.flush.assert_awaited_once()

    async def test_owner_address_is_lowercased(
        self, agent_service: AgentService, mock_session: AsyncMock
    ):
        data = {"name": "TestAgent"}
        mixed_case = "0x742D35Cc6634C0532925a3b844Bc9e7595f2bD1e"

        # The agent service calls session.add then flush.
        # We need to capture the agent that was added.
        added_agents = []
        mock_session.add.side_effect = lambda x: added_agents.append(x)

        await agent_service.create_agent(mock_session, mixed_case, data)

        assert len(added_agents) == 1
        assert added_agents[0].owner_address == mixed_case.lower()

    async def test_initial_status_is_pending(
        self, agent_service: AgentService, mock_session: AsyncMock
    ):
        data = {"name": "TestAgent"}

        added_agents = []
        mock_session.add.side_effect = lambda x: added_agents.append(x)

        await agent_service.create_agent(mock_session, VALID_WALLET, data)

        assert added_agents[0].status == AgentStatus.PENDING


class TestUpdateAgent:
    async def test_updates_agent_fields(
        self, agent_service: AgentService, mock_session: AsyncMock
    ):
        agent = make_agent({"owner_address": VALID_WALLET})
        result_mock = MagicMock()
        result_mock.scalar_one_or_none.return_value = agent
        mock_session.execute.return_value = result_mock

        updated = await agent_service.update_agent(
            mock_session, agent.id, VALID_WALLET, {"name": "UpdatedName"}
        )

        assert updated.name == "UpdatedName"

    async def test_raises_forbidden_when_not_owner(
        self, agent_service: AgentService, mock_session: AsyncMock
    ):
        agent = make_agent({"owner_address": VALID_WALLET})
        result_mock = MagicMock()
        result_mock.scalar_one_or_none.return_value = agent
        mock_session.execute.return_value = result_mock

        other_wallet = "0x1111111111111111111111111111111111111111"
        with pytest.raises(ForbiddenError, match="Not the agent owner"):
            await agent_service.update_agent(
                mock_session, agent.id, other_wallet, {"name": "Hacked"}
            )

    async def test_ignores_none_values(
        self, agent_service: AgentService, mock_session: AsyncMock
    ):
        original_name = "OriginalName"
        agent = make_agent({"owner_address": VALID_WALLET, "name": original_name})
        result_mock = MagicMock()
        result_mock.scalar_one_or_none.return_value = agent
        mock_session.execute.return_value = result_mock

        await agent_service.update_agent(
            mock_session,
            agent.id,
            VALID_WALLET,
            {"name": None, "description": "New desc"},
        )

        assert agent.name == original_name
        assert agent.description == "New desc"


class TestActivateAgent:
    async def test_activates_pending_agent(
        self, agent_service: AgentService, mock_session: AsyncMock
    ):
        agent = make_agent(
            {"owner_address": VALID_WALLET, "status": AgentStatus.PENDING}
        )
        result_mock = MagicMock()
        result_mock.scalar_one_or_none.return_value = agent
        mock_session.execute.return_value = result_mock

        lockbox = "0x" + "f" * 40
        activated = await agent_service.activate_agent(
            mock_session, agent.id, VALID_WALLET, lockbox
        )

        assert activated.status == AgentStatus.ACTIVE
        assert activated.lockbox_address == lockbox.lower()

    async def test_raises_forbidden_when_not_owner(
        self, agent_service: AgentService, mock_session: AsyncMock
    ):
        agent = make_agent(
            {"owner_address": VALID_WALLET, "status": AgentStatus.PENDING}
        )
        result_mock = MagicMock()
        result_mock.scalar_one_or_none.return_value = agent
        mock_session.execute.return_value = result_mock

        with pytest.raises(ForbiddenError):
            await agent_service.activate_agent(
                mock_session,
                agent.id,
                "0x0000000000000000000000000000000000000001",
                "0x" + "f" * 40,
            )

    async def test_cannot_activate_non_pending_agent(
        self, agent_service: AgentService, mock_session: AsyncMock
    ):
        agent = make_agent(
            {"owner_address": VALID_WALLET, "status": AgentStatus.ACTIVE}
        )
        result_mock = MagicMock()
        result_mock.scalar_one_or_none.return_value = agent
        mock_session.execute.return_value = result_mock

        with pytest.raises(BadRequestError, match="cannot be activated"):
            await agent_service.activate_agent(
                mock_session, agent.id, VALID_WALLET, "0x" + "f" * 40
            )
