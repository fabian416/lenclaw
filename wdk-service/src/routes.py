from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from src.wallet import generate_seed_phrase, is_valid_seed, derive_address
from src.indexer import get_balances, check_indexer_health, get_supported_chains, get_token_transfers
from src.config import settings
from src.registry import register_agent_onchain
from web3 import Web3
import json

router = APIRouter()

# ── Web3 setup for relay transactions ────────────────────────────────────────

_w3 = Web3(Web3.HTTPProvider(settings.base_rpc_url))


class SeedPhraseRequest(BaseModel):
    seedPhrase: str


class RegisterAgentRequest(BaseModel):
    agentWallet: str
    codeHash: str = "0x" + "0" * 64  # default empty hash
    metadata: str = "{}"
    externalToken: str = "0x" + "0" * 40
    externalProtocolId: int = 0
    agentCategory: str = "0x" + "0" * 64  # default
    asset: str = "0x0000000000000000000000000000000000000000"  # zero = skip auto vault deploy


@router.get("/health")
async def health():
    indexer = await check_indexer_health()
    return {"status": "ok", "runtime": "python-fastapi", "indexer": indexer}


@router.get("/chains")
async def chains():
    return await get_supported_chains()


@router.post("/create")
async def create_wallet():
    seed = generate_seed_phrase()
    address = derive_address(seed)
    return {"address": address, "seedPhrase": seed}


@router.post("/restore")
async def restore_wallet(req: SeedPhraseRequest):
    if not is_valid_seed(req.seedPhrase):
        raise HTTPException(400, detail="Invalid seed phrase")
    address = derive_address(req.seedPhrase)
    return {"address": address, "seedPhrase": req.seedPhrase}


@router.post("/validate")
async def validate_seed(req: SeedPhraseRequest):
    return {"valid": is_valid_seed(req.seedPhrase)}


@router.post("/balance")
async def get_wallet_balance(req: SeedPhraseRequest):
    if not is_valid_seed(req.seedPhrase):
        raise HTTPException(400, detail="Invalid seed phrase")
    address = derive_address(req.seedPhrase)
    balances = await get_balances(address)
    return {"address": address, **balances}


@router.post("/transfers")
async def get_wallet_transfers(req: SeedPhraseRequest):
    if not is_valid_seed(req.seedPhrase):
        raise HTTPException(400, detail="Invalid seed phrase")
    address = derive_address(req.seedPhrase)
    transfers = await get_token_transfers(address)
    return {"address": address, "transfers": transfers}


@router.post("/register-agent")
async def register_agent(req: RegisterAgentRequest):
    """Register an agent on-chain via relay. The server holds the authorized deployer key."""
    try:
        code_hash = bytes.fromhex(req.codeHash.replace("0x", "").zfill(64))
        category = bytes.fromhex(req.agentCategory.replace("0x", "").zfill(64))

        result = register_agent_onchain(
            agent_wallet=req.agentWallet,
            code_hash=code_hash,
            metadata=req.metadata,
            external_token=req.externalToken,
            external_protocol_id=req.externalProtocolId,
            agent_category=category,
            asset=req.asset,
        )
        return result
    except Exception as e:
        raise HTTPException(500, detail=str(e))
