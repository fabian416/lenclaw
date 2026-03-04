"""News feeds & data aggregation from crypto sources."""

from __future__ import annotations

import httpx
import feedparser
from dataclasses import dataclass
from datetime import datetime, timezone


@dataclass
class NewsItem:
    title: str
    source: str
    url: str
    published: str
    summary: str

    @property
    def is_ai_related(self) -> bool:
        keywords = ["ai ", "artificial intelligence", "agent", "llm", "gpt", "machine learning", "autonomous"]
        text = f"{self.title} {self.summary}".lower()
        return any(k in text for k in keywords)

    @property
    def is_defi_related(self) -> bool:
        keywords = ["defi", "lending", "yield", "vault", "liquidity", "tvl", "apy", "staking"]
        text = f"{self.title} {self.summary}".lower()
        return any(k in text for k in keywords)


RSS_FEEDS = {
    "CoinDesk": "https://www.coindesk.com/arc/outboundfeeds/rss/",
    "CoinTelegraph": "https://cointelegraph.com/rss",
    "The Block": "https://www.theblock.co/rss.xml",
    "Decrypt": "https://decrypt.co/feed",
    "DeFi Pulse": "https://defipulse.com/blog/feed/",
}

DEFI_LLAMA_BASE = "https://api.llama.fi"


async def fetch_rss_feed(name: str, url: str, limit: int = 5) -> list[NewsItem]:
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.get(url)
            r.raise_for_status()
    except Exception:
        return []

    feed = feedparser.parse(r.text)
    items = []
    for entry in feed.entries[:limit]:
        pub = ""
        if hasattr(entry, "published"):
            pub = entry.published
        elif hasattr(entry, "updated"):
            pub = entry.updated

        summary = ""
        if hasattr(entry, "summary"):
            summary = entry.summary[:300]

        items.append(NewsItem(
            title=entry.get("title", ""),
            source=name,
            url=entry.get("link", ""),
            published=pub,
            summary=summary,
        ))
    return items


async def fetch_all_news(limit_per_feed: int = 5) -> list[NewsItem]:
    all_news: list[NewsItem] = []
    for name, url in RSS_FEEDS.items():
        items = await fetch_rss_feed(name, url, limit_per_feed)
        all_news.extend(items)
    return all_news


async def fetch_defi_tvl() -> dict:
    """Top DeFi protocols by TVL from DeFiLlama."""
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.get(f"{DEFI_LLAMA_BASE}/protocols")
            r.raise_for_status()
            data = r.json()

        top = []
        for p in data[:15]:
            top.append({
                "name": p.get("name", ""),
                "tvl": p.get("tvl", 0),
                "change_1d": p.get("change_1d", 0),
                "category": p.get("category", ""),
                "chain": p.get("chain", ""),
            })
        return {"protocols": top, "fetched_at": datetime.now(timezone.utc).isoformat()}
    except Exception:
        return {"protocols": [], "fetched_at": datetime.now(timezone.utc).isoformat()}


async def fetch_chain_tvls() -> list[dict]:
    """TVL per chain from DeFiLlama."""
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.get(f"{DEFI_LLAMA_BASE}/v2/chains")
            r.raise_for_status()
            data = r.json()
        return [
            {"name": c["name"], "tvl": c.get("tvl", 0)}
            for c in sorted(data, key=lambda x: x.get("tvl", 0), reverse=True)[:15]
        ]
    except Exception:
        return []


async def fetch_stablecoin_mcap() -> dict | None:
    """Total stablecoin market cap — key liquidity indicator."""
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.get(f"{DEFI_LLAMA_BASE}/stablecoins")
            r.raise_for_status()
            data = r.json()
        total = sum(
            s.get("circulating", {}).get("peggedUSD", 0)
            for s in data.get("peggedAssets", [])
        )
        return {"total_mcap": total}
    except Exception:
        return None
