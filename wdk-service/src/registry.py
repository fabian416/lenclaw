from web3 import Web3
from eth_account import Account
from src.config import settings

# Minimal ABI for registerAgent
REGISTRY_ABI = [
    {
        "inputs": [
            {"name": "agentWallet", "type": "address"},
            {"name": "codeHash", "type": "bytes32"},
            {"name": "metadata", "type": "string"},
            {"name": "externalToken", "type": "address"},
            {"name": "externalProtocolId", "type": "uint256"},
            {"name": "agentCategory", "type": "bytes32"},
            {"name": "asset", "type": "address"}
        ],
        "name": "registerAgent",
        "outputs": [{"name": "", "type": "uint256"}],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [{"name": "agentId", "type": "uint256"}],
        "name": "isRegistered",
        "outputs": [{"name": "", "type": "bool"}],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [],
        "name": "totalAgents",
        "outputs": [{"name": "", "type": "uint256"}],
        "stateMutability": "view",
        "type": "function"
    }
]

def get_web3():
    return Web3(Web3.HTTPProvider(settings.base_rpc_url))

def get_registry_contract():
    w3 = get_web3()
    return w3.eth.contract(
        address=Web3.to_checksum_address(settings.agent_registry_address),
        abi=REGISTRY_ABI
    )

def register_agent_onchain(
    agent_wallet: str,
    code_hash: bytes,
    metadata: str,
    external_token: str,
    external_protocol_id: int,
    agent_category: bytes,
    asset: str
) -> dict:
    """Send registerAgent tx using deployer's private key"""
    w3 = get_web3()
    contract = get_registry_contract()

    pk = settings.deployer_private_key
    if not pk.startswith("0x"):
        pk = "0x" + pk

    account = Account.from_key(pk)

    tx = contract.functions.registerAgent(
        Web3.to_checksum_address(agent_wallet),
        code_hash,
        metadata,
        Web3.to_checksum_address(external_token),
        external_protocol_id,
        agent_category,
        Web3.to_checksum_address(asset),
    ).build_transaction({
        "from": account.address,
        "nonce": w3.eth.get_transaction_count(account.address),
        "gas": 8_000_000,  # vault+lockbox+smartwallet atomic deploy needs ~6M+
        "maxFeePerGas": w3.eth.gas_price * 2,
        "maxPriorityFeePerGas": w3.eth.max_priority_fee,
        "chainId": settings.chain_id,
    })

    signed = account.sign_transaction(tx)
    tx_hash = w3.eth.send_raw_transaction(signed.raw_transaction)
    receipt = w3.eth.wait_for_transaction_receipt(tx_hash, timeout=120)

    # Parse agentId from logs (AgentRegistered event)
    agent_id = None
    if receipt.status == 1:
        # The agentId is the tokenId from the Transfer event (ERC-721 mint)
        for log in receipt.logs:
            # Transfer(address,address,uint256) = first topic
            if len(log.topics) >= 4:
                # topics[3] is the tokenId for ERC-721 Transfer
                agent_id = int(log.topics[3].hex(), 16)
                break

    return {
        "txHash": tx_hash.hex(),
        "agentId": agent_id,
        "status": "success" if receipt.status == 1 else "failed",
        "gasUsed": receipt.gasUsed,
    }
