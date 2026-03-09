# Lenclaw Product Specification

## Product Vision

Lenclaw is **credit infrastructure for the agentic economy**. As AI agents increasingly operate autonomously onchain -- running MEV strategies, solving intents, executing keeper jobs -- they generate verifiable revenue but lack access to credit. Lenclaw uses a **vault-per-agent model**: each agent gets its own ERC-4626 vault, so risk is isolated per agent and backers choose exactly which agents to fund. An immutable RevenueLockbox per agent captures income and auto-deducts repayments before forwarding the remainder to the agent. The agent's code may change, but the lockbox cannot be circumvented. This architectural guarantee replaces legal enforcement with smart contract certainty, creating the first credible lending market for non-human borrowers.

---

## User Personas

### 1. Backer (Liquidity Provider)

**Who:** DeFi yield seekers, institutional allocators, treasury managers.

**Goal:** Earn yield by choosing specific agents to back with USDC.

**Key needs:**
- Browse and evaluate individual agents: revenue history, credit score, vault APY
- Deposit into an agent-specific ERC-4626 vault, receiving agent-specific shares
- Risk isolation: losses from one agent do not affect other vaults
- Confidence that repayments are enforced at the smart contract level

### 2. Agent Operator

**Who:** Developers or teams running autonomous onchain agents (MEV bots, trading bots, solvers, keepers).

**Goal:** Borrow capital to amplify their agent's earning potential.

**Key needs:**
- Register agent identity via ERC-8004
- Build onchain reputation through consistent revenue generation
- Access credit lines proportional to verified revenue history
- Transparent repayment terms with no hidden mechanisms
- Retain control of post-repayment revenue

---

## Core User Flows

### Flow 1: Backer Deposits Into an Agent Vault

1. Connect wallet (MetaMask, WalletConnect, etc.)
2. Browse agent marketplace: view agents by revenue, credit score, vault APY
3. Pick an agent to back, view its vault details (TVL, utilization, APY)
4. Approve and deposit USDC into that agent's AgentVault
5. Receive agent-specific shares (lcA{id}USDC, ERC-4626 vault shares)
6. Monitor position: accrued yield, share value, vault health
7. Withdraw: redeem shares for USDC from that agent's vault

### Flow 2: Agent Operator Registers Agent

1. Connect wallet (agent operator's EOA)
2. Navigate to Agent Onboarding
3. Submit agent details: name, description, wallet address
4. Submit code hash + TEE attestation for verification
5. AgentVaultFactory auto-deploys an AgentVault + immutable RevenueLockbox for the agent
6. Agent receives ERC-8004 identity token (ERC-721)
7. Agent starts routing revenue through the lockbox to build history

### Flow 3: Agent Borrows Against Revenue

1. Agent operator views credit dashboard
2. Protocol calculates credit line using 6 weighted factors: revenue history (35%), time active (10%), revenue velocity (15%), reputation score (15%), code verified (10%), smart wallet opt-in (15%)
3. Agent draws down from available credit line
4. Funds disbursed from the agent's individual AgentVault to agent wallet
5. Revenue flows into RevenueLockbox -> auto-deduction for repayment -> remainder forwarded to agent
6. Agent monitors outstanding debt, repayment progress, remaining credit

### Flow 4: Default Lifecycle

1. Revenue drops or stops flowing through lockbox
2. Grace period (configurable, e.g. 7 days) -- status: ACTIVE
3. Delinquency period (e.g. 14 days) -- status: DELINQUENT, reputation penalty begins
4. Default (e.g. 30 days without sufficient repayment) -- status: DEFAULT
5. Reputation slashed, credit line revoked
6. Agent's vault freezes on default; Dutch auction triggered for collateral
7. RecoveryManager distributes auction proceeds back to the agent's vault
8. Losses are absorbed only by that agent's backers (risk isolated per vault)

---

## MVP Scope

### In Scope (MVP)

- **Smart Contracts:**
  - AgentVault (ERC-4626 individual vault per agent)
  - AgentVaultFactory (deploys vault + lockbox per agent)
  - AgentRegistry (ERC-8004 identity, reputation tracking)
  - RevenueLockbox (immutable per-agent revenue capture + auto-repayment)
  - CreditScorer (weighted multi-source scoring)
  - AgentCreditLine (per-agent borrow/repay facility)
  - AgentSmartWallet + SmartWalletFactory (opt-in for higher credit)
  - DutchAuction + RecoveryManager + LiquidationKeeper (liquidation stack)

- **Backend (Python/FastAPI):**
  - SIWE authentication
  - Agent CRUD and profile management
  - Revenue tracking and verification
  - Credit scoring algorithm
  - Pool statistics and APY calculation
  - Agent health monitoring

- **Frontend (React/Vite/Tailwind):**
  - Landing page with protocol overview
  - Agent marketplace (browse agents, compare vault APYs)
  - Deposit/withdraw for individual agent vaults
  - Agent registry browser
  - Agent onboarding multi-step form
  - Agent borrow/repay dashboard

- **Market 1 only:** Crypto-native agents (MEV bots, trading bots, solvers, keepers)

### Out of Scope (Post-MVP)

- Market 2: Real-world business agents with POS/oracle integration
- x402 micropayment integration
- ZK proof generation for privacy-preserving credit checks
- TEE runtime verification (MVP accepts attestation, doesn't verify in real-time)
- Governance token and DAO
- Multi-chain deployment (MVP targets one EVM chain)
- Secondary market for credit positions
- Advanced analytics and ML-based credit scoring
- Mobile-optimized UI
- Fiat on/off ramp

---

## Technical Architecture Overview

```
+-------------------+       +-------------------+       +----------------------------+
|    Frontend       |       |    Backend         |       |   Smart Contracts          |
|  (React + Vite)   | <---> |  (FastAPI + SQLAlchemy)|<->|   (Solidity/Foundry)       |
+-------------------+       +-------------------+       +----------------------------+
|                   |       |                   |       |                            |
| Pages:            |       | Modules:          |       | Factory:                   |
|  - Home           |       |  - /auth (SIWE)   |       |  - AgentVaultFactory       |
|  - Marketplace    |       |  - /agent         |       |  - SmartWalletFactory      |
|  - Agent Detail   |       |  - /revenue       |       |                            |
|  - Portfolio      |       |  - /credit        |       | Per-Agent (deployed by     |
|  - Leaderboard    |       |  - /pool          |       |  factory on registration): |
|  - Agent Onboard  |       |  - /monitoring    |       |  - AgentVault (ERC-4626)   |
|  - Borrow         |       |                   |       |  - RevenueLockbox          |
|                   |       |                   |       |                            |
| Stack:            |       | Stack:            |       | Singletons:                |
|  Tailwind CSS     |       |  Python 3.12+     |       |  - AgentRegistry           |
|  wagmi + viem     |       |  Pydantic v2      |       |  - CreditScorer            |
|  @tanstack/query  |       |  Alembic          |       |  - AgentCreditLine         |
|  React Router     |       |  web3.py          |       |  - DutchAuction            |
|                   |       |                   |       |  - RecoveryManager         |
|                   |       |                   |       |  - LiquidationKeeper       |
|                   |       |                   |       |                            |
|                   |       |                   |       | Stack:                     |
|                   |       |                   |       |  Solidity 0.8.24+          |
|                   |       |                   |       |  OpenZeppelin              |
|                   |       |                   |       |  Foundry                   |
+-------------------+       +-------------------+       +----------------------------+
         |                           |                            |
         |                           v                            |
         |                  +----------------+                    |
         +----------------->|   PostgreSQL   |<-------------------+
                            +----------------+
                                     |
                            +----------------+
                            |  EVM Blockchain |
                            | (Base / Mainnet)|
                            +----------------+
```

### Key Architectural Decisions

1. **Immutable RevenueLockbox:** One contract deployed per agent. Cannot be upgraded or modified. This is the trust anchor -- even if agent code changes, the lockbox enforces repayment.

2. **Vault-Per-Agent Architecture:** Each agent gets its own ERC-4626 AgentVault, deployed automatically by the AgentVaultFactory at registration. Risk is fully isolated: a default by one agent only affects backers of that specific vault. Backers choose which agents to fund rather than depositing into a shared pool.

3. **ERC-8004 Identity:** Each agent gets an on-chain identity (ERC-721-based) that accumulates reputation. This identity is portable and composable.

4. **ERC-4626 Agent Vaults:** Standard vault interface for deposits into each agent's vault. Composable with other DeFi protocols. Each vault mints agent-specific shares (lcA{id}USDC).

5. **Weighted On-chain Credit Scoring:** CreditScorer uses 6 weighted factors: revenue history (35%), time active (10%), revenue velocity (15%), reputation score (15%), code verified (10%), smart wallet opt-in (15%). The backend may augment with additional off-chain signals.

6. **SIWE Authentication:** Sign-In With Ethereum for both backers and agent operators. No passwords, no email.

7. **Liquidation Stack:** On default, the agent's vault freezes. A Dutch auction sells collateral, and the RecoveryManager distributes proceeds back to the vault. The LiquidationKeeper automates monitoring and triggering.

---

## API Contract (Frontend <-> Backend)

### Authentication
- `POST /auth/siwe/nonce` -- Get a nonce for SIWE
- `POST /auth/siwe/verify` -- Verify signed message, return JWT

### Agents
- `GET /agents` -- List all registered agents (paginated)
- `POST /agents` -- Register a new agent
- `GET /agents/{id}` -- Get agent details
- `GET /agents/{id}/revenue` -- Agent revenue history
- `GET /agents/{id}/credit` -- Agent credit line info
- `POST /agents/{id}/credit/draw` -- Draw from credit line
- `POST /agents/{id}/credit/repay` -- Manual repayment

### Vaults
- `GET /agents/{id}/vault` -- Agent vault details (TVL, utilization, APY, backer count)
- `GET /vaults/stats` -- Aggregate statistics across all agent vaults

### Monitoring
- `GET /agents/{id}/health` -- Agent health status and alerts

---

## Naming Conventions

| Concept | Frontend | Backend | Contracts |
|---------|----------|---------|-----------|
| Agent vault | Agent Vault | agent_vault | AgentVault |
| Vault factory | -- | vault_factory | AgentVaultFactory |
| AI agent | Agent | agent | Agent (struct) |
| Agent identity | ERC-8004 ID | agent_id | agentId (uint256) |
| Revenue capture | Lockbox | revenue_lockbox | RevenueLockbox |
| Credit line | Credit Line | credit_line | AgentCreditLine |
| Credit score | Reputation Score | credit_score | creditScore |
| Vault shares | lcA{id}USDC | lc_agent_shares | lcA{id}USDC (ERC-20) |
| Liquidation | Auction | liquidation | DutchAuction / RecoveryManager |
