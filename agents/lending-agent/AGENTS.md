# AGENTS.md — Lending Agent Tools

## wdk_wallet

Self-custodial wallet management via Tether WDK.

**Actions:**
- `create` — Generate a new WDK wallet for the agent
- `restore` — Restore wallet from existing seed/credentials
- `balance` — Query ETH and USDT balances
- `sign` — Sign a transaction for broadcast
- `send` — Send USDT to a target address

**Config:**
```yaml
chain: base
rpc: $BASE_RPC_URL
usdt: "0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2"
```

---

## credit_scorer

Calculate credit lines by reading the on-chain `CreditScorer` contract.

**Actions:**
- `score` — Get composite score (0–1000) for an agent ID
- `breakdown` — Get individual factor scores (revenue_level, revenue_consistency, credit_history, time_in_protocol, debt_to_revenue)
- `credit_line` — Get the approved credit limit in USDT
- `interest_rate` — Get the APR (3–25%) for the agent's score tier

**Contract:** `CreditScorer`
**Weights:** Revenue 30%, Consistency 25%, History 20%, Time 15%, DTR 10%
**Output range:** Credit line 100–100,000 USDT / APR 3–25%

---

## revenue_monitor

Track agent revenue flow through `RevenueLockbox`.

**Actions:**
- `stats` — Get lockbox totals (totalRevenueCaptured, totalRepaid, repaymentRateBps, pendingRepayment, currentEpoch)
- `poll` — Check for new revenue since last poll
- `epoch_history` — Get revenue per epoch for consistency analysis
- `alert_check` — Detect revenue drops or missed epochs

**Contract:** `RevenueLockbox` (one per agent, immutable)
**Poll interval:** Configurable, default 30s

---

## loan_manager

Issue, track, and manage loans via `AgentCreditLine`.

**Actions:**
- `status` — Get credit line status (ACTIVE / DELINQUENT / DEFAULT) and outstanding debt
- `approve_drawdown` — Pre-flight check + approve a drawdown request
- `deny_drawdown` — Deny with reason code and score breakdown
- `track_repayment` — Monitor repayment progress against schedule
- `flag_delinquent` — Mark agent for increased monitoring
- `trigger_freeze` — Coordinate vault freeze on DEFAULT via `AgentVaultFactory`

**Contract:** `AgentCreditLine`
**Status flow:** ACTIVE → DELINQUENT (grace 7d) → DEFAULT (30d, auto-freeze)
**Min drawdown:** 10 USDT

---

## loan_negotiator

LLM-powered loan term negotiation. Uses `agent.think()` to reason about borrower proposals against on-chain credit data and generate counter-offers.

**Actions:**
- `negotiate` — Receive a borrower's proposed terms (amount, duration, preferred rate), read their credit profile via `credit_scorer`, and use LLM reasoning to produce a counter-offer with adjusted terms and a plain-language explanation. Terms stay within CreditScorer bounds but allow flexibility on rate and duration based on profile strength.
- `evaluate_proposal` — Score a specific proposal (amount, duration, rate) against the borrower's credit profile. Returns a fit score (0–100) and flags on any terms that exceed what the profile supports.
- `finalize_terms` — Lock in mutually agreed terms (amount, rate, duration) so they can be referenced during drawdown approval. Returns a `negotiationId` for tracking.

**Depends on:** `credit_scorer` (composite score, credit line, interest rate), `revenue_monitor` (revenue stability), `loan_manager` (outstanding debt, status)

---

## yield_optimizer

Cross-vault yield comparison and capital reallocation. Reads on-chain vault metrics and credit data to identify higher-yield opportunities and recommend rebalancing.

**Actions:**
- `scan_yields` — Read APY across all active agent vaults. For each vault, queries `totalAssets`, `totalBorrowed`, `utilizationRate`, and the agent's `repaymentRateBps` and interest rate to compute effective yield. Returns a ranked list of vaults by estimated APY.
- `compare_vaults` — Risk-adjusted yield comparison between two or more specific vaults. Fetches each vault agent's composite credit score, revenue consistency, and debt-to-revenue ratio alongside raw yield. Returns a side-by-side comparison with a risk-adjusted score.
- `recommend_rebalance` — Suggest optimal allocation across vaults. Uses `agent.think()` to reason about current positions, yield differentials, and risk factors. Outputs a rebalance plan: which vaults to reduce, which to increase, amounts, and rationale.
- `execute_rebalance` — Prepare withdraw + deposit transactions for rebalancing. Reads current backer position in the source vault, prepares a withdraw call, then prepares a deposit call to the target vault. Returns prepared transaction data for execution via WDK (does not broadcast — the agent or backer confirms).

**Contracts:** `AgentVault` (totalAssets, totalBorrowed, availableLiquidity, utilizationRate), `AgentVaultFactory` (getVault), `CreditScorer` (getCompositeScore, calculateCreditLine), `RevenueLockbox` (repaymentRateBps, totalRevenueCapture, epochsWithRevenue, currentEpoch), `AgentRegistry` (getAgent)
**Depends on:** `credit_scorer` (risk assessment), `revenue_monitor` (revenue stability data)

---

## zk_verifier

Verify zero-knowledge credit proofs via `ZKCreditVerifier` + `HonkVerifier`.

**Actions:**
- `verify_proof` — Submit and verify a Noir ZK proof of creditworthiness on-chain via `verifyCredit()`
- `generate_attestation` — Run the off-chain Noir prover (`prove.py`) to generate a composite credit proof from private inputs (revenue, code hash, reputation)
- `check_threshold` — Verify an agent meets a credit threshold without revealing exact score via `isCreditEligible()`
- `proof_status` — Check whether an agent has a valid, non-expired proof via `isProofValid()`
- `get_tiers` — Retrieve the privacy-safe revenue tier (0–4) and reputation band (0–3) from the last verified proof via `getRevenueTier()` / `getReputationBand()`

**Contracts:** `ZKCreditVerifier`, `HonkVerifier` (barretenberg)
**Circuit:** Noir composite credit proof (revenue threshold + code integrity + reputation minimum) verified with Honk (barretenberg backend) over BN254
**Proof expiry:** Configurable, default 7 days

---

## peer_lending

Agent-to-agent lending across vaults. Enables agents to borrow from other agents' surplus liquidity to complete complex tasks they cannot afford alone.

**Actions:**
- `find_liquidity` — Scan registered agent vaults to find those with available surplus liquidity for peer lending. Reads `AgentVault.availableLiquidity()` across a list of agent IDs and returns vaults with non-zero surplus, sorted by available amount descending.
- `request_peer_loan` — Structure a peer loan request. Takes a source agent ID (lender), destination agent ID (borrower), and amount. Validates both agents are registered, checks source vault has sufficient liquidity, and returns a structured loan request object with terms derived from the borrower's credit profile.
- `approve_peer_loan` — Pre-flight approval for a peer lending arrangement. Verifies: both agents are registered in `AgentRegistry`, source agent's vault has sufficient `availableLiquidity()`, destination agent has ACTIVE status (not DELINQUENT/DEFAULT), destination agent's composite credit score meets the minimum threshold. Returns approval with terms or denial with reason code.
- `track_peer_exposure` — Monitor outstanding cross-agent lending positions. Reads debt data across agent pairs to report total peer exposure, per-pair breakdowns, and concentration warnings when any single peer relationship exceeds 50% of the source agent's vault assets.

**Contracts:** `AgentVault` (availableLiquidity, totalAssets), `AgentRegistry` (isRegistered, getAgent), `AgentCreditLine` (getStatus, getOutstanding), `CreditScorer` (getCompositeScore), `AgentVaultFactory` (getVault)
**Architecture:** Leverages the vault-per-agent model — Agent A deposits USDT into Agent B's vault, increasing Agent B's available liquidity for drawdown. The existing RevenueLockbox + AgentCreditLine infrastructure handles repayment automatically.
