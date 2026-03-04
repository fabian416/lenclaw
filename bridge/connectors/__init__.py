"""Payment processor connectors for Lenclaw POS Bridge."""

from __future__ import annotations

from bridge.connectors.base_connector import (
    BaseConnector,
    ConnectorError,
    ConnectorType,
    Transaction,
)
from bridge.connectors.mercadopago_connector import MercadoPagoConnector
from bridge.connectors.square_connector import SquareConnector
from bridge.connectors.stripe_connector import StripeConnector

__all__ = [
    "BaseConnector",
    "ConnectorError",
    "ConnectorType",
    "MercadoPagoConnector",
    "SquareConnector",
    "StripeConnector",
    "Transaction",
]

CONNECTOR_REGISTRY: dict[ConnectorType, type[BaseConnector]] = {
    ConnectorType.STRIPE: StripeConnector,
    ConnectorType.SQUARE: SquareConnector,
    ConnectorType.MERCADOPAGO: MercadoPagoConnector,
}


def get_connector(connector_type: ConnectorType, **kwargs) -> BaseConnector:
    """Factory: instantiate a connector by type."""
    cls = CONNECTOR_REGISTRY.get(connector_type)
    if cls is None:
        raise ValueError(f"Unknown connector type: {connector_type}")
    return cls(**kwargs)
