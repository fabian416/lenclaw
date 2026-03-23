"""Lenclaw SDK for x402 micropayment protocol.

Provides client and server SDKs for AI agents to participate in
x402 payment flows:

- X402Client: Auto-detect 402 responses, sign payments, retry with payment
- X402Server: @x402_paywall decorator, middleware integration, revenue routing

Usage (client):
    async with X402Client(private_key="0x...") as client:
        response = await client.get("https://api.example.com/data")

Usage (server):
    @x402_paywall(amount="0.01", token="USDT")
    async def premium_endpoint():
        return {"data": "premium content"}
"""

from src.sdk.x402_client import X402Client
from src.sdk.x402_server import X402Server, x402_paywall

__all__ = [
    "X402Client",
    "X402Server",
    "x402_paywall",
]
