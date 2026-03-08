// ============================================================================
// Lenclaw Frontend Types
//
// These types mirror what the on-chain contracts expose. Fields that exist
// only in the frontend (computed client-side or from off-chain sources)
// are annotated with comments.
//
// On-chain contracts:
//   AgentRegistry  - ERC-721 agent identity + profile (IAgentRegistry.sol)
//   AgentVault     - ERC-4626 per-agent vault (IAgentVault.sol)
//   AgentVaultFactory - deploys vaults + lockboxes (IAgentVaultFactory.sol)
//   AgentCreditLine - per-agent credit facility (AgentCreditLine.sol)
//   RevenueLockbox  - per-agent revenue capture (IRevenueLockbox.sol)
//   CreditScorer    - credit limit + rate calc (ICreditScorer.sol)
// ============================================================================

// ── On-chain enums ──────────────────────────────────────────────────────────

/** Matches AgentCreditLine.Status enum: ACTIVE=0, DELINQUENT=1, DEFAULT=2 */
export type CreditStatus = "active" | "delinquent" | "default"

/**
 * Agent status includes "none" for agents that have no credit facility yet.
 * On-chain, this means facilities[agentId] has never been initialized.
 */
export type AgentStatus = "active" | "delinquent" | "default" | "none"

export type RepaymentStatus = "paid" | "upcoming" | "overdue"

/**
 * Agent categories stored on-chain as bytes32 keccak hashes.
 * The string labels here are the human-readable versions.
 * On-chain: keccak256("TRADING"), keccak256("CONTENT"), etc.
 */
export type AgentCategory = "Trading" | "Content" | "Oracle" | "DeFi" | "NFT" | "Sniping" | "Stablecoin" | "Other"

// ── Agent (maps to IAgentRegistry.AgentProfile) ─────────────────────────────

export interface Agent {
  /** On-chain uint256 ERC-721 token ID from AgentRegistry */
  id: number
  /** Display name - stored in metadata JSON (off-chain) */
  name: string
  /** Human-readable ERC-8004 ID string for display (e.g. "8004-0001") */
  erc8004Id: string // Computed client-side from id
  /** On-chain: AgentProfile.reputationScore (0-1000, displayed as 0-100 in UI) */
  reputationScore: number
  /** Computed client-side: sum of revenue over 30 days, not stored on-chain */
  revenue30d: number // Computed client-side, not on-chain
  /** On-chain: CreditFacility.creditLimit from AgentCreditLine */
  creditLine: number
  /** On-chain: AgentVault.utilizationRate() in basis points, displayed as percent */
  utilization: number
  /** On-chain: AgentCreditLine.getStatus() - "none" if no facility exists */
  status: AgentStatus
  /** On-chain: AgentProfile.wallet */
  walletAddress: string
  /** Off-chain: parsed from AgentProfile.metadata JSON */
  description: string
  /** On-chain: AgentProfile.registeredAt (unix timestamp) */
  registeredAt: number
  /** On-chain: AgentProfile.codeHash (bytes32 hex string) */
  codeHash?: string
  /** On-chain: AgentProfile.codeVerified */
  codeVerified?: boolean
  /** On-chain: AgentProfile.lockbox address */
  lockboxAddress?: string
  /** On-chain: AgentProfile.vault address */
  vaultAddress?: string
  /** On-chain: AgentProfile.externalToken address */
  externalToken?: string
  /** On-chain: AgentProfile.externalProtocolId */
  externalProtocolId?: number
  /** On-chain: AgentProfile.agentCategory (bytes32, mapped to string) */
  agentCategory?: AgentCategory
  /** On-chain: SmartWalletFactory.wallets(agentId) != address(0) */
  hasSmartWallet?: boolean
}

// ── Pool / Protocol aggregate data ──────────────────────────────────────────

export interface PoolData {
  tvl: number // Computed client-side: sum of all vault totalAssets()
  apy: number // Computed client-side: weighted average across vaults
  utilizationRate: number // Computed client-side: aggregate utilization
  activeAgents: number // Computed client-side: count of registered agents
  totalRevenue: number // Computed client-side: sum of all vault totalRevenueReceived
  totalLoans: number // Computed client-side: sum of all vault totalBorrowed
  defaultRate: number // Computed client-side: defaulted agents / total agents
}

// ── Repayment ───────────────────────────────────────────────────────────────

export interface RepaymentEntry {
  date: number
  amount: number
  status: RepaymentStatus
}

// ── Borrower view ───────────────────────────────────────────────────────────

export interface BorrowerData {
  agentName: string
  erc8004Id: string
  /** On-chain: CreditFacility.creditLimit */
  creditLine: number
  /** Computed: creditLimit - getOutstanding() */
  availableCredit: number
  /** On-chain: AgentCreditLine.getOutstanding(agentId) */
  outstandingDebt: number
  /** On-chain: CreditFacility.interestRateBps (basis points, displayed as %) */
  interestRate: number
  /** On-chain: RevenueLockbox.totalRevenueCapture */
  lockboxRevenue: number
  /** On-chain: USDC.balanceOf(lockbox) */
  lockboxBalance: number
  /** Computed client-side: not tracked on-chain */
  nextPayment: { amount: number; dueDate: number }
  /** Computed client-side: not tracked on-chain */
  repaymentSchedule: RepaymentEntry[]
}

// ── Onboarding form ─────────────────────────────────────────────────────────

export interface OnboardingFormData {
  name: string
  description: string
  codeHash: string
  teeProvider: string
  teeAttestation: string
}

// ── Vault-per-Agent types ───────────────────────────────────────────────────

export type RiskLevel = "safe" | "moderate" | "risky" | "degen"

export type AgentBadge =
  | "hot_streak"
  | "at_risk"
  | "defaulted"
  | "top_earner"
  | "newcomer"
  | "consistent"
  | "whale_backed"
  | "smart_wallet"

/**
 * Maps to AgentVault.sol (ERC-4626).
 *
 * On-chain reads:
 *   agentId()            -> uint256
 *   totalAssets()         -> uint256 (USDC balance + totalBorrowed - fees)
 *   totalBorrowed()       -> uint256
 *   depositCap()          -> uint256
 *   utilizationRate()     -> uint256 (basis points)
 *   frozen()              -> bool
 *   totalRevenueReceived()-> uint256
 *   availableLiquidity()  -> uint256
 *   protocolFeeBps()      -> uint256
 *   withdrawalDelay()     -> uint256
 *   creditLine()          -> address
 *   factory()             -> address
 */
export interface AgentVault {
  /** On-chain: AgentVault.agentId() (uint256) */
  agentId: number
  /** On-chain: address of the deployed AgentVault contract */
  vaultAddress: string
  /** On-chain: AgentVault.totalAssets() (USDC balance + borrows - fees) */
  totalBacked: number
  /** Computed client-side: depositCap - totalAssets */
  availableCapacity: number
  /** On-chain: AgentVault.depositCap() */
  cap: number
  /** Computed client-side from totalRevenueReceived and time, not on-chain */
  apy: number // Computed client-side, not on-chain
  /** Not tracked on-chain (ERC-20 transfer events must be indexed off-chain) */
  backersCount: number // Computed client-side via event indexing, not on-chain
  /** Computed client-side from event logs; no on-chain 30-day array exists */
  revenueHistory: number[] // Computed client-side, not on-chain
  /** On-chain: AgentVault.utilizationRate() (basis points, displayed as %) */
  utilization: number
  /** On-chain: AgentVault.totalBorrowed() */
  totalBorrowed: number
  /** On-chain: AgentVault.totalRevenueReceived() */
  totalRevenueReceived: number
  /** On-chain: AgentVault.frozen() */
  frozen: boolean
  /** On-chain: AgentVault.availableLiquidity() */
  availableLiquidity: number
  /** On-chain: AgentVault.protocolFeeBps() */
  protocolFeeBps: number
  /** On-chain: AgentVault.withdrawalDelay() (seconds) */
  withdrawalDelay: number
  /** On-chain: AgentVault.creditLine() address */
  creditLineAddress: string
}

// ── Backer position ─────────────────────────────────────────────────────────

export interface BackingPosition {
  /** On-chain: uint256 agent ID */
  agentId: number
  agentName: string // Off-chain: from metadata
  /** On-chain: vault share balance converted to assets via convertToAssets() */
  amount: number
  /** Off-chain: timestamp of first deposit (from indexing Deposit events) */
  entryDate: number
  /** Computed client-side: current asset value - deposited amount. Not on-chain. */
  yieldEarned: number // Computed client-side, not on-chain
  /** Computed client-side from vault revenue data. Not on-chain. */
  currentApy: number // Computed client-side, not on-chain
  /** Computed client-side from agent reputation and utilization */
  riskLevel: RiskLevel // Computed client-side, not on-chain
  status: "active" | "withdrawing" | "defaulted"
}

// ── Activity feed ───────────────────────────────────────────────────────────

export type ActivityEventType =
  | "revenue"
  | "backing"
  | "repayment"
  | "late_payment"
  | "default"
  | "milestone"
  | "new_agent"
  | "withdrawal"

export interface ActivityEvent {
  id: string
  type: ActivityEventType
  /** On-chain: uint256 agent ID (displayed as string in URLs/links) */
  agentId: number
  agentName: string // Off-chain: from metadata
  amount?: number
  message: string
  timestamp: number
  txHash?: string
}

// ── Leaderboard ─────────────────────────────────────────────────────────────

export interface LeaderboardEntry {
  rank: number // Computed client-side
  /** On-chain: uint256 agent ID */
  agentId: number
  agentName: string // Off-chain: from metadata
  apy: number // Computed client-side, not on-chain
  revenue30d: number // Computed client-side, not on-chain
  totalBacked: number // On-chain: vault.totalAssets()
  backersCount: number // Computed client-side via event indexing, not on-chain
  riskLevel: RiskLevel // Computed client-side, not on-chain
  badges: AgentBadge[] // Computed client-side, not on-chain
  trend: "up" | "down" | "stable" // Computed client-side, not on-chain
  trendDelta: number // Computed client-side, not on-chain
}

// ── Composite types ─────────────────────────────────────────────────────────

export interface AgentWithVault extends Agent {
  vault: AgentVault
  riskLevel: RiskLevel // Computed client-side, not on-chain
  badges: AgentBadge[] // Computed client-side, not on-chain
  category: string
  avatarColor: string // UI-only
}

export interface PortfolioSummary {
  totalBacked: number
  totalYieldEarned: number // Computed client-side
  activePositions: number
  avgApy: number // Computed client-side
  positions: BackingPosition[]
}

export interface GlobalStats {
  totalBacked: number // Computed: sum of all vault totalAssets
  activeAgents: number // Computed: count of non-defaulted agents
  bestPerformerApy: number // Computed client-side
  bestPerformerName: string
  biggestDefaultAmount: number // Computed client-side
  biggestDefaultName: string
  totalRevenue24h: number // Computed client-side
  totalBackers: number // Computed client-side via event indexing
}

// ── Credit facility (maps to AgentCreditLine.CreditFacility) ────────────────

export interface CreditFacility {
  /** On-chain: CreditFacility.principal */
  principal: number
  /** On-chain: CreditFacility.accruedInterest */
  accruedInterest: number
  /** On-chain: CreditFacility.lastAccrualTimestamp */
  lastAccrualTimestamp: number
  /** On-chain: CreditFacility.interestRateBps */
  interestRateBps: number
  /** On-chain: CreditFacility.creditLimit */
  creditLimit: number
  /** On-chain: CreditFacility.status (0=ACTIVE, 1=DELINQUENT, 2=DEFAULT) */
  status: CreditStatus
}

// ── Revenue lockbox (maps to RevenueLockbox.sol) ────────────────────────────

export interface RevenueLockboxData {
  /** On-chain: RevenueLockbox.agentId() */
  agentId: number
  /** On-chain: RevenueLockbox.agent() */
  agentAddress: string
  /** On-chain: RevenueLockbox.vault() */
  vaultAddress: string
  /** On-chain: RevenueLockbox.creditLine() */
  creditLineAddress: string
  /** On-chain: RevenueLockbox.repaymentRateBps() */
  repaymentRateBps: number
  /** On-chain: RevenueLockbox.totalRevenueCapture() */
  totalRevenueCapture: number
  /** On-chain: RevenueLockbox.totalRepaid() */
  totalRepaid: number
  /** On-chain: RevenueLockbox.pendingRepayment() */
  pendingRepayment: number
}
