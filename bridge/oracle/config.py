"""Oracle configuration - API keys, chain config, reporting intervals."""

from __future__ import annotations

import os
from dataclasses import dataclass, field


@dataclass
class ChainConfig:
    """On-chain connection parameters."""

    rpc_url: str = "https://mainnet.base.org"
    chain_id: int = 8453
    # Oracle signer private key (hex, without 0x prefix)
    oracle_private_key: str = ""
    # BridgeOracle contract address
    bridge_oracle_address: str = ""
    # RevenueLockbox factory or known lockbox addresses
    lockbox_factory_address: str = ""
    # Gas settings
    max_gas_price_gwei: int = 50
    gas_limit: int = 300_000
    # Confirmations to wait
    confirmation_blocks: int = 2


@dataclass
class ConnectorCredentials:
    """Credentials for a specific connector instance."""

    connector_type: str = ""
    api_key: str = ""
    agent_id: str = ""
    extra: dict[str, str] = field(default_factory=dict)


@dataclass
class OracleConfig:
    """Top-level oracle configuration."""

    # Polling interval in seconds (default: 1 hour)
    poll_interval_seconds: int = 3600
    # Minimum revenue amount (USD) to trigger on-chain report
    min_report_amount_usd: float = 1.0
    # Maximum retries for failed on-chain submissions
    max_retries: int = 3
    # Retry backoff base in seconds
    retry_backoff_base: float = 30.0
    # Chain configuration
    chain: ChainConfig = field(default_factory=ChainConfig)
    # Registered connector credentials
    connectors: list[ConnectorCredentials] = field(default_factory=list)
    # Log level
    log_level: str = "INFO"

    @classmethod
    def from_env(cls) -> OracleConfig:
        """Build config from environment variables."""
        chain = ChainConfig(
            rpc_url=os.getenv("BRIDGE_RPC_URL", "https://mainnet.base.org"),
            chain_id=int(os.getenv("BRIDGE_CHAIN_ID", "8453")),
            oracle_private_key=os.getenv("BRIDGE_ORACLE_PRIVATE_KEY", ""),
            bridge_oracle_address=os.getenv("BRIDGE_ORACLE_ADDRESS", ""),
            lockbox_factory_address=os.getenv("BRIDGE_LOCKBOX_FACTORY", ""),
            max_gas_price_gwei=int(os.getenv("BRIDGE_MAX_GAS_GWEI", "50")),
            gas_limit=int(os.getenv("BRIDGE_GAS_LIMIT", "300000")),
            confirmation_blocks=int(os.getenv("BRIDGE_CONFIRMATIONS", "2")),
        )

        return cls(
            poll_interval_seconds=int(os.getenv("BRIDGE_POLL_INTERVAL", "3600")),
            min_report_amount_usd=float(os.getenv("BRIDGE_MIN_REPORT_USD", "1.0")),
            max_retries=int(os.getenv("BRIDGE_MAX_RETRIES", "3")),
            retry_backoff_base=float(os.getenv("BRIDGE_RETRY_BACKOFF", "30.0")),
            chain=chain,
            log_level=os.getenv("BRIDGE_LOG_LEVEL", "INFO"),
        )
