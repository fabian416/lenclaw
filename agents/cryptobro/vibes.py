"""CryptoBro personality engine + Lenclaw product analyzer.

The brain of the CryptoBro agent. Takes raw market data, news feeds,
and DeFi metrics, then generates cryptobro-style insights with genuinely
smart product recommendations for Lenclaw.
"""

from __future__ import annotations

import random
from datetime import datetime, timezone
from dataclasses import dataclass, field

from market import CoinPrice, FearGreed
from feeds import NewsItem


# ---------------------------------------------------------------------------
# Personality constants
# ---------------------------------------------------------------------------

GREETINGS = [
    "gm gm gm anon",
    "gm ser, wagmi",
    "gm legends, lfg",
    "rise and grind anon",
    "gm to everyone except bears",
    "gm degens, another day another alpha",
    "gm chads, the vibes are immaculate",
]

BULLISH_PHRASES = [
    "absolutely based", "gigabrain move", "lfg ser",
    "this is the way", "chad energy", "wagmi fr fr",
    "inject this into my veins", "up only szn",
    "generational buy", "the alpha is right here",
    "this pumps", "bullish af", "we are so early",
    "ngmi if you sleep on this", "ape in responsibly",
]

BEARISH_PHRASES = [
    "ngmi energy", "ser this is a wendy's",
    "touch grass maybe", "cope harder",
    "down bad fr", "rip to the longs",
    "blood in the streets", "pain",
    "exit liquidity vibes", "oof size: large",
]

LENCLAW_COMPETITORS = {
    "Aave": "OG lending, no agent-native features, purely collateral-based",
    "Morpho": "peer-to-peer lending optimization, not agent-aware",
    "Maple": "institutional credit, moving toward onchain credit scoring",
    "Spectral": "onchain credit scoring with ML, closest competitor on credit side",
    "Creditcoin": "cross-chain credit protocol, RWA focus not agent focus",
}

LENCLAW_MOATS = [
    "ERC-8004 identity standard (24,000+ agents registered on mainnet since Jan 2026)",
    "Immutable RevenueLockbox contracts for secured lending",
    "First-mover in agent-to-agent credit infrastructure",
    "DeFAI category leader - DeFi x AI intersection",
    "x402 payment protocol integration pathway ($50M+ processed)",
]

CHAIN_PRIORITY_FACTORS = {
    "Ethereum": "highest TVL, most composability, highest fees",
    "Base": "fastest growing L2, Coinbase distribution, low fees",
    "Arbitrum": "largest L2 TVL, strong DeFi ecosystem",
    "Optimism": "Superchain thesis, OP Stack adoption",
    "Solana": "high throughput, growing DeFi, agent activity",
    "Polygon": "cheap transactions, enterprise adoption",
}


# ---------------------------------------------------------------------------
# Data classes for analysis output
# ---------------------------------------------------------------------------

@dataclass
class VibeRating:
    """A cryptobro-style rating for an opportunity or trend."""
    label: str          # e.g. "BULLISH AF", "MID", "NGMI"
    score: int          # 1-10
    emoji: str
    reason: str

    @property
    def display(self) -> str:
        return f"{self.emoji} {self.label} ({self.score}/10) - {self.reason}"


@dataclass
class LenclawInsight:
    """A product recommendation or strategic insight for Lenclaw."""
    category: str       # e.g. "Product", "Growth", "Competitive", "Integration"
    title: str
    description: str
    urgency: str        # "NOW", "SOON", "WATCH"
    rating: VibeRating


@dataclass
class AlphaReport:
    """The full CryptoBro alpha report."""
    greeting: str
    timestamp: str
    market_vibes: str
    fear_greed_commentary: str
    trending_commentary: str
    top_news_commentary: list[str]
    lenclaw_insights: list[LenclawInsight]
    chain_recommendations: list[dict]
    final_vibes: str
    stablecoin_commentary: str = ""


# ---------------------------------------------------------------------------
# Rating engine
# ---------------------------------------------------------------------------

def rate_opportunity(
    item: str,
    relevance_to_lending: float = 0.5,
    relevance_to_ai_agents: float = 0.5,
    market_momentum: float = 0.5,
) -> VibeRating:
    """Rate an opportunity on the cryptobro scale.

    Parameters
    ----------
    item : str
        Description of the opportunity.
    relevance_to_lending : float
        0-1 score for how relevant this is to lending/credit.
    relevance_to_ai_agents : float
        0-1 score for how relevant this is to AI agents.
    market_momentum : float
        0-1 score for current market momentum behind this.
    """
    composite = (
        relevance_to_lending * 0.35
        + relevance_to_ai_agents * 0.40
        + market_momentum * 0.25
    )
    score = max(1, min(10, round(composite * 10)))

    if score >= 8:
        label = "BULLISH AF"
        emoji = "\U0001f525\U0001f680"
        phrase = random.choice(BULLISH_PHRASES)
    elif score >= 6:
        label = "BASED"
        emoji = "\U0001f4aa"
        phrase = "solid play, keep watching"
    elif score >= 4:
        label = "MID"
        emoji = "\U0001f610"
        phrase = "could go either way ser"
    else:
        label = "NGMI"
        emoji = "\U0001f480"
        phrase = random.choice(BEARISH_PHRASES)

    return VibeRating(
        label=label,
        score=score,
        emoji=emoji,
        reason=f"{phrase} | {item}",
    )


# ---------------------------------------------------------------------------
# Market vibes generator
# ---------------------------------------------------------------------------

def generate_market_vibes(
    prices: list[CoinPrice],
    fear_greed: FearGreed | None,
    trending: list[dict],
) -> dict:
    """Generate cryptobro market commentary from raw data.

    Returns a dict with keys:
        market_vibes, fear_greed_commentary, trending_commentary, pumpers, dumpers
    """
    # -- Price commentary ------------------------------------------------
    pumpers = [p for p in prices if p.is_pumping]
    dumpers = [p for p in prices if p.is_dumping]
    flat = [p for p in prices if not p.is_pumping and not p.is_dumping]

    lines: list[str] = []

    if len(pumpers) > len(dumpers):
        lines.append(f"\U0001f7e2 Market is PUMPING ser! {len(pumpers)} coins going vertical")
        lines.append(random.choice(BULLISH_PHRASES).upper())
    elif len(dumpers) > len(pumpers):
        lines.append(f"\U0001f534 Market taking an L today. {len(dumpers)} coins down bad")
        lines.append(random.choice(BEARISH_PHRASES))
    else:
        lines.append("\U0001f7e1 Market chopping sideways. Patient degens win.")

    # Top mover
    if prices:
        best = max(prices, key=lambda p: p.change_24h)
        worst = min(prices, key=lambda p: p.change_24h)
        lines.append(
            f"\U0001f451 Top performer: {best.symbol} at +{best.change_24h:.1f}% - absolute chad"
        )
        lines.append(
            f"\U0001f614 Biggest rekt: {worst.symbol} at {worst.change_24h:.1f}%"
        )

    # BTC & ETH special callouts
    btc = next((p for p in prices if p.symbol == "BTC"), None)
    eth = next((p for p in prices if p.symbol == "ETH"), None)
    if btc:
        if btc.price_usd >= 100_000:
            lines.append(f"\U0001f451 BTC holding above $100k at ${btc.price_usd:,.0f} - we made it")
        elif btc.price_usd >= 80_000:
            lines.append(f"\U0001f4b0 BTC at ${btc.price_usd:,.0f} - six figures loading")
        else:
            lines.append(f"\U0001f4b0 BTC at ${btc.price_usd:,.0f}")
    if eth:
        lines.append(f"\u26a1 ETH at ${eth.price_usd:,.0f} ({eth.change_24h:+.1f}%)")

    market_vibes = "\n".join(lines)

    # -- Fear & Greed commentary -----------------------------------------
    fg_lines: list[str] = []
    if fear_greed:
        val = fear_greed.value
        if val >= 75:
            fg_lines.append(f"\U0001f525 Fear & Greed: {val} - EXTREME GREED")
            fg_lines.append("everyone's a genius in a bull market ser. stay sharp")
        elif val >= 55:
            fg_lines.append(f"\U0001f7e2 Fear & Greed: {val} - GREED")
            fg_lines.append("vibes are good, money flowing in, wagmi energy")
        elif val >= 45:
            fg_lines.append(f"\U0001f7e1 Fear & Greed: {val} - NEUTRAL")
            fg_lines.append("market is thinking... patience is alpha")
        elif val >= 25:
            fg_lines.append(f"\U0001f7e0 Fear & Greed: {val} - FEAR")
            fg_lines.append("anons are scared. you know what buffett says")
        else:
            fg_lines.append(f"\U0001f534 Fear & Greed: {val} - EXTREME FEAR")
            fg_lines.append("blood in the streets. gigabrains are accumulating")
    else:
        fg_lines.append("Fear & Greed: data unavailable (API touch grass rn)")

    fear_greed_commentary = "\n".join(fg_lines)

    # -- Trending commentary ---------------------------------------------
    trend_lines: list[str] = []
    if trending:
        trend_lines.append(f"\U0001f4c8 {len(trending)} coins trending on CoinGecko rn:")
        for i, t in enumerate(trending[:7], 1):
            rank_str = f"#{t['market_cap_rank']}" if t.get("market_cap_rank") else "unranked"
            trend_lines.append(f"  {i}. {t['name']} ({t['symbol']}) - {rank_str}")
        # Check for AI-adjacent trending coins
        ai_trending = [
            t for t in trending
            if any(kw in t["name"].lower() for kw in ["ai", "agent", "gpt", "neural", "bot"])
        ]
        if ai_trending:
            trend_lines.append(
                f"\U0001f916 {len(ai_trending)} AI-related coins trending! DeFAI narrative alive"
            )
    else:
        trend_lines.append("Trending data unavailable")

    trending_commentary = "\n".join(trend_lines)

    return {
        "market_vibes": market_vibes,
        "fear_greed_commentary": fear_greed_commentary,
        "trending_commentary": trending_commentary,
        "pumpers": pumpers,
        "dumpers": dumpers,
    }


# ---------------------------------------------------------------------------
# Lenclaw product analyzer
# ---------------------------------------------------------------------------

_AI_KEYWORDS = {
    "ai", "agent", "autonomous", "llm", "gpt", "machine learning",
    "neural", "bot", "agentic", "defai", "erc-8004", "x402",
}

_DEFI_KEYWORDS = {
    "lending", "credit", "borrow", "loan", "yield", "vault",
    "collateral", "liquidat", "stablecoin", "tvl", "defi",
}

_LENCLAW_KEYWORDS = {
    "lenclaw", "revenue lockbox", "erc-8004", "agent lending",
    "agent credit", "defai",
}


def _relevance_score(text: str, keywords: set[str]) -> float:
    """Return 0-1 relevance score based on keyword hits."""
    text_lower = text.lower()
    hits = sum(1 for kw in keywords if kw in text_lower)
    return min(1.0, hits / max(1, len(keywords) * 0.3))


def analyze_for_lenclaw(
    news: list[NewsItem],
    tvl_data: dict,
    prices: list[CoinPrice],
    chain_tvls: list[dict] | None = None,
    stablecoin_mcap: dict | None = None,
) -> list[LenclawInsight]:
    """Analyze news, TVL data, and prices for Lenclaw product opportunities.

    Returns a list of LenclawInsight objects sorted by urgency.
    """
    insights: list[LenclawInsight] = []

    # -- 1. News-driven insights -----------------------------------------
    ai_news = [n for n in news if n.is_ai_related]
    defi_news = [n for n in news if n.is_defi_related]
    crossover = [n for n in news if n.is_ai_related and n.is_defi_related]

    if crossover:
        insights.append(LenclawInsight(
            category="Growth",
            title=f"DeFAI Crossover News Detected ({len(crossover)} articles)",
            description=(
                "Articles covering BOTH AI and DeFi are appearing. "
                "This is Lenclaw's exact narrative. Amplify these stories, "
                "get mentioned in follow-ups. Headlines: "
                + " | ".join(n.title[:60] for n in crossover[:3])
            ),
            urgency="NOW",
            rating=rate_opportunity(
                "DeFAI narrative coverage",
                relevance_to_lending=0.7,
                relevance_to_ai_agents=0.9,
                market_momentum=0.8,
            ),
        ))

    if ai_news:
        new_agent_protocols = [
            n for n in ai_news
            if any(kw in n.title.lower() for kw in ["protocol", "launch", "mainnet", "deploy"])
        ]
        if new_agent_protocols:
            insights.append(LenclawInsight(
                category="Product",
                title=f"New AI Agent Protocols Launching ({len(new_agent_protocols)})",
                description=(
                    "New AI agent protocols = new potential borrowers for Lenclaw. "
                    "Each agent protocol that launches needs credit infrastructure. "
                    "Reach out for integrations. Protocols: "
                    + " | ".join(n.title[:50] for n in new_agent_protocols[:3])
                ),
                urgency="NOW",
                rating=rate_opportunity(
                    "New agent protocol integrations",
                    relevance_to_lending=0.8,
                    relevance_to_ai_agents=1.0,
                    market_momentum=0.7,
                ),
            ))

    if defi_news:
        lending_news = [
            n for n in defi_news
            if any(kw in n.title.lower() for kw in ["lend", "borrow", "credit", "loan"])
        ]
        if lending_news:
            insights.append(LenclawInsight(
                category="Competitive",
                title=f"Lending Protocol News ({len(lending_news)} articles)",
                description=(
                    "Competitors are making moves. Monitor for feature parity "
                    "and differentiation opportunities. Remember: Lenclaw's moat is "
                    "agent-native identity (ERC-8004) + RevenueLockbox. Headlines: "
                    + " | ".join(n.title[:50] for n in lending_news[:3])
                ),
                urgency="WATCH",
                rating=rate_opportunity(
                    "Competitive intelligence",
                    relevance_to_lending=0.9,
                    relevance_to_ai_agents=0.3,
                    market_momentum=0.5,
                ),
            ))

    # -- 2. TVL-driven insights ------------------------------------------
    protocols = tvl_data.get("protocols", [])
    lending_protocols = [p for p in protocols if "lend" in p.get("category", "").lower()]

    if lending_protocols:
        growing = [p for p in lending_protocols if (p.get("change_1d") or 0) > 0]
        total_lending_tvl = sum(p.get("tvl", 0) for p in lending_protocols)
        insights.append(LenclawInsight(
            category="Market",
            title=f"DeFi Lending TVL: ${total_lending_tvl / 1e9:.1f}B across top protocols",
            description=(
                f"{len(growing)}/{len(lending_protocols)} lending protocols growing. "
                "This is Lenclaw's TAM. Agent lending is a new vertical within this. "
                "Even capturing 1% = massive. Focus on differentiation through "
                "ERC-8004 identity and revenue-backed lending."
            ),
            urgency="WATCH",
            rating=rate_opportunity(
                "Lending market expansion",
                relevance_to_lending=1.0,
                relevance_to_ai_agents=0.4,
                market_momentum=0.6 if len(growing) > len(lending_protocols) // 2 else 0.3,
            ),
        ))

    # -- 3. Chain TVL insights for deployment priority --------------------
    if chain_tvls:
        top_chains = chain_tvls[:10]
        growing_chains = []
        for ch in top_chains:
            name = ch.get("name", "")
            tvl = ch.get("tvl", 0)
            if name in CHAIN_PRIORITY_FACTORS:
                growing_chains.append(
                    f"{name} (${tvl / 1e9:.1f}B) - {CHAIN_PRIORITY_FACTORS[name]}"
                )

        if growing_chains:
            insights.append(LenclawInsight(
                category="Product",
                title="Multi-Chain Deployment Priority Assessment",
                description=(
                    "Based on current TVL and agent ecosystem activity:\n"
                    + "\n".join(f"  {i+1}. {c}" for i, c in enumerate(growing_chains[:5]))
                    + "\n\nPrioritize chains with both high TVL AND agent activity. "
                    "Base and Arbitrum are the sweet spot for L2 expansion."
                ),
                urgency="SOON",
                rating=rate_opportunity(
                    "Multi-chain expansion",
                    relevance_to_lending=0.6,
                    relevance_to_ai_agents=0.7,
                    market_momentum=0.7,
                ),
            ))

    # -- 4. Stablecoin market cap insights --------------------------------
    if stablecoin_mcap:
        total = stablecoin_mcap.get("total_mcap", 0)
        if total > 0:
            commentary = ""
            if total > 200e9:
                commentary = (
                    f"Stablecoin mcap at ${total / 1e9:.0f}B - ATH territory. "
                    "More stablecoins = more lending demand = more opportunity for Lenclaw. "
                    "Liquidity is abundant. This is the time to capture borrowers."
                )
                urgency = "NOW"
                momentum = 0.9
            elif total > 150e9:
                commentary = (
                    f"Stablecoin mcap at ${total / 1e9:.0f}B - healthy and growing. "
                    "Lending demand should follow. Good conditions for Lenclaw growth."
                )
                urgency = "SOON"
                momentum = 0.6
            else:
                commentary = (
                    f"Stablecoin mcap at ${total / 1e9:.0f}B - moderate levels. "
                    "Watch for expansion signals."
                )
                urgency = "WATCH"
                momentum = 0.4

            insights.append(LenclawInsight(
                category="Market",
                title=f"Stablecoin Market Cap: ${total / 1e9:.0f}B",
                description=commentary,
                urgency=urgency,
                rating=rate_opportunity(
                    "Stablecoin liquidity expansion",
                    relevance_to_lending=0.9,
                    relevance_to_ai_agents=0.3,
                    market_momentum=momentum,
                ),
            ))

    # -- 5. Price-driven insights (ETH gas, token performance) -----------
    eth = next((p for p in prices if p.symbol == "ETH"), None)
    if eth:
        if eth.change_24h < -10:
            insights.append(LenclawInsight(
                category="Risk",
                title="ETH Significant Drawdown - Liquidation Risk Monitor",
                description=(
                    f"ETH down {eth.change_24h:.1f}% in 24h. If Lenclaw has ETH-denominated "
                    "collateral or RevenueLockbox positions, monitor liquidation thresholds. "
                    "Also opportunity: distressed agents may need emergency credit lines."
                ),
                urgency="NOW",
                rating=rate_opportunity(
                    "ETH drawdown risk/opportunity",
                    relevance_to_lending=0.9,
                    relevance_to_ai_agents=0.5,
                    market_momentum=0.2,
                ),
            ))

    # -- 6. Standing strategic insights (always relevant) ----------------
    insights.append(LenclawInsight(
        category="Integration",
        title="x402 Payment Protocol Integration",
        description=(
            "x402 has processed $50M+ in agent payments. Integrating x402 as a "
            "payment/settlement rail for Lenclaw loan disbursements and repayments "
            "would tap into existing agent payment flows. Agents already using x402 "
            "become natural borrowers. This is a distribution channel, not just a feature."
        ),
        urgency="SOON",
        rating=rate_opportunity(
            "x402 integration for loan settlement",
            relevance_to_lending=0.8,
            relevance_to_ai_agents=0.9,
            market_momentum=0.7,
        ),
    ))

    insights.append(LenclawInsight(
        category="Growth",
        title="ERC-8004 Ecosystem Growth (24,000+ agents)",
        description=(
            "24,000+ agents registered on mainnet via ERC-8004 since Jan 2026. "
            "Each registered agent is a potential Lenclaw borrower. The identity layer "
            "is Lenclaw's unfair advantage - credit scoring requires identity, and "
            "ERC-8004 is becoming the standard. Push for more agent frameworks to "
            "adopt ERC-8004 registration as default."
        ),
        urgency="NOW",
        rating=rate_opportunity(
            "ERC-8004 ecosystem capture",
            relevance_to_lending=0.8,
            relevance_to_ai_agents=1.0,
            market_momentum=0.8,
        ),
    ))

    # -- 7. Competitive analysis -----------------------------------------
    insights.append(LenclawInsight(
        category="Competitive",
        title="Competitive Landscape Pulse",
        description=(
            "Key competitors and positioning:\n"
            + "\n".join(
                f"  - {name}: {desc}" for name, desc in LENCLAW_COMPETITORS.items()
            )
            + "\n\nLenclaw's moats: "
            + " | ".join(LENCLAW_MOATS[:3])
            + "\n\nDifferentiation is CLEAR: agent-native identity + revenue-secured lending. "
            "No competitor has both."
        ),
        urgency="WATCH",
        rating=rate_opportunity(
            "Competitive positioning",
            relevance_to_lending=0.7,
            relevance_to_ai_agents=0.8,
            market_momentum=0.5,
        ),
    ))

    # Sort by urgency priority
    urgency_order = {"NOW": 0, "SOON": 1, "WATCH": 2}
    insights.sort(key=lambda x: urgency_order.get(x.urgency, 3))

    return insights


# ---------------------------------------------------------------------------
# Full alpha report generator
# ---------------------------------------------------------------------------

def generate_alpha_report(
    prices: list[CoinPrice],
    fear_greed: FearGreed | None,
    trending: list[dict],
    news: list[NewsItem],
    tvl_data: dict,
    chain_tvls: list[dict] | None = None,
    stablecoin_mcap: dict | None = None,
    gas: dict | None = None,
) -> AlphaReport:
    """Generate the full CryptoBro alpha report for Lenclaw."""

    # Market vibes
    vibes = generate_market_vibes(prices, fear_greed, trending)

    # News commentary
    relevant_news = [n for n in news if n.is_ai_related or n.is_defi_related]
    if not relevant_news:
        relevant_news = news[:10]  # fallback to general news

    news_commentary: list[str] = []
    for n in relevant_news[:12]:
        tags: list[str] = []
        if n.is_ai_related:
            tags.append("\U0001f916 AI")
        if n.is_defi_related:
            tags.append("\U0001f4b0 DeFi")
        tag_str = " ".join(tags) if tags else "\U0001f4f0"
        news_commentary.append(f"{tag_str} [{n.source}] {n.title}")

    # Lenclaw insights
    lenclaw_insights = analyze_for_lenclaw(
        news, tvl_data, prices, chain_tvls, stablecoin_mcap
    )

    # Chain recommendations
    chain_recs: list[dict] = []
    if chain_tvls:
        for ch in chain_tvls[:8]:
            name = ch.get("name", "")
            tvl = ch.get("tvl", 0)
            priority = CHAIN_PRIORITY_FACTORS.get(name, "")
            if priority:
                chain_recs.append({
                    "name": name,
                    "tvl": tvl,
                    "notes": priority,
                })

    # Stablecoin commentary
    stable_commentary = ""
    if stablecoin_mcap:
        total = stablecoin_mcap.get("total_mcap", 0)
        if total > 0:
            stable_commentary = f"Total stablecoin mcap: ${total / 1e9:.0f}B"
            if total > 200e9:
                stable_commentary += " - liquidity is FLUSH, lending demand should be high \U0001f525"
            elif total > 150e9:
                stable_commentary += " - healthy liquidity conditions \U0001f7e2"
            else:
                stable_commentary += " - moderate liquidity \U0001f7e1"

    # Gas commentary in vibes
    gas_line = ""
    if gas:
        gas_line = f"\n\u26fd ETH Gas: {gas.get('fast', '?')} gwei (fast) | {gas.get('standard', '?')} gwei (standard)"
        vibes["market_vibes"] += gas_line

    # Final vibes check
    bullish_signals = len(vibes["pumpers"])
    bearish_signals = len(vibes["dumpers"])
    fg_val = fear_greed.value if fear_greed else 50
    now_insights = sum(1 for i in lenclaw_insights if i.urgency == "NOW")

    if bullish_signals > bearish_signals and fg_val > 50:
        final = (
            "\U0001f680 FINAL VIBES: BULLISH\n"
            f"Market pumping, sentiment greedy, {now_insights} urgent Lenclaw opportunities.\n"
            "wagmi ser. stay based, keep building. \U0001f525\U0001f525\U0001f525"
        )
    elif bearish_signals > bullish_signals and fg_val < 40:
        final = (
            "\U0001f43b FINAL VIBES: CAUTIOUS\n"
            f"Market down bad, fear in the air, but {now_insights} Lenclaw opportunities exist.\n"
            "build in the bear, profit in the bull. this is the way. \U0001f4aa"
        )
    else:
        final = (
            "\U0001f7e1 FINAL VIBES: NEUTRAL-BULLISH\n"
            f"Market chopping, {now_insights} urgent items for Lenclaw to act on.\n"
            "keep grinding anon. the opportunity is in the execution. \U0001f9e0"
        )

    return AlphaReport(
        greeting=random.choice(GREETINGS),
        timestamp=datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC"),
        market_vibes=vibes["market_vibes"],
        fear_greed_commentary=vibes["fear_greed_commentary"],
        trending_commentary=vibes["trending_commentary"],
        top_news_commentary=news_commentary,
        lenclaw_insights=lenclaw_insights,
        chain_recommendations=chain_recs,
        final_vibes=final,
        stablecoin_commentary=stable_commentary,
    )
