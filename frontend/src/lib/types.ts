export type AgentStatus = "active" | "delinquent" | "default"
export type TrancheType = "senior" | "junior"
export type RepaymentStatus = "paid" | "upcoming" | "overdue"

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
}

export interface PoolData {
  tvl: number
  seniorAPY: number
  juniorAPY: number
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
