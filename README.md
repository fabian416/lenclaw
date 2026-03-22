# Lenclaw

**Credit infrastructure for the agentic economy. Powered by [Tether WDK](https://wdk.tether.io/).**

Built for the [Tether Hackathon Galactica: WDK Edition 1](https://dorahacks.io/hackathon/hackathon-galactica-wdk-2026-01).

Built for the **Lending Bot** track — autonomous agents that issue loans, assess risk, and manage debt without human intervention. Lending agent built on the **OpenClaw** framework for autonomous credit assessment and loan management.

---

## Hackathon Track: Lending Bot

### Must Have (3/3)

| Requirement | Lenclaw delivers |
|-------------|-----------------|
| Agent makes lending decisions autonomously | CreditScorer — 5 on-chain factors, no human input. OpenClaw agent framework drives autonomous credit assessment and loan lifecycle |
| All transactions settle on-chain using USD₮ | Deployed on Base mainnet with USDT (see contracts table below) |
| Agent autonomously tracks and collects repayments | RevenueLockbox auto-deducts repayments + WDK revenue monitor agent polls and routes funds every 30 s |

### Nice to Have (5/7)

| Requirement | Lenclaw delivers |
|-------------|-----------------|
| DIDs / on-chain history for credit scores | ERC-8004 agent identity + fully on-chain behavioral scoring (5 factors) |
| Minimal / no collateral | Zero-collateral, revenue-backed lending — the immutable lockbox replaces collateral |
| ML models predict default | XGBoost scoring model in backend (`ml_scoring.py`) |
| ZK proofs verify credit privately | Noir circuits + HonkVerifier on-chain (revenue threshold, reputation, composite proof) |
| Agents use revenue to service debt | Immutable RevenueLockbox auto-deducts before agent receives any funds |

### Bonus

- **OpenClaw agent framework** — autonomous lending decisions, credit assessment, and loan management without human intervention
- **Agent-to-agent lending** — vault-per-agent architecture enables isolated, composable credit lines between agents

Lenclaw is a DeFi lending protocol that enables autonomous AI agents to borrow USDT against their verifiable revenue streams -- with zero collateral. Each agent gets its own isolated ERC-4626 vault. An immutable RevenueLockbox auto-deducts repayments before revenue reaches the agent. No human intervention. No legal enforcement. Pure smart contract guarantees.

The entire user and agent experience runs through **Tether WDK** -- no MetaMask, no browser extensions, no external wallets. WDK is the sole wallet infrastructure: self-custodial key management, transaction signing, balance queries, cross-chain bridging, and agent autonomy all flow through the WDK stack.

## Deployed Contracts (Base Mainnet)

All contracts are live on Base mainnet.

| Contract | Address | Explorer |
|----------|---------|----------|
| AgentRegistry | `0x9B2A14A423067BAdd5a64979E59dED6C7A5681Ea` | [BaseScan](https://basescan.org/address/0x9B2A14A423067BAdd5a64979E59dED6C7A5681Ea) |
| AgentVaultFactory | `0x92927C356fe500AC7F38A5B41CC3A4A2445D02f0` | [BaseScan](https://basescan.org/address/0x92927C356fe500AC7F38A5B41CC3A4A2445D02f0) |
| CreditScorer | `0xeB2189bC09f65085B8cb8d50275326B3433b7B5d` | [BaseScan](https://basescan.org/address/0xeB2189bC09f65085B8cb8d50275326B3433b7B5d) |
| AgentCreditLine | `0xdbb95d8aF780D73e441e922f3b9642a5C116629c` | [BaseScan](https://basescan.org/address/0xdbb95d8aF780D73e441e922f3b9642a5C116629c) |
| DutchAuction | `0xc774B8bD35E1892CFf39dC2488626f21539fC453` | [BaseScan](https://basescan.org/address/0xc774B8bD35E1892CFf39dC2488626f21539fC453) |
| RecoveryManager | `0xD82C771F720374A49852b6883a263E3ECEfE4bA2` | [BaseScan](https://basescan.org/address/0xD82C771F720374A49852b6883a263E3ECEfE4bA2) |
| LiquidationKeeper | `0x6cc149Edf16c34EE25fD9D232Bc97e0895Bb6d78` | [BaseScan](https://basescan.org/address/0x6cc149Edf16c34EE25fD9D232Bc97e0895Bb6d78) |

## Why Lenclaw Exists

AI agents are becoming independent economic actors -- running MEV strategies, solving intents, executing keeper jobs, managing yield. They generate verifiable on-chain revenue but **cannot access credit**. Banks won't lend to a smart contract. DeFi pools don't assess non-human borrowers.

Lenclaw solves this by replacing legal enforcement with **architectural guarantees**:
- An **immutable RevenueLockbox** captures all agent revenue and auto-splits repayments before the agent can touch funds
- A **5-factor on-chain CreditScorer** evaluates creditworthiness using only observable blockchain data
- **Zero-knowledge proofs** (Noir circuits, Honk verifier) let agents prove creditworthiness without exposing private data
- **TEE attestation** verifies agents are running their registered code

The result: under-collateralized lending for non-human borrowers, enforced entirely by code.

## How It Works

```
  Agent earns revenue --> RevenueLockbox (immutable) --> auto-split
                                |                            |
                          repayment to vault          remainder to agent
                                |
                          AgentVault (ERC-4626)
                                |
                     backers earn yield from repayments
```

1. **Agent registers** via AgentRegistry (ERC-721 / ERC-8004 identity). A personal AgentVault + RevenueLockbox + WDK SmartWallet are deployed atomically
2. **Backers deposit** USDT into a specific agent's vault. They receive agent-specific shares -- not pooled exposure
3. **Credit line** is calculated autonomously by CreditScorer (5 on-chain factors, no human input)
4. **Agent borrows** from its own vault. Repayments are auto-deducted by the lockbox
5. **Default path**: Vault freezes -> Dutch auction -> RecoveryManager distributes proceeds to backers

## Tether WDK Integration

Lenclaw is built entirely on [Tether's Wallet Development Kit (WDK)](https://docs.wdk.tether.io/) -- the self-custodial, multi-chain wallet framework for the agentic economy. WDK is the **only** wallet infrastructure in Lenclaw. There is no MetaMask fallback, no injected providers, no external wallet connectors. Every wallet operation -- from key generation to transaction signing to balance queries -- runs through WDK.

### WDK Service (`wdk-service/`)

A FastAPI Python server that acts as the WDK relay layer:

- **Wallet operations** -- creates and manages WDK wallets for agents and users
- **Agent registration relay** -- bridges off-chain agent onboarding to on-chain AgentRegistry calls
- **Transaction signing** -- coordinates WDK-based signing for vault deposits, borrows, and repayments
- **Balance and state queries** -- exposes USDT and ETH balances via WDK primitives

### Autonomous WDK Agent (`agents/wdk-agent/`)

The core **autonomous revenue tracking and repayment collection** agent — a long-running TypeScript process that uses WDK for self-custodial wallet management. This is the "Lending Bot" in action: it monitors revenue, routes repayments, and manages debt without any human intervention.

- **Creates wallets programmatically** -- BIP39 seed phrase generation via `@tetherto/wdk`, keys never leave the agent
- **Monitors revenue autonomously** -- Polls for incoming USDT every 30 seconds with exponential backoff, tracking all revenue streams
- **Routes revenue to RevenueLockbox** -- Transfers USDT and calls `processRevenue()` to auto-deduct repayments before the agent touches funds
- **Collects repayments autonomously** -- RevenueLockbox splits are enforced on every revenue event; the agent never needs to manually repay
- **Executes DeFi operations** -- Cross-chain USDT0 bridging via `@tetherto/wdk-protocol-bridge-usdt0-evm`, token swaps
- **Gas-aware** -- Estimates gas before every transaction, skips if gas price exceeds threshold

### WDK Smart Wallet (ERC-4337)

`WDKSmartWallet.sol` -- An ERC-4337 account abstraction wallet that:
- Implements `validateUserOp` for EntryPoint-submitted operations
- **Guarantees revenue routing** -- calls `_routePendingRevenue()` before every `execute()` and `executeBatch()`
- Supports dual signature validation (raw ERC-4337 + eth_signMessage for EOA wallets)
- Deployed deterministically via CREATE2 through `WDKWalletFactory.sol`

### WDK Frontend Integration

The frontend uses Tether WDK exclusively -- no MetaMask, no WalletConnect, no external providers:
- `WDKProvider` context with auto-restore from stored seed
- `WDKWalletButton` -- create/restore WDK wallet, view USDT/ETH balances
- Agent onboarding deploys via WDK with credit boost for WDK-native agents

### USDT0 Cross-Chain Bridge

`USDT0Bridge.sol` enables agents to bridge revenue from other chains to their lockbox on Base:
- Bridge USDT0 cross-chain via LayerZero OFT protocol
- Route bridged revenue directly to agent's RevenueLockbox
- Fee estimation with availability status
- Per-agent bridge statistics tracking

## Architecture

```
lenclaw/
├── contracts/          # Solidity contracts (Foundry) -- 306 tests passing
├── frontend/           # React 18 + Vite + Tailwind + Wagmi + Tether WDK
├── backend/            # Python FastAPI + SQLAlchemy + web3.py + SIWE auth
├── wdk-service/        # FastAPI Python server -- WDK wallet ops + agent registration relay
├── agents/wdk-agent/   # Autonomous WDK-powered revenue routing agent
├── zk/                 # Noir ZK circuits (nargo 1.0) + HonkVerifier.sol (barretenberg)
├── tee/                # TEE attestation service (SGX/Nitro verification)
├── bridge/             # Payment processor oracle (Stripe, Square, MercadoPago)
└── docker/             # Docker Compose + Caddy reverse proxy
```

## Smart Contracts

### Core Protocol

| Contract | Description |
|----------|-------------|
| `AgentVault` | ERC-4626 vault per agent. Deposit caps, withdrawal timelock, frozen on default |
| `AgentVaultFactory` | Deploys AgentVault + RevenueLockbox + SmartWallet atomically per agent |
| `AgentRegistry` | ERC-721 agent identity (ERC-8004). Stores wallet, codeHash, reputation (0-1000), WDK flag |
| `RevenueLockbox` | **Immutable** per-agent revenue capture. Auto-splits repayment vs agent remainder |
| `AgentCreditLine` | Per-agent borrow/repay. Status: ACTIVE -> DELINQUENT -> DEFAULT |
| `CreditScorer` | 5-factor on-chain scoring: revenue (30%), consistency (25%), history (20%), time (15%), debt ratio (10%) |

### WDK + Bridge

| Contract | Description |
|----------|-------------|
| `WDKSmartWallet` | ERC-4337 smart wallet with revenue-routing guarantee before every execute |
| `WDKWalletFactory` | CREATE2 deterministic deployment of WDK wallets per agent |
| `AgentSmartWallet` | Standard revenue-routing wallet (non-ERC-4337 fallback) |
| `USDT0Bridge` | Cross-chain USDT0 bridge via LayerZero. Revenue from any chain -> lockbox on Base |

### Liquidation

| Contract | Description |
|----------|-------------|
| `DutchAuction` | Price decays 150% -> 30% of debt over 6 hours |
| `RecoveryManager` | Distributes auction proceeds to vault, writes down losses |
| `LiquidationKeeper` | Automated default monitoring with keeper bounty (1%, max 1K USDT) |

### Governance

| Contract | Description |
|----------|-------------|
| `LenclawToken` | Governance token |
| `LenclawGovernor` | OpenZeppelin Governor |
| `LenclawTimelock` | Execution timelock |

## Zero-Knowledge Credit Proofs

ZK circuits are written in Noir, compiled with nargo 1.0. The on-chain verifier (`HonkVerifier.sol`) was generated by barretenberg.

| Circuit | Proves |
|---------|--------|
| `revenue_threshold` | Revenue >= threshold (outputs privacy-safe tier 0-4) |
| `code_integrity` | Code matches registered hash (Poseidon hash over BN254) |
| `reputation_minimum` | Reputation >= minimum (outputs band 0-3) |
| `composite_credit_proof` | Combined: revenue + code + reputation in one proof |

On-chain verification via `ZKCreditVerifier.sol` (Honk).

## TEE Attestation

Agents prove they're running registered code via SGX DCAP / AWS Nitro attestation:

1. Agent starts in TEE -> generates attestation quote
2. Quote submitted to attestation service -> verified
3. Result stored on-chain via `TEEAttestationVerifier.sol`
4. `AgentRegistry.codeVerified` set to `true`
5. Periodic re-attestation via cron scheduler

## Credit Scoring

Fully autonomous, on-chain behavioral scoring -- no human intervention:

| Factor | Weight | Source |
|--------|--------|--------|
| Revenue level | 30% | RevenueLockbox.totalRevenueCapture |
| Revenue consistency | 25% | Epoch-based tracking (30-day windows) |
| Credit history | 20% | Completed loan cycles from AgentCreditLine |
| Time in protocol | 15% | AgentRegistry.registeredAt |
| Debt-to-revenue ratio | 10% | Outstanding debt vs revenue flow |

**Output**: Credit line 100-100K USDT at 3-25% APR (inversely proportional to composite score).

## Getting Started

### Prerequisites

- Node.js 20+ / Python 3.12+ / Foundry / PostgreSQL / Redis / Docker

### Quick Start (Docker)

```bash
cp .env.example .env          # fill in JWT_SECRET, RPC URL
make dev                       # starts all services with hot reload
```

### Manual Setup

```bash
# Contracts
cd contracts && forge install && forge build && forge test

# Backend
cd backend && pip install -e ".[dev]" && alembic upgrade head && uvicorn src.main:app --reload

# WDK Service
cd wdk-service && pip install -e ".[dev]" && uvicorn src.main:app --reload

# Frontend
cd frontend && npm install && npm run dev

# WDK Agent
cd agents/wdk-agent && npm install && cp .env.example .env && npm run dev
```

### Deploy Contracts

```bash
cd contracts
forge script script/Deploy.s.sol --rpc-url $RPC_URL --private-key $PRIVATE_KEY --broadcast
```

## Test Suite

**306 tests passing** across 13 test suites:

```bash
cd contracts && forge test    # 306 tests, 0 failures
cd frontend && npx tsc --noEmit  # type check
cd backend && pytest          # backend tests
```

| Suite | Tests | Coverage |
|-------|-------|----------|
| AgentVault | 8 | Deposits, withdrawals, timelock, freeze |
| AgentVaultFactory | 13 | Atomic deployment, multi-vault |
| AgentRegistry | 27 | Registration, identity, WDK flag |
| RevenueLockbox | 21 | Revenue split, epoch tracking, credit sync |
| AgentCreditLine | 14 | Drawdown, repay, status transitions |
| CreditScorer | 18 | 5-factor scoring, boundary conditions |
| AgentSmartWallet | 19 | Revenue routing, target whitelist |
| WDKSmartWallet | 31 | ERC-4337 validateUserOp, batch execute, nonce |
| USDT0Bridge | 54 | Bridge out/in, fee estimation, rescue |
| Liquidation | 14 | Default -> auction -> recovery flow |
| Integration | 21 | End-to-end workflows |
| Governance | 8 | Token, governor, timelock |
| Fuzz | 18 | Property-based testing (256+ iterations) |

## Tech Stack

| Layer | Stack |
|-------|-------|
| Contracts | Solidity 0.8.24+, Foundry, OpenZeppelin |
| Frontend | React 18, TypeScript, Vite, Tailwind CSS 4, Wagmi, Viem, Tether WDK |
| Backend | Python 3.12, FastAPI, SQLAlchemy, Alembic, web3.py, SIWE |
| WDK Service | Python 3.12, FastAPI, WDK relay, agent registration |
| Agent | Node.js 20, TypeScript, Tether WDK, Viem |
| ZK | Noir (nargo 1.0), barretenberg (Honk prover/verifier) |
| TEE | TypeScript, Express, SGX/Nitro |
| Database | PostgreSQL 15, Redis 7 |
| Infra | Docker, Caddy, GitHub Actions |

## Key Innovation

**The immutable RevenueLockbox** is the trust anchor. Agent code can change. Agent operators can update strategies. But the lockbox -- deployed once, forever immutable -- always enforces repayment before the agent receives funds. This architectural guarantee replaces legal enforcement with smart contract certainty, making under-collateralized lending possible for non-human borrowers.

Combined with WDK's self-custodial wallets as the **sole wallet infrastructure**, agents become truly autonomous economic actors: they hold their own keys, earn revenue, borrow capital, and repay debt -- all without human intervention, all through Tether WDK.

## Building on Lenclaw

Lenclaw is designed as infrastructure others can extend:

- **New agent types**: Any autonomous system with verifiable revenue can register
- **New scoring models**: CreditScorer weights are governance-adjustable
- **New vault strategies**: ERC-4626 standard means composability with DeFi aggregators
- **New chains**: USDT0Bridge pattern extends to any LayerZero-supported chain
- **New collateral types**: Architecture supports USDT, USA-T, XAU-T, or any ERC-20

The vault-per-agent + immutable lockbox pattern is a **new primitive for agentic finance** -- applicable beyond lending to insurance, reputation markets, and agent-to-agent commerce.

## License

MIT
