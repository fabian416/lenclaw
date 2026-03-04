from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, Field

from src.db.models import AgentStatus


class AgentCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    description: str | None = None
    erc8004_token_id: str | None = None
    erc8004_contract: str | None = None
    code_hash: str | None = None
    tee_attestation: str | None = None
    lockbox_address: str | None = None


class AgentUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    erc8004_token_id: str | None = None
    erc8004_contract: str | None = None
    code_hash: str | None = None
    tee_attestation: str | None = None
    lockbox_address: str | None = None


class AgentResponse(BaseModel):
    id: uuid.UUID
    owner_address: str
    name: str
    description: str | None
    erc8004_token_id: str | None
    erc8004_contract: str | None
    code_hash: str | None
    code_verified: bool
    lockbox_address: str | None
    reputation_score: int
    status: AgentStatus
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class AgentListResponse(BaseModel):
    items: list[AgentResponse]
    total: int
    page: int
    page_size: int


class AgentSummary(BaseModel):
    id: uuid.UUID
    name: str
    owner_address: str
    reputation_score: int
    status: AgentStatus
    revenue_30d: Decimal = Decimal(0)
    credit_line: Decimal = Decimal(0)
    credit_utilization: Decimal = Decimal(0)

    model_config = {"from_attributes": True}


class ActivateAgentRequest(BaseModel):
    lockbox_address: str = Field(..., min_length=42, max_length=42)
