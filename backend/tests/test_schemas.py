"""Tests for Pydantic schemas validation."""

from decimal import Decimal

import pytest
from pydantic import ValidationError

from src.agent.schemas import AgentCreate
from src.auth.schemas import SiweVerifyRequest
from src.credit.schemas import DrawRequest


class TestAgentSchemas:
    def test_create_valid(self):
        agent = AgentCreate(name="TestAgent", description="A test agent")
        assert agent.name == "TestAgent"

    def test_create_empty_name_fails(self):
        with pytest.raises(ValidationError):
            AgentCreate(name="")

    def test_create_optional_fields(self):
        agent = AgentCreate(
            name="Agent",
            erc8004_token_id="123",
            code_hash="0xabc",
        )
        assert agent.erc8004_token_id == "123"
        assert agent.lockbox_address is None


class TestAuthSchemas:
    def test_siwe_request(self):
        req = SiweVerifyRequest(
            message="test message",
            signature="0xsig",
        )
        assert req.message == "test message"


class TestCreditSchemas:
    def test_draw_request_valid(self):
        req = DrawRequest(amount=Decimal("100"), tenor_days=30)
        assert req.amount == Decimal("100")

    def test_draw_request_zero_amount_fails(self):
        with pytest.raises(ValidationError):
            DrawRequest(amount=Decimal("0"), tenor_days=30)

    def test_draw_request_negative_amount_fails(self):
        with pytest.raises(ValidationError):
            DrawRequest(amount=Decimal("-100"), tenor_days=30)

    def test_draw_request_invalid_tenor_fails(self):
        with pytest.raises(ValidationError):
            DrawRequest(amount=Decimal("100"), tenor_days=3)

        with pytest.raises(ValidationError):
            DrawRequest(amount=Decimal("100"), tenor_days=100)
