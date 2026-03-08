// ── Legacy types (still used by existing pages) ──────────────────────────────

export type AgentStatus = "active" | "delinquent" | "default"
export type RepaymentStatus = "paid" | "upcoming" | "overdue"
export type AgentCategory = "Trading" | "Content" | "Oracle" | "DeFi" | "NFT" | "Sniping" | "Stablecoin" | "Other"

export interface Agent {
  id: string
  name: string
  erc8004Id: string
  reputationScore: number
  revenue30d: number
  creditLine: number
  utilization: number
  status: AgentStatus
  walletAddress: string
  description: string
  registeredAt: number
  externalToken?: string
  externalProtocolId?: number
  agentCategory?: AgentCategory
}

export interface PoolData {
  tvl: number
  apy: number
  utilizationRate: number
  activeAgents: number
  totalRevenue: number
  totalLoans: number
  defaultRate: number
}

export interface RepaymentEntry {
  date: number
  amount: number
  status: RepaymentStatus
}

export interface BorrowerData {
  agentName: string
  erc8004Id: string
  creditLine: number
  availableCredit: number
  outstandingDebt: number
  interestRate: number
  lockboxRevenue: number
  lockboxBalance: number
  nextPayment: { amount: number; dueDate: number }
  repaymentSchedule: RepaymentEntry[]
}

export interface OnboardingFormData {
  name: string
  description: string
  codeHash: string
  teeProvider: string
  teeAttestation: string
}

// ── Vault-per-Agent types ────────────────────────────────────────────────────

export type RiskLevel = "safe" | "moderate" | "risky" | "degen"

export type AgentBadge =
  | "hot_streak"
  | "at_risk"
  | "defaulted"
  | "top_earner"
  | "newcomer"
  | "consistent"
  | "whale_backed"

export interface AgentVault {
  agentId: string
  vaultAddress: string
  totalBacked: number
  availableCapacity: number
  cap: number
  apy: number
  backersCount: number
  revenueHistory: number[]
  utilization: number
}

export interface BackingPosition {
  agentId: string
  agentName: string
  amount: number
  entryDate: number
  yieldEarned: number
  currentApy: number
  riskLevel: RiskLevel
  status: "active" | "withdrawing" | "defaulted"
}

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
  agentId: string
  agentName: string
  amount?: number
  message: string
  timestamp: number
  txHash?: string
}

export interface LeaderboardEntry {
  rank: number
  agentId: string
  agentName: string
  apy: number
  revenue30d: number
  totalBacked: number
  backersCount: number
  riskLevel: RiskLevel
  badges: AgentBadge[]
  trend: "up" | "down" | "stable"
  trendDelta: number
}

export interface AgentWithVault extends Agent {
  vault: AgentVault
  riskLevel: RiskLevel
  badges: AgentBadge[]
  category: string
  avatarColor: string
}

export interface PortfolioSummary {
  totalBacked: number
  totalYieldEarned: number
  activePositions: number
  avgApy: number
  positions: BackingPosition[]
}

export interface GlobalStats {
  totalBacked: number
  activeAgents: number
  bestPerformerApy: number
  bestPerformerName: string
  biggestDefaultAmount: number
  biggestDefaultName: string
  totalRevenue24h: number
  totalBackers: number
}
