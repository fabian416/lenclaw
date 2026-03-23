# AGENTS.md — Lending Agent Tools

## wdk_wallet

Self-custodial wallet management via Tether WDK.

**Actions:**
- `create` — Generate a new WDK wallet for the agent
- `restore` — Restore wallet from existing seed/credentials
- `balance` — Query ETH and USDC balances
- `sign` — Sign a transaction for broadcast
- `send` — Send USDC to a target address

**Config:**
```yaml
chain: base
rpc: $BASE_RPC_URL
usdc: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"
```

---

## credit_scorer

Calculate credit lines by reading the on-chain `CreditScorer` contract.

**Actions:**
- `score` — Get composite score (0–1000) for an agent ID
- `breakdown` — Get individual factor scores (revenue_level, revenue_consistency, credit_history, time_in_protocol, debt_to_revenue)
- `credit_line` — Get the approved credit limit in USDC
- `interest_rate` — Get the APR (3–25%) for the agent's score tier

**Contract:** `CreditScorer`
**Weights:** Revenue 30%, Consistency 25%, History 20%, Time 15%, DTR 10%
**Output range:** Credit line 100–100,000 USDC / APR 3–25%

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
**Min drawdown:** 10 USDC

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
