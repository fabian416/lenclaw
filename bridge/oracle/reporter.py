"""On-chain reporter - submits verified revenue attestations to the RevenueLockbox."""

from __future__ import annotations

import logging
from decimal import Decimal
from typing import Any

from web3 import AsyncWeb3
from web3.middleware import ExtraDataToPOAMiddleware
from web3.types import TxReceipt

from bridge.oracle.config import OracleConfig
from bridge.oracle.service import RevenueAttestation

logger = logging.getLogger(__name__)

# Minimal ABI for BridgeOracle reporting contract.
# This assumes a BridgeOracle contract with a reportRevenue function.
BRIDGE_ORACLE_ABI: list[dict[str, Any]] = [
    {
        "inputs": [
            {"internalType": "uint256", "name": "agentId", "type": "uint256"},
            {"internalType": "uint256", "name": "amount", "type": "uint256"},
            {"internalType": "bytes32", "name": "dataHash", "type": "bytes32"},
            {"internalType": "bytes", "name": "signature", "type": "bytes"},
            {"internalType": "uint256", "name": "nonce", "type": "uint256"},
        ],
        "name": "reportRevenue",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function",
    },
    {
        "inputs": [
            {"internalType": "uint256", "name": "agentId", "type": "uint256"},
        ],
        "name": "getLatestReport",
        "outputs": [
            {"internalType": "uint256", "name": "amount", "type": "uint256"},
            {"internalType": "bytes32", "name": "dataHash", "type": "bytes32"},
            {"internalType": "uint256", "name": "timestamp", "type": "uint256"},
            {"internalType": "uint256", "name": "nonce", "type": "uint256"},
        ],
        "stateMutability": "view",
        "type": "function",
    },
    {
        "inputs": [
            {"internalType": "uint256", "name": "agentId", "type": "uint256"},
        ],
        "name": "getTotalReported",
        "outputs": [
            {"internalType": "uint256", "name": "", "type": "uint256"},
        ],
        "stateMutability": "view",
        "type": "function",
    },
]

# Minimal ABI for RevenueLockbox read functions
REVENUE_LOCKBOX_ABI: list[dict[str, Any]] = [
    {
        "inputs": [],
        "name": "totalRevenueCapture",
        "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}],
        "stateMutability": "view",
        "type": "function",
    },
    {
        "inputs": [],
        "name": "totalRepaid",
        "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}],
        "stateMutability": "view",
        "type": "function",
    },
    {
        "inputs": [],
        "name": "agentId",
        "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}],
        "stateMutability": "view",
        "type": "function",
    },
    {
        "inputs": [],
        "name": "processRevenue",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function",
    },
]


class OracleReporter:
    """Submits verified revenue data on-chain via the BridgeOracle contract."""

    def __init__(self, config: OracleConfig) -> None:
        self.config = config
        self._w3: AsyncWeb3 | None = None
        self._account: Any = None
        self._oracle_contract: Any = None

    async def initialise(self) -> None:
        """Set up web3 connection and contract references."""
        chain_cfg = self.config.chain

        self._w3 = AsyncWeb3(AsyncWeb3.AsyncHTTPProvider(chain_cfg.rpc_url))
        self._w3.middleware_onion.inject(ExtraDataToPOAMiddleware, layer=0)

        # Load oracle signer account
        key = chain_cfg.oracle_private_key
        if not key:
            raise ValueError("BRIDGE_ORACLE_PRIVATE_KEY not set")
        key = key if key.startswith("0x") else f"0x{key}"
        self._account = self._w3.eth.account.from_key(key)

        # Initialise BridgeOracle contract
        if chain_cfg.bridge_oracle_address:
            self._oracle_contract = self._w3.eth.contract(
                address=self._w3.to_checksum_address(chain_cfg.bridge_oracle_address),
                abi=BRIDGE_ORACLE_ABI,
            )

        logger.info(
            "OracleReporter initialised: chain_id=%d signer=%s oracle_contract=%s",
            chain_cfg.chain_id,
            self._account.address,
            chain_cfg.bridge_oracle_address or "NOT SET",
        )

    async def close(self) -> None:
        """Clean up web3 resources."""
        self._w3 = None
        self._oracle_contract = None
        self._account = None

    # ------------------------------------------------------------------
    # Submit attestation on-chain
    # ------------------------------------------------------------------

    async def submit_attestation(
        self,
        attestation: RevenueAttestation,
    ) -> TxReceipt | None:
        """Submit a signed revenue attestation on-chain."""
        if self._w3 is None or self._account is None:
            raise RuntimeError("Reporter not initialised. Call initialise() first.")

        if self._oracle_contract is None:
            logger.warning(
                "No BridgeOracle contract configured; attestation logged but not submitted"
            )
            logger.info(
                "Attestation (off-chain): agent=%s amount=%s hash=%s",
                attestation.agent_id,
                attestation.total_amount,
                attestation.data_hash,
            )
            return None

        try:
            # Convert amount to uint256 (6 decimals for USDT)
            amount_wei = int(attestation.total_amount * Decimal("1_000_000"))
            data_hash_bytes = bytes.fromhex(attestation.data_hash.replace("0x", ""))
            sig_bytes = bytes.fromhex(attestation.signature.replace("0x", ""))
            agent_id_int = int(attestation.agent_id) if attestation.agent_id.isdigit() else 0

            nonce = await self._w3.eth.get_transaction_count(self._account.address)
            gas_price = await self._w3.eth.gas_price
            max_gas_price = self._w3.to_wei(
                self.config.chain.max_gas_price_gwei, "gwei"
            )

            if gas_price > max_gas_price:
                logger.warning(
                    "Gas price %d exceeds max %d; skipping submission",
                    gas_price,
                    max_gas_price,
                )
                return None

            tx = await self._oracle_contract.functions.reportRevenue(
                agent_id_int,
                amount_wei,
                data_hash_bytes,
                sig_bytes,
                attestation.nonce,
            ).build_transaction(
                {
                    "from": self._account.address,
                    "nonce": nonce,
                    "gas": self.config.chain.gas_limit,
                    "gasPrice": gas_price,
                    "chainId": self.config.chain.chain_id,
                }
            )

            signed_tx = self._account.sign_transaction(tx)
            tx_hash = await self._w3.eth.send_raw_transaction(signed_tx.raw_transaction)
            logger.info(
                "Submitted attestation tx=%s agent=%s amount=%s",
                tx_hash.hex(),
                attestation.agent_id,
                attestation.total_amount,
            )

            receipt = await self._w3.eth.wait_for_transaction_receipt(
                tx_hash,
                timeout=120,
            )

            if receipt["status"] == 1:
                logger.info(
                    "Attestation confirmed: tx=%s block=%d gas_used=%d",
                    tx_hash.hex(),
                    receipt["blockNumber"],
                    receipt["gasUsed"],
                )
            else:
                logger.error(
                    "Attestation tx reverted: tx=%s block=%d",
                    tx_hash.hex(),
                    receipt["blockNumber"],
                )

            return receipt

        except Exception as exc:
            logger.error(
                "Failed to submit attestation for agent=%s: %s",
                attestation.agent_id,
                exc,
            )
            raise

    # ------------------------------------------------------------------
    # Read on-chain state
    # ------------------------------------------------------------------

    async def get_latest_report(self, agent_id: int) -> dict[str, Any] | None:
        """Read the latest on-chain report for an agent."""
        if self._w3 is None or self._oracle_contract is None:
            return None

        try:
            result = await self._oracle_contract.functions.getLatestReport(agent_id).call()
            return {
                "amount": Decimal(str(result[0])) / Decimal("1_000_000"),
                "data_hash": "0x" + result[1].hex(),
                "timestamp": result[2],
                "nonce": result[3],
            }
        except Exception as exc:
            logger.error("Failed to read latest report for agent=%d: %s", agent_id, exc)
            return None

    async def get_total_reported(self, agent_id: int) -> Decimal:
        """Read the total reported revenue for an agent on-chain."""
        if self._w3 is None or self._oracle_contract is None:
            return Decimal("0")

        try:
            result = await self._oracle_contract.functions.getTotalReported(agent_id).call()
            return Decimal(str(result)) / Decimal("1_000_000")
        except Exception as exc:
            logger.error("Failed to read total reported for agent=%d: %s", agent_id, exc)
            return Decimal("0")

    async def get_lockbox_stats(self, lockbox_address: str) -> dict[str, Any]:
        """Read RevenueLockbox on-chain stats."""
        if self._w3 is None:
            return {}

        try:
            contract = self._w3.eth.contract(
                address=self._w3.to_checksum_address(lockbox_address),
                abi=REVENUE_LOCKBOX_ABI,
            )
            total_capture = await contract.functions.totalRevenueCapture().call()
            total_repaid = await contract.functions.totalRepaid().call()
            agent_id = await contract.functions.agentId().call()

            return {
                "lockbox_address": lockbox_address,
                "agent_id": agent_id,
                "total_revenue_capture": Decimal(str(total_capture)) / Decimal("1_000_000"),
                "total_repaid": Decimal(str(total_repaid)) / Decimal("1_000_000"),
            }
        except Exception as exc:
            logger.error("Failed to read lockbox %s: %s", lockbox_address, exc)
            return {}
