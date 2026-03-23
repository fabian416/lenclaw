# Lenclaw WDK Agent

Autonomous AI agent using Tether WDK for self-custodial wallet management and revenue routing to the Lenclaw protocol.

## What it does

1. **Self-custodial wallet** -- Creates/restores a WDK-managed EVM wallet on Base. Keys never leave the agent.
2. **Revenue monitoring** -- Continuously polls for incoming USDT on the agent's wallet.
3. **Revenue routing** -- When USDT is detected, transfers it to the agent's RevenueLockbox and calls `processRevenue()` to split between debt repayment (to the AgentVault) and the agent's remainder.
4. **DeFi operations** -- Bridge USDT0 cross-chain and execute token swaps via WDK protocol modules.

## Architecture

```
Revenue Source (USDT)
        |
        v
  [Agent WDK Wallet]  <-- self-custodial, WDK seed phrase
        |
        | transfer USDT
        v
  [RevenueLockbox]  <-- immutable, per-agent
        |
        |--- repaymentRateBps% --> [AgentVault] (repays backers)
        |--- remainder%        --> [Agent wallet] (agent keeps)
```

## Prerequisites

- Node.js >= 20
- An agent registered in the Lenclaw AgentRegistry on Base
- The agent's RevenueLockbox and AgentVault deployed
- ETH on Base for gas fees
- USDT on Base for revenue

## Setup

```bash
# Install dependencies
npm install

# Install WDK agent skills (optional, for AI-powered operations)
npx skills add tetherto/wdk-agent-skills

# Copy environment template
cp .env.example .env
```

Edit `.env` with your values:

```env
# Leave empty to auto-generate a new wallet on first run
WDK_SEED_PHRASE=

# Your agent's ID in the Lenclaw AgentRegistry
AGENT_ID=1

# Contract addresses (from your Lenclaw deployment)
AGENT_REGISTRY_ADDRESS=0x...
REVENUE_LOCKBOX_ADDRESS=0x...
AGENT_VAULT_ADDRESS=0x...
AGENT_CREDIT_LINE_ADDRESS=0x...

# Base RPC (default: public endpoint)
BASE_RPC_URL=https://mainnet.base.org
```

## Running

```bash
# Development (with ts-node)
npm run dev

# Production (compile first)
npm run build
npm start
```

## First run

On first run without a seed phrase, the agent will:

1. Generate a new 24-word seed phrase
2. Print it to the console (back it up!)
3. Derive an EVM wallet address
4. Begin monitoring for USDT

You must then:
- Fund the wallet with ETH for gas
- Ensure the wallet address matches what's registered in the AgentRegistry
- Send USDT to the wallet to test revenue routing

## Revenue flow

The agent runs a polling loop (default: every 30 seconds):

1. Check USDT balance on the agent's WDK wallet
2. If balance >= threshold (default: 1 USDT), transfer all USDT to the RevenueLockbox
3. Check if the lockbox has pending USDT
4. Call `processRevenue()` on the lockbox, which splits:
   - `repaymentRateBps` percent to the AgentVault (debt repayment)
   - Remainder back to the agent wallet

## DeFi operations

The agent can execute DeFi operations programmatically:

```typescript
import { DeFiOperations } from './defi';

const defi = new DeFiOperations(wallet);
await defi.initBridge();

// Bridge USDT0 from Base to Arbitrum
const result = await defi.bridgeUSDT0('base', 'arbitrum', 1000000n);

// Execute a token swap
const swapResult = await defi.executeSwap(
  routerAddress,
  tokenIn,
  tokenOut,
  amountIn,
  minAmountOut,
  swapCalldata,
);
```

## Monitoring

The agent logs structured output with timestamps and module names:

```
[2026-03-22T10:00:00.000Z] [INFO ] [main] Agent wallet address: 0x...
[2026-03-22T10:00:30.000Z] [INFO ] [revenue] Revenue detected in agent wallet, transferring to lockbox
[2026-03-22T10:00:45.000Z] [INFO ] [revenue] processRevenue() confirmed
```

Set `LOG_LEVEL=debug` in `.env` for verbose output.

## Contract addresses

These contracts are deployed per-agent by the Lenclaw protocol:

| Contract | Purpose |
|----------|---------|
| AgentRegistry | ERC-721 identity + metadata for agents |
| AgentVault | ERC-4626 vault where backers deposit USDT |
| RevenueLockbox | Immutable revenue splitter (repayment vs agent) |
| AgentCreditLine | Credit facility for borrowing from the vault |
| AgentSmartWallet | Optional revenue-routing smart wallet |

## Lenclaw contract interfaces

The agent reads from these contracts:
- `RevenueLockbox.processRevenue()` -- split and route pending USDT
- `RevenueLockbox.totalRevenueCapture()` -- lifetime revenue captured
- `RevenueLockbox.repaymentRateBps()` -- current repayment split
- `AgentRegistry.getAgent(agentId)` -- agent profile (wallet, lockbox, vault)
- `AgentVault.totalBorrowed()` -- outstanding debt
- `AgentCreditLine.getOutstanding(agentId)` -- total debt including interest
