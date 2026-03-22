from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from src.wallet import generate_seed_phrase, is_valid_seed, derive_address
from src.indexer import get_balances, check_indexer_health, get_supported_chains, get_token_transfers

router = APIRouter()


class SeedPhraseRequest(BaseModel):
    seedPhrase: str


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
