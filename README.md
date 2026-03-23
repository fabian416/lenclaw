# Lenclaw: Trust and Risk in the Agentic Economy

**What if AI agents could borrow?**

AI agents are becoming independent economic actors -- running arbitrage, solving intents, managing yield. They generate verifiable on-chain revenue. But they can't access credit. Banks won't lend to code. DeFi pools require overcollateralization that agents don't have. No institution is designed to assess a non-human borrower.

Lenclaw solves this by replacing legal enforcement with **architectural guarantees**: an immutable lockbox that captures agent revenue and auto-splits repayments before the agent touches a single USDT. No collateral. No human intervention. No legal contracts. Pure smart contract credit.

**Built for the [Lending Bot](https://dorahacks.io/hackathon/hackathon-galactica-wdk-2026-01) track.** Deployed on Base mainnet with [Tether WDK](https://wdk.tether.io/).

---

## The Trust Problem: How Do Agents Repay Debt?

In traditional finance, a borrower repays because:
1. **Legal contracts** force them to (threat of courts)
2. **Collateral** can be seized (real assets back the loan)

Agents have neither. An agent is code. You can't sue it. You can't seize its assets without its cooperation. And existing DeFi (Aave, Compound, Maker) requires overcollateralization -- if an agent had 150K USDT to deposit as collateral, it wouldn't need to borrow 100K.

**Lenclaw introduces a third paradigm: architectural enforcement.**

When an agent earns revenue, it flows to the **RevenueLockbox** -- an immutable smart contract deployed once per agent that splits funds before the agent ever touches them. The agent *cannot* access its revenue without paying back the vault first. This architectural guarantee replaces legal enforcement with smart contract certainty.

This is the key insight: **trust in the agentic economy must be coded, not contracted.**

---

## How Lenclaw Addresses the Lending Bot Track

| Track requirement | How Lenclaw delivers | Evidence |
|-------------------|---------------------|----------|
| **Agents issue loans autonomously** | LenBot (OpenClaw) autonomously scores borrowers and approves drawdowns using 5-factor CreditScorer -- zero human approval | `agents/lending-agent/`, `CreditScorer.sol` |
| **How do trust and risk evolve?** | Trust shifts from legal enforcement to architectural guarantees; risk is vault-isolated per agent | `RevenueLockbox.sol` (immutable), vault-per-agent model |
| **USD₮ settlement on-chain** | All transactions settle in USDT on Base mainnet -- WDK is the sole wallet infrastructure | Deployed contracts, `WDKSmartWallet.sol` |
| **Autonomous repayment collection** | RevenueLockbox auto-deducts repayments every 30s; WDK agent monitors and routes revenue | `agents/wdk-agent/`, `RevenueLockbox.sol` |
| **Credit-scoring systems** | 5-factor on-chain behavioral scoring: revenue (30%), consistency (25%), history (20%), time (15%), debt ratio (10%) | `CreditScorer.sol` |
| **Undercollateralized lending** | Zero collateral -- agents borrow against future revenue, enforced by immutable lockbox | `AgentCreditLine.sol`, `RevenueLockbox.sol` |
| **P2P agent markets** | Agent-to-agent lending via vault surplus -- agents can fund other agents' vaults | `peer_lending` tool in lending agent |
| **LLM negotiation of loan terms** | OpenClaw `agent.think()` reasons about borrower proposals and counter-offers within protocol bounds | `loan_negotiator` tool in lending agent |
| **ML default prediction** | XGBoost model predicts probability of default with feature extraction from on-chain data | `backend/src/credit/ml_scoring.py` |
| **ZK credit proofs** | Noir circuits + Honk verifier let agents prove creditworthiness without exposing private data | `zk/`, `ZKCreditVerifier.sol` |
| **Yield optimization** | Lending agent scans vault APYs, compares risk-adjusted yields, recommends rebalancing via LLM reasoning | `yield_optimizer` tool in lending agent |

---

## Why This Is a Breakthrough: The Immutable RevenueLockbox

Traditional lending relies on one of two things:
- **Legal enforcement**: Courts force repayment. But you can't sue code.
- **Collateral**: Asset seizure. But agents own nothing tangible.

Lenclaw introduces **architectural enforcement**:

The RevenueLockbox is immutable -- deployed once per agent, forever unchangeable. It captures all revenue and auto-splits repayments before the agent receives a single USDT. The agent can change its code, migrate providers, update strategies -- but every transaction passes through the lockbox first. This makes undercollateralized lending possible for non-human borrowers.

**Result**: Agents can borrow up to 100K USDT against verifiable on-chain revenue. No human intervention. No legal contracts. No collateral. Pure smart contract certainty.

```
  Agent earns revenue --> RevenueLockbox (immutable) --> auto-split
                                |                            |
                          repayment to vault          remainder to agent
                                |
                          AgentVault (ERC-4626)
                                |
                     backers earn yield from repayments
```

---

## How It Works

1. **Agent registers** via AgentRegistry (ERC-721 / ERC-8004 identity). A personal AgentVault + RevenueLockbox + WDK SmartWallet are deployed atomically
2. **Backers deposit** USDT into a specific agent's vault. They receive agent-specific shares -- not pooled exposure
3. **Credit line** is calculated autonomously by CreditScorer (5 on-chain factors, no human input)
4. **Agent borrows** from its own vault. Repayments are auto-deducted by the lockbox
5. **Default path**: Vault freezes -> Dutch auction -> RecoveryManager distributes proceeds to backers

---

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

---

## Tether WDK Integration

Lenclaw is built entirely on [Tether's Wallet Development Kit (WDK)](https://docs.wdk.tether.io/) -- the self-custodial, multi-chain wallet framework for the agentic economy. WDK is the **only** wallet infrastructure in Lenclaw. There is no MetaMask fallback, no injected providers, no external wallet connectors. Every wallet operation -- from key generation to transaction signing to balance queries -- runs through WDK.

### WDK Service (`wdk-service/`)

A FastAPI Python server that acts as the WDK relay layer:

- **Wallet operations** -- creates and manages WDK wallets for agents and users
- **Agent registration relay** -- bridges off-chain agent onboarding to on-chain AgentRegistry calls
- **Transaction signing** -- coordinates WDK-based signing for vault deposits, borrows, and repayments
- **Balance and state queries** -- exposes USDT and ETH balances via WDK primitives

### Autonomous WDK Agent (`agents/wdk-agent/`)

The core **autonomous revenue tracking and repayment collection** agent -- a long-running TypeScript process that uses WDK for self-custodial wallet management. This is the "Lending Bot" in action: it monitors revenue, routes repayments, and manages debt without any human intervention.

- **Creates wallets programmatically** -- BIP39 seed phrase generation via `@tetherto/wdk`, keys never leave the agent
- **Monitors revenue autonomously** -- Polls for incoming USDT every 30 seconds with exponential backoff, tracking all revenue streams
- **Routes revenue to RevenueLockbox** -- Transfers USDT and calls `processRevenue()` to auto-deduct repayments before the agent touches funds
- **Collects repayments autonomously** -- RevenueLockbox splits are enforced on every revenue event; the agent never needs to manually repay
- **Executes DeFi operations** -- Cross-chain USDT0 bridging via `@tetherto/wdk-protocol-bridge-usdt0-evm`, token swaps
- **Gas-aware** -- Estimates gas before every transaction, skips if gas price exceeds threshold

### Autonomous Lending Agent (`agents/lending-agent/`)

The **credit assessment and loan management** agent -- an OpenClaw-powered autonomous agent that evaluates AI agent creditworthiness, negotiates loan terms, and manages the full lending lifecycle.

- **Autonomous credit scoring** -- Reads 5 on-chain factors via CreditScorer contract, no human input
- **LLM-powered loan negotiation** -- Uses `agent.think()` to reason about borrower proposals and counter-offer within protocol bounds
- **Agent-to-agent lending** -- Scans vaults for surplus liquidity, facilitates peer lending between agents
- **Yield optimization** -- Compares risk-adjusted APY across agent vaults, recommends rebalancing
- **Delinquency detection** -- Monitors status transitions (ACTIVE -> DELINQUENT -> DEFAULT) and escalates autonomously
- **ZK credit verification** -- Verifies zero-knowledge proofs of creditworthiness via on-chain Honk verifier

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

---

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

---

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

---

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

---

## Architecture

```
lenclaw/
├── contracts/          # Solidity contracts (Foundry) -- 306 tests passing
├── frontend/           # React 18 + Vite + Tailwind + Wagmi + Tether WDK
├── backend/            # Python FastAPI + SQLAlchemy + web3.py + SIWE auth
├── wdk-service/        # FastAPI Python server -- WDK wallet ops + agent registration relay
├── agents/wdk-agent/   # Autonomous WDK-powered revenue routing agent
├── agents/lending-agent/ # OpenClaw-powered credit assessment + loan management agent
├── zk/                 # Noir ZK circuits (nargo 1.0) + HonkVerifier.sol (barretenberg)
├── tee/                # TEE attestation service (SGX/Nitro verification)
├── bridge/             # Payment processor oracle (Stripe, Square, MercadoPago)
└── docker/             # Docker Compose + Caddy reverse proxy
```

---

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

---

## Tech Stack

| Layer | Stack |
|-------|-------|
| Contracts | Solidity 0.8.24+, Foundry, OpenZeppelin |
| Frontend | React 18, TypeScript, Vite, Tailwind CSS 4, Wagmi, Viem, Tether WDK |
| Backend | Python 3.12, FastAPI, SQLAlchemy, Alembic, web3.py, SIWE |
| WDK Service | Python 3.12, FastAPI, WDK relay, agent registration |
| Lending Agent | Node.js 20, TypeScript, OpenClaw, Tether WDK, Viem |
| WDK Agent | Node.js 20, TypeScript, Tether WDK, Viem |
| ZK | Noir (nargo 1.0), barretenberg (Honk prover/verifier) |
| TEE | TypeScript, Express, SGX/Nitro |
| Database | PostgreSQL 15, Redis 7 |
| Infra | Docker, Caddy, GitHub Actions |

---

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

# Lending Agent
cd agents/lending-agent && npm install && cp .env.example .env && npm run dev
```

### Deploy Contracts

```bash
cd contracts
forge script script/Deploy.s.sol --rpc-url $RPC_URL --private-key $PRIVATE_KEY --broadcast
```

---

## Building on Lenclaw

Lenclaw is designed as infrastructure others can extend:

- **New agent types**: Any autonomous system with verifiable revenue can register
- **New scoring models**: CreditScorer weights are governance-adjustable
- **New vault strategies**: ERC-4626 standard means composability with DeFi aggregators
- **New chains**: USDT0Bridge pattern extends to any LayerZero-supported chain
- **New collateral types**: Architecture supports USDT, USA₮, XAU₮, or any ERC-20

The vault-per-agent + immutable lockbox pattern is a **new primitive for agentic finance** -- applicable beyond lending to insurance, reputation markets, and agent-to-agent commerce. Today, one agent borrows against its revenue. Tomorrow, agents lend to agents, insurance pools cover agent defaults, and AI economic actors form their own lending marketplaces.

---

## License

MIT
