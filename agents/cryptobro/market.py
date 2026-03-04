"""Market data from CoinGecko + Fear & Greed Index."""

from __future__ import annotations

import httpx
from dataclasses import dataclass

COINGECKO_BASE = "https://api.coingecko.com/api/v3"
FEAR_GREED_URL = "https://api.alternative.me/fng/"

TRACKED_COINS = [
    "bitcoin", "ethereum", "solana", "base",
    "arbitrum", "optimism", "chainlink", "aave",
    "uniswap", "maker",
]


@dataclass
class CoinPrice:
    id: str
    symbol: str
    name: str
    price_usd: float
    change_24h: float
    change_7d: float
    market_cap: float
    volume_24h: float

    @property
    def is_pumping(self) -> bool:
        return self.change_24h > 5

    @property
    def is_dumping(self) -> bool:
        return self.change_24h < -5


@dataclass
class FearGreed:
    value: int
    label: str
    timestamp: str


async def fetch_prices(coins: list[str] | None = None) -> list[CoinPrice]:
    coins = coins or TRACKED_COINS
    ids = ",".join(coins)
    url = (
        f"{COINGECKO_BASE}/coins/markets"
        f"?vs_currency=usd&ids={ids}"
        f"&order=market_cap_desc&per_page=50&page=1"
        f"&sparkline=false&price_change_percentage=24h,7d"
    )
    async with httpx.AsyncClient(timeout=15) as client:
        r = await client.get(url)
        r.raise_for_status()
        data = r.json()

    results = []
    for c in data:
        results.append(CoinPrice(
            id=c["id"],
            symbol=c["symbol"].upper(),
            name=c["name"],
            price_usd=c.get("current_price", 0) or 0,
            change_24h=c.get("price_change_percentage_24h", 0) or 0,
            change_7d=c.get("price_change_percentage_7d_in_currency", 0) or 0,
            market_cap=c.get("market_cap", 0) or 0,
            volume_24h=c.get("total_volume", 0) or 0,
        ))
    return results


async def fetch_fear_greed() -> FearGreed:
    async with httpx.AsyncClient(timeout=10) as client:
        r = await client.get(FEAR_GREED_URL)
        r.raise_for_status()
        d = r.json()["data"][0]
    return FearGreed(
        value=int(d["value"]),
        label=d["value_classification"],
        timestamp=d["timestamp"],
    )


async def fetch_trending() -> list[dict]:
    url = f"{COINGECKO_BASE}/search/trending"
    async with httpx.AsyncClient(timeout=10) as client:
        r = await client.get(url)
        r.raise_for_status()
        data = r.json()
    coins = []
    for item in data.get("coins", [])[:10]:
        c = item["item"]
        coins.append({
            "name": c["name"],
            "symbol": c["symbol"],
            "market_cap_rank": c.get("market_cap_rank"),
            "price_btc": c.get("price_btc", 0),
        })
    return coins


async def fetch_gas_eth() -> dict | None:
    """Fetch current ETH gas prices from etherscan-style API."""
    try:
        url = "https://api.blocknative.com/gasprices/blockprices"
        async with httpx.AsyncClient(timeout=8) as client:
            r = await client.get(url)
            if r.status_code != 200:
                return None
            data = r.json()
            bp = data["blockPrices"][0]["estimatedPrices"][0]
            return {
                "fast": round(bp.get("maxFeePerGas", 0), 1),
                "standard": round(bp.get("maxFeePerGas", 0) * 0.8, 1),
            }
    except Exception:
        return None
