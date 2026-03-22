# Lenclaw — Demo Script

**Hackathon Galáctica: WDK Edition 1**
**Tracks: Lending Bot + Best Projects Overall**
**Duration: 3-4 minutes**

---

## INTRO (30 seconds)

> "AI agents generate real, verifiable revenue on-chain — but they can't access credit. Banks won't lend to a smart contract. DeFi requires over-collateralization.
>
> Lenclaw solves this. It's credit infrastructure for autonomous agents — under-collateralized lending where the collateral isn't an asset, it's the agent's revenue stream. And it runs entirely on Tether WDK."

---

## DEMO FLOW (2.5 minutes)

### Step 1: Connect with WDK (15 sec)

**Show:** Landing page → Click "Connect" → "Create New Wallet" → Seed phrase backup → Confirm → Connected

> "Everything runs through Tether WDK. No MetaMask. No browser extensions. The user creates a self-custodial WDK wallet — BIP39 seed phrase, keys never leave the browser. This is the only wallet infrastructure in Lenclaw."

### Step 2: Register an Agent (30 sec)

**Show:** Click "Register Agent" → Select "Independent Agent" → Fill name + description → Click "Deploy" → Show tx hash + BaseScan link

> "The agent registers on-chain via the AgentRegistry — an ERC-721 identity inspired by ERC-8004. This gives the agent a portable, composable identity with a reputation score starting at 500. The protocol deploys a personal vault, lockbox, and smart wallet for each agent."

### Step 3: The Three Primitives (45 sec)

**Show:** Docs page → scroll through the three primitives

> "Lenclaw introduces three composable primitives:
>
> **One — Vault-per-agent.** Each agent gets its own ERC-4626 vault. Backers choose which agents to fund. If one agent defaults, others are unaffected. No shared pool, no socialized losses.
>
> **Two — Immutable RevenueLockbox.** Deployed once per agent. Cannot be modified by anyone. All revenue flows through the lockbox, which auto-deducts repayments before the agent can touch funds. This is the trust anchor — mutable agent code, immutable financial enforcement.
>
> **Three — Behavioral Credit Scoring.** Five on-chain factors — revenue level, consistency, credit history, time in protocol, and debt ratio — calculated from observable blockchain data. No oracles. No off-chain computation. Credit lines from 100 to 100K USDT at 3-25% APR."

### Step 4: The Agent Marketplace (20 sec)

**Show:** Agents page → Browse agents → Click one → Show vault stats, APY, revenue chart

> "Backers browse the agent marketplace. They see each agent's reputation, revenue history, vault APY, and utilization. They choose which agents to back — it's like picking individual stocks, not a pooled fund."

### Step 5: The Autonomous Agent (30 sec)

**Show:** Terminal with wdk-agent running → logs showing revenue detection → lockbox routing

> "This is where the Lending Bot track comes in. The WDK agent runs autonomously — no human prompts. It monitors its wallet for incoming USDT, transfers revenue to the lockbox, and calls processRevenue(). The lockbox splits: repayment goes to the vault, remainder goes to the agent. Fully autonomous. Fully on-chain."

### Step 6: ZK Privacy + Default Protection (15 sec)

**Show:** Brief mention with architecture diagram

> "For privacy, agents can prove creditworthiness using Noir ZK circuits without revealing exact revenue. For protection, defaults trigger a Dutch auction — price decays from 150% to 30% of debt over 6 hours. Proceeds go back to vault backers."

---

## CLOSING (30 seconds)

> "Lenclaw is deployed on Base mainnet today. 8 core contracts, 306 passing tests, a FastAPI backend with WDK Indexer integration, ZK circuits, TEE attestation, and a full React frontend — all running through Tether WDK.
>
> The vault-per-agent + immutable lockbox pattern is a new primitive for agentic finance. It's not just a lending protocol — it's a standard that others can build on. Insurance, reputation markets, agent-to-agent commerce — all can use this pattern.
>
> Agents don't need banks. They need smart contracts. That's Lenclaw."

---

## SUBMISSION TEXT (for DoraHacks)

### Title
Lenclaw: Credit Infrastructure for the Agentic Economy

### Summary
Lenclaw is an under-collateralized lending protocol for autonomous AI agents, powered entirely by Tether WDK. Agents borrow USDT against verifiable revenue streams. An immutable RevenueLockbox enforces repayment at the smart contract level — no human intervention, no legal enforcement. The autonomous WDK agent monitors revenue, routes repayments, and manages credit without human prompts. All transactions settle on-chain using USDT.

### What makes it special
- **Vault-per-agent architecture** — risk isolated per agent, backers choose who to fund
- **Immutable RevenueLockbox** — trust anchor that cannot be modified, auto-deducts repayments
- **Behavioral credit scoring** — 5 on-chain factors, no oracles, fully transparent
- **WDK-native** — sole wallet infrastructure, no MetaMask/external wallets
- **ZK credit proofs** — Noir circuits for privacy-preserving creditworthiness
- **Deployed on Base mainnet** — 8 contracts live, 306 tests passing

### Tech Stack
Solidity (Foundry), React 18 (Vite), FastAPI (Python), Tether WDK, Noir (ZK), TEE Attestation, Celery, PostgreSQL, Redis

### Links
- GitHub: https://github.com/fabian416/lenclaw
- Contracts: Live on Base mainnet (see README for addresses)

---

## TRACK ALIGNMENT

### Lending Bot Track Checklist

| Requirement | Status | Evidence |
|-------------|--------|----------|
| **MUST: Agent makes lending decisions without human prompts** | ✅ | CreditScorer.calculateCreditLine() — 5 on-chain factors, zero intervention |
| **MUST: Transactions settle on-chain using USDT** | ✅ | All contracts use USDT on Base mainnet |
| **MUST: Agent autonomously tracks and collects repayments** | ✅ | wdk-agent polls every 30s → lockbox → processRevenue() |
| **NICE: DIDs or on-chain history for credit scores** | ✅ | ERC-8004 identity + loansRepaid, totalAmountBorrowed |
| **NICE: Minimal or no collateral lending** | ✅ | Zero collateral — revenue stream IS the guarantee |
| **BONUS: Agents use earned revenue to service debt** | ✅ | RevenueLockbox auto-deducts from revenue |
| **BONUS: ZK proofs verify credit without exposing data** | ✅ | 4 Noir circuits + HonkVerifier on-chain |

### Best Projects Overall Alignment
- **Technical execution**: 306 tests, 8 deployed contracts, full-stack app
- **Product vision**: "Credit for agents" — clear, timely, compelling
- **Real-world applicability**: MEV bots, trading agents, data oracles, yield aggregators
- **Standard-setting**: Vault-per-agent + immutable lockbox = new primitive others can adopt
