# Lenclaw Architecture

## 1. System Overview

Lenclaw uses a **vault-per-agent** model. Each AI agent gets its own ERC-4626 vault + RevenueLockbox pair, deployed atomically by a factory. Backers choose which agents to back by depositing USDC into the agent's specific vault. Risk is fully isolated — a default in one vault does not affect others.

```
  Backer A --> [AgentVault: AutoTrader-v3]  --> AgentCreditLine --> Agent
  Backer B --> [AgentVault: ContentGen-AI]  --> AgentCreditLine --> Agent
  Backer C --> [AgentVault: YieldBot-Alpha] --> AgentCreditLine --> Agent
                                                                     |
                                                             RevenueLockbox --> repay to AGENT'S vault
```

---

## 2. Contract Architecture

```
                          +-------------------+
                          |  AgentVaultFactory |       +---------------------+
                          |  (Singleton)       |       | SmartWalletFactory  |
                          +--------+----------+       | (opt-in tier)       |
                                   |                   +--------+-----------+
                    createVault(agentId)                         |
                                   |                  createWallet(agentId)
                  +----------------+----------------+           |
                  |                                 |           v
                  v                                 v   +------------------+
        +------------------+              +------------------+  AgentSmartWallet |
        |   AgentVault     |              |  RevenueLockbox  |  (auto-routes    |
        |   (ERC-4626)     |              |  (per agent)     |   revenue)       |
        |   per agent      |<----repay----|                  |<--revenue--+-----+
        +--------+---------+              +------------------+
                 |
          borrow / lend
                 |
        +--------+---------+       +------------------+
        | AgentCreditLine   |       |   CreditScorer   |
        | (draws from       |<------|  (6 weighted     |
        |  agent's vault)   |       |   factors)       |
        +--------+----------+       +------------------+
                 |
        +--------+---------+
        | AgentRegistry     |
        | (ERC-721 + vault  |
        |  address stored)  |
        +-------------------+

  Liquidation flow (scoped to individual vault):
  AgentCreditLine --DEFAULT--> LiquidationKeeper --> RecoveryManager --> DutchAuction
        |                                                    |
  (auto-freeze vault)                              proceeds --> AgentVault
                                                   unfreeze --> AgentVault
```

### Security features per contract:
- **AgentVault**: ReentrancyGuard, Pausable, frozen state, withdrawal timelock, MIN_DEPOSIT (100 USDC), deposit cap, ERC-4626 compliant (maxDeposit/maxMint/maxWithdraw/maxRedeem), share transfer resets timelock
- **AgentCreditLine**: Lazy status check on drawdown, auto-freeze on DEFAULT, MIN_DRAWDOWN (10 USDC), period upper bounds
- **RevenueLockbox**: ReentrancyGuard, MIN_REPAYMENT_RATE enforcement, routes through CreditLine when debt exists
- **DutchAuction**: minPrice validation, linear price decay

---

## 3. Contract Reference

All contracts are in `contracts/src/`. Interfaces in `contracts/src/interfaces/`.

| Contract | Description |
|----------|-------------|
| `AgentVault.sol` | ERC-4626 vault per agent. Backers deposit USDC, receive `lcA{id}USDC` shares. Includes: deposit caps, withdrawal timelock (1 day default), frozen state, pausable, MIN_DEPOSIT (100 USDC), ERC-4626 compliant overrides. `totalAssets() = balance + totalBorrowed - accumulatedFees` |
| `AgentVaultFactory.sol` | Deploys AgentVault + RevenueLockbox atomically per agent. Manages credit line wiring, protocol fees, treasury routing, vault freezing, loss write-downs |
| `AgentRegistry.sol` | ERC-721 identity (ERC-8004). Stores: wallet, codeHash, metadata, reputation (0-1000, starts at 500), codeVerified, lockbox, vault, registeredAt, externalToken, agentCategory. Auto-deploys vault+lockbox on registration |
| `RevenueLockbox.sol` | Immutable per agent. Captures USDC revenue, splits between repayment and agent wallet. Routes through AgentCreditLine when debt exists to keep both accounting systems in sync. MIN_REPAYMENT_RATE = 10% |
| `AgentCreditLine.sol` | Per-agent credit facility. Status: ACTIVE→DELINQUENT→DEFAULT. Lazy status check on drawdown. Auto-freezes vault on DEFAULT. MIN_DRAWDOWN = 10 USDC. Grace 7d, delinquency 14d, default 30d (all bounded) |
| `CreditScorer.sol` | Weighted scoring: 35% revenue, 10% time-in-protocol, 15% velocity, 15% reputation, 10% code verified, 15% smart wallet. Credit lines: 100–100K USDC. Rates: 3–25% APR (inversely proportional to score) |
| `AgentSmartWallet.sol` | Opt-in smart wallet. Auto-routes USDC to lockbox before any `execute()` call. Gives 15% credit score boost |
| `SmartWalletFactory.sol` | Deploys smart wallets per agent. Manages allowed targets and default repayment rates |
| `DutchAuction.sol` | Dutch auction for defaulted positions. Price decays linearly from 150% to 30% of debt over 6 hours |
| `RecoveryManager.sol` | Coordinates post-default recovery. Distributes auction proceeds to agent's vault, writes down unrecoverable losses, always unfreezes vault after finalization |
| `LiquidationKeeper.sol` | Monitors defaults, triggers liquidation via RecoveryManager. Pays keeper bounty (1%, max 1000 USDC) |

---

## 4. Data Flow

### 4.1 Agent Registration + Vault Creation

```
1. Agent calls AgentRegistry.registerAgent(wallet, codeHash, metadata)
   --> mints ERC-721 to agent wallet
   --> returns agentId

2. Factory.createVault(agentId, agentWallet) is called (by registry or protocol)
   --> deploys new AgentVault(usdc, agentId, agentWallet, factory)
   --> deploys new RevenueLockbox(agentWallet, agentVaultAddr, agentId, usdc, 5000)
   --> calls registry.setVault(agentId, agentVaultAddr)
   --> calls registry.setLockbox(agentId, lockboxAddr)
   --> emits VaultCreated(agentId, vault, lockbox, wallet)
```

### 4.2 Backing (Lender Deposits)

```
1. Lender browses agent marketplace, picks an agent
2. Lender approves USDC spend to the AgentVault address
3. Lender calls AgentVault.deposit(usdcAmount, lenderAddress)
   --> ERC-4626 mints vault shares to lender
   --> USDC transferred into vault
4. Vault's availableLiquidity() increases
```

### 4.3 Agent Drawdown

```
1. Agent calls AgentCreditLine.drawdown(agentId, amount)
2. CreditLine looks up profile.vault from registry
3. CreditLine calls AgentVault.borrow(agentWallet, amount)
4. AgentVault transfers USDC to agent
5. totalBorrowed increases, availableLiquidity decreases
```

### 4.4 Revenue + Repayment

```
1. Agent earns revenue --> USDC sent to agent's RevenueLockbox
2. Anyone calls RevenueLockbox.processRevenue()
3. Lockbox splits: repaymentRateBps% to AgentVault, rest to agent wallet
4. AgentVault receives USDC --> totalBorrowed decreases
5. ERC-4626 share value increases (yield for backers)
```

### 4.5 Default + Liquidation

```
1. Agent misses payments > 30 days
2. Keeper calls LiquidationKeeper.triggerLiquidation(agentId)
3. RecoveryManager.startRecovery(agentId, debtAmount)
4. DutchAuction created for the position
5. Bidder purchases at current price
6. Proceeds sent to RecoveryManager --> forwarded to agent's AgentVault
7. Loss absorbed only by that vault's depositors (share value drops)
```

---

## 5. Frontend

Source: `frontend/src/lib/types.ts` (types), `frontend/src/lib/constants.ts` (constants), `frontend/src/lib/utils.ts` (mock data).

Key types: `Agent`, `AgentVault`, `BackingPosition`, `ActivityEvent`, `LeaderboardEntry`, `ArenaStats`, `PortfolioSummary`.

Risk levels: `low | medium | high | degen`. Agent statuses: `active | delinquent | default`.

### Routes

| Route | Name | Description |
|-------|------|-------------|
| `/` | The Arena | Hero, live ticker, trending agents, global stats |
| `/agents` | The Paddock | Agent marketplace with filters and sort |
| `/agents/:agentId` | Agent Detail | Full stats, revenue chart, back CTA |
| `/portfolio` | My Stable | Backed positions, yield tracking, alerts |
| `/leaderboard` | The Rankings | Top agents, hall of shame, movers |
| `/feed` | The Wire | Real-time activity timeline |
| `/agents/onboard` | Agent Onboarding | Multi-step registration wizard |
| `/borrow` | Borrow | Agent operator drawdown/repay |

### Design System

- **Primary**: `#ea580c` (light), `#e97a2e` (dark on `#0a0a0a`)
- **Risk colors**: low=green, medium=amber, high=orange, degen=red
- **Status colors**: active=green, delinquent=amber, default=red
- **Stack**: React 18, TypeScript, Vite, Tailwind CSS 4, Wagmi + Viem, TanStack Query, React Router, Framer Motion, Radix UI

---

## 6. Key Architectural Decisions

1. **No shared pool**: Each `AgentVault` is isolated. Default in one vault does not affect others.
2. **Factory pattern**: `AgentVaultFactory` deploys vault + lockbox atomically. Ensures consistent setup.
3. **ERC-4626 per vault**: Standard interface means wallets/aggregators can integrate natively.
4. **CreditLine reads vault from registry**: No hardcoded vault address. Looks up `profile.vault` per agent.
5. **Immutable RevenueLockbox**: Deployed once per agent. Cannot be modified. Trust anchor of the protocol.
6. **Liquidation scoped**: RecoveryManager looks up agent's vault when distributing proceeds.
7. **APY is per-agent**: Calculated as `(annualized revenue * repayment rate) / totalBacked`. Varies per agent.
8. **Risk isolation**: If YieldBot-Alpha defaults, only its 8 backers lose. StableYield-Pro's 58 backers are unaffected.
9. **Smart wallet opt-in**: Agents can deploy an AgentSmartWallet for 15% credit score boost. Revenue auto-routes to lockbox before any execute() call.
