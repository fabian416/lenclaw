import httpx
from src.config import settings

INDEXER_HEADERS = {"x-api-key": settings.wdk_indexer_api_key}
BASE = settings.wdk_indexer_base_url


async def get_token_balance(address: str, blockchain: str = "ethereum", token: str = "usdt") -> str:
    """Get token balance via WDK Indexer API"""
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                f"{BASE}/api/v1/{blockchain}/{token}/{address}/token-balances",
                headers=INDEXER_HEADERS,
            )
            if resp.status_code == 200:
                data = resp.json()
                # Extract balance from response
                if isinstance(data, dict):
                    return str(data.get("balance", data.get("amount", "0")))
                if isinstance(data, list) and len(data) > 0:
                    return str(data[0].get("balance", "0"))
            return "0"
    except Exception as e:
        print(f"[Indexer] Token balance error: {e}")
        return "0"


async def get_token_transfers(address: str, blockchain: str = "ethereum", token: str = "usdt") -> list:
    """Get token transfers via WDK Indexer API"""
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                f"{BASE}/api/v1/{blockchain}/{token}/{address}/token-transfers",
                headers=INDEXER_HEADERS,
            )
            if resp.status_code == 200:
                data = resp.json()
                if isinstance(data, list):
                    return data
                return data.get("transfers", data.get("transactions", []))
            return []
    except Exception as e:
        print(f"[Indexer] Transfers error: {e}")
        return []


async def get_eth_balance_rpc(address: str) -> str:
    """Get ETH balance via RPC (fallback, indexer focuses on tokens)"""
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(
                settings.base_rpc_url,
                json={
                    "jsonrpc": "2.0",
                    "method": "eth_getBalance",
                    "params": [address, "latest"],
                    "id": 1,
                },
            )
            if resp.status_code == 200:
                result = resp.json().get("result", "0x0")
                return str(int(result, 16))
    except Exception as e:
        print(f"[RPC] ETH balance error: {e}")
    return "0"


async def get_usdt_balance_rpc(address: str) -> str:
    """Get USDT balance via RPC (fallback)"""
    try:
        # balanceOf(address) selector = 0x70a08231
        padded_addr = address[2:].lower().zfill(64)
        data = f"0x70a08231{padded_addr}"
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(
                settings.base_rpc_url,
                json={
                    "jsonrpc": "2.0",
                    "method": "eth_call",
                    "params": [{"to": settings.usdt_address, "data": data}, "latest"],
                    "id": 1,
                },
            )
            if resp.status_code == 200:
                result = resp.json().get("result", "0x0")
                return str(int(result, 16))
    except Exception as e:
        print(f"[RPC] USDT balance error: {e}")
    return "0"


async def check_indexer_health() -> dict:
    """Check WDK Indexer API health"""
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            resp = await client.get(
                f"{BASE}/api/v1/health",
                headers=INDEXER_HEADERS,
            )
            return {"status": "ok" if resp.status_code == 200 else "error", "code": resp.status_code}
    except Exception as e:
        return {"status": "error", "message": str(e)}


async def get_supported_chains() -> list:
    """Get supported chains from WDK Indexer"""
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            resp = await client.get(
                f"{BASE}/api/v1/chains",
                headers=INDEXER_HEADERS,
            )
            if resp.status_code == 200:
                return resp.json()
    except Exception:
        pass
    return []


async def get_balances(address: str) -> dict:
    """Get all balances for an address — tries indexer first, falls back to RPC"""
    # Get ETH balance via RPC (most reliable for native token)
    eth_balance = await get_eth_balance_rpc(address)

    # Get USDT balance — try indexer first, fallback to RPC
    usdt_balance = await get_token_balance(address, "ethereum", "usdt")
    if usdt_balance == "0":
        usdt_balance = await get_usdt_balance_rpc(address)

    return {"ethBalance": eth_balance, "usdtBalance": usdt_balance}
