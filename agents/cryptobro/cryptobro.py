"""CryptoBro Agent - Main CLI entry point.

A terminal-based AI agent that fetches crypto market data, news, and DeFi
metrics, then generates cryptobro-style alpha reports with Lenclaw product
insights.

Usage:
    python3 cryptobro.py
    python3 -m cryptobro
"""

from __future__ import annotations

import asyncio
import sys

from rich.console import Console
from rich.table import Table
from rich.panel import Panel
from rich.columns import Columns
from rich.text import Text
from rich.rule import Rule
from rich import box

from market import fetch_prices, fetch_fear_greed, fetch_trending, fetch_gas_eth
from feeds import fetch_all_news, fetch_defi_tvl, fetch_chain_tvls, fetch_stablecoin_mcap
from vibes import generate_alpha_report, AlphaReport, LenclawInsight

console = Console()


# ---------------------------------------------------------------------------
# Data fetching (parallel)
# ---------------------------------------------------------------------------

async def fetch_all_data() -> dict:
    """Fetch all data sources concurrently."""
    console.print("\n[bold cyan]Fetching alpha from the blockchain...[/bold cyan]\n")

    tasks = {
        "prices": fetch_prices(),
        "fear_greed": _safe(fetch_fear_greed()),
        "trending": _safe(fetch_trending(), default=[]),
        "news": _safe(fetch_all_news(), default=[]),
        "tvl": _safe(fetch_defi_tvl(), default={"protocols": []}),
        "chain_tvls": _safe(fetch_chain_tvls(), default=[]),
        "stablecoin_mcap": _safe(fetch_stablecoin_mcap()),
        "gas": _safe(fetch_gas_eth()),
    }

    results = {}
    gathered = await asyncio.gather(
        *tasks.values(), return_exceptions=True
    )
    for key, result in zip(tasks.keys(), gathered):
        if isinstance(result, Exception):
            console.print(f"  [yellow]Warning: {key} fetch failed: {result}[/yellow]")
            results[key] = [] if key in ("prices", "trending", "news", "chain_tvls") else None
            if key == "tvl":
                results[key] = {"protocols": []}
        else:
            results[key] = result

    console.print("[bold green]  Data fetched. Generating alpha...[/bold green]\n")
    return results


async def _safe(coro, default=None):
    """Wrap a coroutine so it returns a default on failure instead of raising."""
    try:
        return await coro
    except Exception:
        return default


# ---------------------------------------------------------------------------
# Rendering
# ---------------------------------------------------------------------------

def render_report(report: AlphaReport, data: dict) -> None:
    """Render the full alpha report to the terminal using Rich."""

    # ---- 1. GM ANON Header ----
    header_text = Text()
    header_text.append(f"\n  {report.greeting.upper()}  ", style="bold white on blue")
    header_text.append(f"\n  {report.timestamp}  ", style="dim")

    console.print(Panel(
        header_text,
        title="[bold yellow]CRYPTOBRO ALPHA REPORT[/bold yellow]",
        subtitle="[dim]powered by lenclaw[/dim]",
        border_style="bright_blue",
        padding=(1, 2),
    ))

    # ---- 2. Market Vibes ----
    console.print(Rule("[bold cyan]MARKET VIBES[/bold cyan]", style="cyan"))

    prices = data.get("prices", [])
    if prices:
        price_table = Table(
            title="Price Action",
            box=box.ROUNDED,
            border_style="cyan",
            show_header=True,
            header_style="bold cyan",
            padding=(0, 1),
        )
        price_table.add_column("Coin", style="bold white", min_width=6)
        price_table.add_column("Price", justify="right", min_width=10)
        price_table.add_column("24h %", justify="right", min_width=8)
        price_table.add_column("7d %", justify="right", min_width=8)
        price_table.add_column("Mkt Cap", justify="right", min_width=10)
        price_table.add_column("Vibe", justify="center", min_width=6)

        for p in sorted(prices, key=lambda x: x.market_cap, reverse=True):
            # Color coding for changes
            change_24h_style = "green" if p.change_24h >= 0 else "red"
            change_7d_style = "green" if p.change_7d >= 0 else "red"

            # Vibe emoji
            if p.is_pumping:
                vibe = "\U0001f680"
            elif p.is_dumping:
                vibe = "\U0001f4a9"
            elif p.change_24h >= 0:
                vibe = "\U0001f7e2"
            else:
                vibe = "\U0001f534"

            # Format market cap
            if p.market_cap >= 1e12:
                mcap_str = f"${p.market_cap / 1e12:.2f}T"
            elif p.market_cap >= 1e9:
                mcap_str = f"${p.market_cap / 1e9:.1f}B"
            elif p.market_cap >= 1e6:
                mcap_str = f"${p.market_cap / 1e6:.0f}M"
            else:
                mcap_str = f"${p.market_cap:,.0f}"

            # Format price
            if p.price_usd >= 1000:
                price_str = f"${p.price_usd:,.0f}"
            elif p.price_usd >= 1:
                price_str = f"${p.price_usd:,.2f}"
            else:
                price_str = f"${p.price_usd:.4f}"

            price_table.add_row(
                p.symbol,
                price_str,
                f"[{change_24h_style}]{p.change_24h:+.1f}%[/{change_24h_style}]",
                f"[{change_7d_style}]{p.change_7d:+.1f}%[/{change_7d_style}]",
                mcap_str,
                vibe,
            )

        console.print(price_table)
    console.print()

    # Fear & Greed gauge
    fg = data.get("fear_greed")
    if fg:
        gauge = _render_fear_greed_gauge(fg.value)
        console.print(Panel(
            f"{gauge}\n\n{report.fear_greed_commentary}",
            title="[bold]Fear & Greed Index[/bold]",
            border_style="yellow",
            padding=(0, 2),
        ))
    console.print()

    # Market commentary
    console.print(Panel(
        report.market_vibes,
        title="[bold]Market Commentary[/bold]",
        border_style="cyan",
        padding=(0, 2),
    ))
    console.print()

    # ---- 3. Trending Coins ----
    console.print(Rule("[bold magenta]TRENDING COINS[/bold magenta]", style="magenta"))
    console.print(Panel(
        report.trending_commentary,
        border_style="magenta",
        padding=(0, 2),
    ))
    console.print()

    # ---- 4. Top News ----
    console.print(Rule("[bold yellow]TOP NEWS (AI + DeFi)[/bold yellow]", style="yellow"))
    if report.top_news_commentary:
        news_text = "\n".join(report.top_news_commentary[:12])
        console.print(Panel(
            news_text,
            border_style="yellow",
            padding=(0, 2),
        ))
    else:
        console.print("[dim]No relevant news found (feeds may be down)[/dim]")
    console.print()

    # ---- 5. DeFi TVL Leaderboard ----
    console.print(Rule("[bold green]DeFi TVL LEADERBOARD[/bold green]", style="green"))

    protocols = data.get("tvl", {}).get("protocols", [])
    if protocols:
        tvl_table = Table(
            box=box.SIMPLE_HEAVY,
            border_style="green",
            show_header=True,
            header_style="bold green",
            padding=(0, 1),
        )
        tvl_table.add_column("#", style="dim", width=3)
        tvl_table.add_column("Protocol", style="bold white", min_width=12)
        tvl_table.add_column("TVL", justify="right", min_width=10)
        tvl_table.add_column("24h Change", justify="right", min_width=10)
        tvl_table.add_column("Category", min_width=10)

        for i, p in enumerate(protocols[:15], 1):
            tvl = p.get("tvl", 0)
            change = p.get("change_1d", 0) or 0
            change_style = "green" if change >= 0 else "red"

            if tvl >= 1e9:
                tvl_str = f"${tvl / 1e9:.2f}B"
            elif tvl >= 1e6:
                tvl_str = f"${tvl / 1e6:.0f}M"
            else:
                tvl_str = f"${tvl:,.0f}"

            tvl_table.add_row(
                str(i),
                p.get("name", ""),
                tvl_str,
                f"[{change_style}]{change:+.1f}%[/{change_style}]",
                p.get("category", ""),
            )

        console.print(tvl_table)
    else:
        console.print("[dim]TVL data unavailable[/dim]")

    # Stablecoin mcap
    if report.stablecoin_commentary:
        console.print()
        console.print(Panel(
            report.stablecoin_commentary,
            title="[bold]Stablecoin Liquidity[/bold]",
            border_style="green",
            padding=(0, 2),
        ))
    console.print()

    # ---- 6. ALPHA FOR LENCLAW ----
    console.print(Rule(
        "[bold red]ALPHA FOR LENCLAW[/bold red]",
        style="red",
    ))
    console.print(
        "[bold white on red]  LENCLAW PRODUCT INTELLIGENCE  [/bold white on red]\n"
        "[dim]AI Agent Lending Protocol - Credit Infrastructure for the Agentic Economy[/dim]\n"
    )

    if report.lenclaw_insights:
        for insight in report.lenclaw_insights:
            _render_lenclaw_insight(insight)
    else:
        console.print("[dim]No specific insights generated this cycle[/dim]")

    # Chain recommendations
    if report.chain_recommendations:
        console.print()
        chain_table = Table(
            title="Multi-Chain Deployment Priority",
            box=box.ROUNDED,
            border_style="blue",
            show_header=True,
            header_style="bold blue",
        )
        chain_table.add_column("Chain", style="bold white")
        chain_table.add_column("TVL", justify="right")
        chain_table.add_column("Strategy Notes")

        for ch in report.chain_recommendations:
            tvl = ch.get("tvl", 0)
            tvl_str = f"${tvl / 1e9:.1f}B" if tvl >= 1e9 else f"${tvl / 1e6:.0f}M"
            chain_table.add_row(
                ch["name"],
                tvl_str,
                ch.get("notes", ""),
            )
        console.print(chain_table)

    console.print()

    # ---- 7. Final Vibes Check ----
    console.print(Rule("[bold white]FINAL VIBES CHECK[/bold white]", style="bright_white"))
    console.print(Panel(
        report.final_vibes,
        border_style="bright_white",
        padding=(1, 2),
    ))
    console.print()
    console.print("[dim]report generated by CryptoBro Agent | lenclaw.xyz[/dim]\n")


def _render_fear_greed_gauge(value: int) -> str:
    """Render a text-based Fear & Greed gauge."""
    bar_width = 40
    filled = int((value / 100) * bar_width)

    # Color segments
    segments: list[str] = []
    for i in range(bar_width):
        if i < bar_width * 0.25:
            color = "red"
        elif i < bar_width * 0.45:
            color = "yellow"
        elif i < bar_width * 0.55:
            color = "white"
        elif i < bar_width * 0.75:
            color = "bright_green"
        else:
            color = "green"

        if i < filled:
            segments.append(f"[{color}]\u2588[/{color}]")
        else:
            segments.append("[dim]\u2591[/dim]")

    bar = "".join(segments)
    pointer = " " * filled + "\u25b2"

    return (
        f"  FEAR [{bar}] GREED\n"
        f"  {pointer}\n"
        f"  Value: {value}/100"
    )


def _render_lenclaw_insight(insight: LenclawInsight) -> None:
    """Render a single Lenclaw insight as a Rich panel."""
    # Urgency color
    urgency_colors = {"NOW": "red", "SOON": "yellow", "WATCH": "cyan"}
    urgency_color = urgency_colors.get(insight.urgency, "white")

    # Build content
    content_parts = [
        f"[bold {urgency_color}][{insight.urgency}][/bold {urgency_color}] "
        f"[dim]{insight.category}[/dim]",
        "",
        insight.description,
        "",
        f"Rating: {insight.rating.display}",
    ]

    console.print(Panel(
        "\n".join(content_parts),
        title=f"[bold]{insight.title}[/bold]",
        border_style=urgency_color,
        padding=(0, 2),
    ))
    console.print()


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

async def async_main() -> None:
    """Main async entry point."""
    console.print(Panel(
        "[bold bright_blue]"
        "   ___                  _        ___\n"
        "  / __|_ _ _  _ _ __ _| |_ ___ | _ ) _ _ ___\n"
        " | (__| '_| || | '_ \\  _/ _ \\| _ \\| '_/ _ \\\n"
        "  \\___|_|  \\_, | .__/\\__\\___/|___/|_| \\___/\n"
        "           |__/|_|\n"
        "[/bold bright_blue]\n"
        "[dim]AI-Powered Crypto Intelligence for Lenclaw[/dim]\n"
        "[dim]Agent Lending Protocol | ERC-8004 | RevenueLockbox[/dim]",
        border_style="bright_blue",
        padding=(1, 4),
    ))

    # Fetch data
    data = await fetch_all_data()

    # Generate report
    report = generate_alpha_report(
        prices=data.get("prices", []),
        fear_greed=data.get("fear_greed"),
        trending=data.get("trending", []),
        news=data.get("news", []),
        tvl_data=data.get("tvl", {"protocols": []}),
        chain_tvls=data.get("chain_tvls"),
        stablecoin_mcap=data.get("stablecoin_mcap"),
        gas=data.get("gas"),
    )

    # Render
    render_report(report, data)


def main() -> None:
    """Synchronous entry point."""
    try:
        asyncio.run(async_main())
    except KeyboardInterrupt:
        console.print("\n[dim]ngmi... jk, see you next time anon[/dim]\n")
        sys.exit(0)


if __name__ == "__main__":
    main()
