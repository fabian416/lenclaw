# Lenclaw Product Specification

## Product Vision

Lenclaw is **credit infrastructure for the agentic economy**. As AI agents increasingly operate autonomously onchain -- running MEV strategies, solving intents, executing keeper jobs -- they generate verifiable revenue but lack access to credit. Lenclaw enables these agents to borrow against their onchain revenue streams using an immutable RevenueLockbox contract that captures income and auto-deducts repayments before forwarding the remainder to the agent. The agent's code may change, but the lockbox cannot be circumvented. This architectural guarantee replaces legal enforcement with smart contract certainty, creating the first credible lending market for non-human borrowers.

---

## User Personas

### 1. Depositor (Liquidity Provider)

**Who:** DeFi yield seekers, institutional allocators, treasury managers.

**Goal:** Earn yield by supplying USDC to Lenclaw's lending pool.

**Key needs:**
- Clear risk/return tradeoff via Senior and Junior tranches
- Transparent pool statistics: TVL, utilization, APY, default rates
- Easy deposit/withdraw with ERC-4626 share accounting
- Confidence that repayments are enforced at the smart contract level

**Tranche options:**
- **Senior Tranche (80% of pool):** Lower yield, priority repayment, lower risk. Target audience: conservative LPs.
- **Junior Tranche (20% of pool):** Higher yield, first-loss absorption, withdrawal cooldown. Target audience: risk-seeking LPs willing to underwrite agent credit risk.

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

### Flow 1: Depositor Supplies Liquidity

1. Connect wallet (MetaMask, WalletConnect, etc.)
2. View pool dashboard: TVL, utilization rate, APY per tranche
3. Choose tranche (Senior or Junior)
4. Approve and deposit USDC
5. Receive lcUSDC shares (ERC-4626 vault shares)
6. Monitor position: accrued yield, share value, pool health
7. Withdraw: redeem shares for USDC (Junior has cooldown period)

### Flow 2: Agent Operator Registers Agent

1. Connect wallet (agent operator's EOA)
2. Navigate to Agent Onboarding
3. Submit agent details: name, description, wallet address
4. Submit code hash + TEE attestation for verification
5. Protocol deploys an immutable RevenueLockbox for the agent
6. Agent receives ERC-8004 identity token (ERC-721)
7. Agent starts routing revenue through the lockbox to build history

### Flow 3: Agent Borrows Against Revenue

1. Agent operator views credit dashboard
2. Protocol calculates credit line based on: revenue history (30/60/90d), consistency score, reputation, code verification status
3. Agent draws down from available credit line
4. Funds disbursed from lending pool to agent wallet
5. Revenue flows into RevenueLockbox -> auto-deduction for repayment -> remainder forwarded to agent
6. Agent monitors outstanding debt, repayment progress, remaining credit

### Flow 4: Default Lifecycle

1. Revenue drops or stops flowing through lockbox
2. Grace period (configurable, e.g. 7 days) -- status: ACTIVE
3. Delinquency period (e.g. 14 days) -- status: DELINQUENT, reputation penalty begins
4. Default (e.g. 30 days without sufficient repayment) -- status: DEFAULT
5. Reputation slashed, credit line revoked
6. Junior tranche absorbs losses first, then senior if junior is depleted

---

## MVP Scope

### In Scope (MVP)

- **Smart Contracts:**
  - LenclawVault (ERC-4626 core lending pool)
  - SeniorTranche and JuniorTranche (ERC-4626 tranched deposits)
  - AgentRegistry (ERC-8004 identity, reputation tracking)
  - RevenueLockbox (immutable per-agent revenue capture + auto-repayment)
  - CreditScorer (on-chain credit line calculation)
  - AgentCreditLine (per-agent borrow/repay facility)

- **Backend (Python/FastAPI):**
  - SIWE authentication
  - Agent CRUD and profile management
  - Revenue tracking and verification
  - Credit scoring algorithm
  - Pool statistics and APY calculation
  - Agent health monitoring

- **Frontend (React/Vite/Tailwind):**
  - Landing page with protocol overview
  - Pool dashboard (TVL, APY, utilization)
  - Deposit/withdraw for Senior and Junior tranches
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
- Liquidation auctions
- Secondary market for credit positions
- Advanced analytics and ML-based credit scoring
- Mobile-optimized UI
- Fiat on/off ramp

---

## Technical Architecture Overview

```
+-------------------+       +-------------------+       +------------------------+
|    Frontend       |       |    Backend         |       |   Smart Contracts      |
|  (React + Vite)   | <---> |  (FastAPI + SQLAlchemy)|<->|   (Solidity/Foundry)   |
+-------------------+       +-------------------+       +------------------------+
|                   |       |                   |       |                        |
| Pages:            |       | Modules:          |       | Core:                  |
|  - Home           |       |  - /auth (SIWE)   |       |  - LenclawVault        |
|  - Dashboard      |       |  - /agent         |       |  - SeniorTranche       |
|  - Lend           |       |  - /revenue       |       |  - JuniorTranche       |
|  - Agent Registry |       |  - /credit        |       |  - AgentRegistry       |
|  - Agent Onboard  |       |  - /pool          |       |  - RevenueLockbox      |
|  - Borrow         |       |  - /monitoring    |       |  - CreditScorer        |
|                   |       |                   |       |  - AgentCreditLine     |
| Stack:            |       | Stack:            |       |                        |
|  Tailwind CSS     |       |  Python 3.12+     |       | Stack:                 |
|  wagmi + viem     |       |  Pydantic v2      |       |  Solidity 0.8.24+      |
|  @tanstack/query  |       |  Alembic          |       |  OpenZeppelin          |
|  React Router     |       |  web3.py          |       |  Foundry               |
+-------------------+       +-------------------+       +------------------------+
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

2. **Tranched Risk:** Senior/Junior split gives depositors choice. Junior absorbs first losses, earning higher yield. Senior gets priority repayment.

3. **ERC-8004 Identity:** Each agent gets an on-chain identity (ERC-721-based) that accumulates reputation. This identity is portable and composable.

4. **ERC-4626 Vaults:** Standard vault interface for deposits. Composable with other DeFi protocols.

5. **Off-chain Credit Scoring:** The backend runs a more sophisticated credit scoring algorithm than what's feasible on-chain. The on-chain CreditScorer provides a floor/ceiling, while the backend provides the nuanced score.

6. **SIWE Authentication:** Sign-In With Ethereum for both depositors and agent operators. No passwords, no email.

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

### Pool
- `GET /pool/stats` -- Pool statistics (TVL, utilization, active agents, total revenue)
- `GET /pool/apy` -- Current APY for senior and junior tranches

### Monitoring
- `GET /agents/{id}/health` -- Agent health status and alerts

---

## Naming Conventions

| Concept | Frontend | Backend | Contracts |
|---------|----------|---------|-----------|
| Lending pool | Pool / Vault | pool | LenclawVault |
| Senior deposit | Senior Tranche | senior_tranche | SeniorTranche |
| Junior deposit | Junior Tranche | junior_tranche | JuniorTranche |
| AI agent | Agent | agent | Agent (struct) |
| Agent identity | ERC-8004 ID | agent_id | agentId (uint256) |
| Revenue capture | Lockbox | revenue_lockbox | RevenueLockbox |
| Credit line | Credit Line | credit_line | AgentCreditLine |
| Credit score | Reputation Score | credit_score | creditScore |
| Vault shares | lcUSDC | lc_usdc_shares | lcUSDC (ERC-20) |
