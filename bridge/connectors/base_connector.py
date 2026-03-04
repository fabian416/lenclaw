"""Abstract base class for all POS connectors."""

from __future__ import annotations

import enum
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime
from decimal import Decimal
from typing import Any


class ConnectorType(str, enum.Enum):
    STRIPE = "stripe"
    SQUARE = "square"
    MERCADOPAGO = "mercadopago"


class ConnectorError(Exception):
    """Raised when a connector operation fails."""

    def __init__(self, message: str, connector: str = "", retriable: bool = False):
        self.connector = connector
        self.retriable = retriable
        super().__init__(message)


@dataclass
class Transaction:
    """Normalised transaction from any payment processor."""

    id: str
    amount: Decimal
    currency: str
    timestamp: datetime
    metadata: dict[str, Any] = field(default_factory=dict)
    source: str = ""
    status: str = "completed"
    fee: Decimal = Decimal("0")
    net_amount: Decimal = Decimal("0")
    customer_id: str | None = None
    description: str | None = None

    def __post_init__(self) -> None:
        if self.net_amount == Decimal("0") and self.amount > 0:
            self.net_amount = self.amount - self.fee


@dataclass
class MerchantInfo:
    """Verified merchant identity."""

    merchant_id: str
    name: str
    email: str | None = None
    country: str | None = None
    verified: bool = False
    metadata: dict[str, Any] = field(default_factory=dict)


class BaseConnector(ABC):
    """Abstract base class that all payment connectors must implement."""

    connector_type: ConnectorType

    def __init__(self, api_key: str, **kwargs: Any) -> None:
        self.api_key = api_key
        self._connected = False

    @property
    def is_connected(self) -> bool:
        return self._connected

    @abstractmethod
    async def connect(self) -> None:
        """Establish connection / validate credentials with the payment provider."""
        ...

    @abstractmethod
    async def disconnect(self) -> None:
        """Tear down connection / release resources."""
        ...

    @abstractmethod
    async def fetch_transactions(
        self,
        since: datetime,
        until: datetime | None = None,
        limit: int = 100,
    ) -> list[Transaction]:
        """Fetch completed transactions from the payment provider."""
        ...

    @abstractmethod
    async def get_balance(self) -> dict[str, Decimal]:
        """Return available balance(s) keyed by currency."""
        ...

    @abstractmethod
    async def verify_merchant(self) -> MerchantInfo:
        """Verify the merchant account identity."""
        ...

    def _ensure_connected(self) -> None:
        if not self._connected:
            raise ConnectorError(
                "Connector not connected. Call connect() first.",
                connector=self.connector_type.value,
            )
