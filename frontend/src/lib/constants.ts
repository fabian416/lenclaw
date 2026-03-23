/**
 * Contract ABIs - Generate from Foundry artifacts:
 *   cd contracts && forge build
 *   ABIs are in: contracts/out/<ContractName>.sol/<ContractName>.json
 *
 * Key ABIs needed:
 * - AgentRegistry: getAgent(), registerAgent(), isRegistered(), getAgentIdByWallet()
 * - AgentVaultFactory: getVault(), createVault(), getLockbox(), totalVaults()
 * - AgentVault: deposit(), redeem(), totalAssets(), balanceOf(), requestWithdrawal(),
 *               totalBorrowed(), utilizationRate(), frozen(), depositCap(),
 *               totalRevenueReceived(), availableLiquidity(), protocolFeeBps()
 * - AgentCreditLine: getOutstanding(), getStatus(), drawdown(), repay(), refreshCreditLine()
 * - RevenueLockbox: processRevenue(), totalRevenueCapture(), totalRepaid(), pendingRepayment()
 * - CreditScorer: calculateCreditLine()
 * - DutchAuction: getCurrentPrice(), bid(), getAuction()
 */

// ── Chain IDs ───────────────────────────────────────────────────────────────

export const CHAIN_IDS = {
  BASE: 8453,
  BASE_SEPOLIA: 84532,
  ARBITRUM: 42161,
  OPTIMISM: 10,
  POLYGON: 137,
} as const

/** Backward-compatible default chain ID */
export const CHAIN_ID = CHAIN_IDS.BASE

// ── Contract addresses per chain ────────────────────────────────────────────
// NOTE: All non-USDT addresses below are zero addresses (0x000...000).
// They MUST be replaced with real deployed addresses after running:
//   cd contracts && forge script script/Deploy.s.sol --broadcast
// Until then, use `isContractDeployed()` in the UI to gate contract interactions
// and show "Not deployed" states gracefully.

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as const

export const CONTRACTS = {
  [CHAIN_IDS.BASE]: {
    USDT: "0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2" as const,
    AGENT_REGISTRY: "0x9B2A14A423067BAdd5a64979E59dED6C7A5681Ea" as const,
    AGENT_VAULT_FACTORY: "0x92927C356fe500AC7F38A5B41CC3A4A2445D02f0" as const,
    AGENT_CREDIT_LINE: "0xdbb95d8aF780D73e441e922f3b9642a5C116629c" as const,
    CREDIT_SCORER: "0xeB2189bC09f65085B8cb8d50275326B3433b7B5d" as const,
    DUTCH_AUCTION: "0xc774B8bD35E1892CFf39dC2488626f21539fC453" as const,
    RECOVERY_MANAGER: "0xD82C771F720374A49852b6883a263E3ECEfE4bA2" as const,
    LIQUIDATION_KEEPER: "0x6cc149Edf16c34EE25fD9D232Bc97e0895Bb6d78" as const,
    WDK_WALLET_FACTORY: "0x14c63a871e785810609B256be50390CCaeC77743" as const,
    USDT0_BRIDGE: "0x869c5b496EDe910B8bF09078a059ca4FE61Afe33" as const,
  },
  // Other chains can be added after deployment
} as const

/**
 * Returns true if the given address is a real deployed contract
 * (i.e., not the zero address). Use this to guard UI interactions
 * and show "Not deployed" placeholders when contracts are missing.
 */
export function isContractDeployed(address: string): boolean {
  return !!address && address !== ZERO_ADDRESS
}

/** Helper to get contracts for the current chain */
export function getContracts(chainId: number = CHAIN_ID) {
  const contracts = CONTRACTS[chainId as keyof typeof CONTRACTS]
  if (!contracts) {
    throw new Error(`No contracts configured for chain ${chainId}`)
  }
  return contracts
}

// ── Ecosystem config ────────────────────────────────────────────────────────

export const ECOSYSTEM_PROTOCOL_IDS = {
  independent: 0,
  virtuals: 1,
  mateos: 2,
  openclaw: 3,
} as const

export const ECOSYSTEM_CONFIG = {
  virtuals: {
    name: "Virtuals Protocol",
    description: "Agent token + LP on Virtuals",
    color: "#7C3AED",
    autoFills: ["name", "category", "token"],
    needsTokenAddress: true,
  },
  openclaw: {
    name: "ElizaOS / OpenClaw",
    description: "Bankr wallet, x402, Moltbook",
    color: "#059669",
    autoFills: ["wallet", "identity"],
    needsTokenAddress: false,
  },
  mateos: {
    name: "Mateos",
    description: "Autonomous agent ecosystem",
    color: "#3B82F6",
    autoFills: ["name", "category", "wallet"],
    needsTokenAddress: false,
  },
  independent: {
    name: "Independent Agent",
    description: "Custom bot or DeFi agent",
    color: "#6B7280",
    autoFills: [],
    needsTokenAddress: false,
  },
} as const

export const AGENT_CATEGORIES = [
  "Trading", "DeFi", "Content", "Oracle", "NFT", "Sniping", "Stablecoin", "Service", "MEV", "Other",
] as const

// ============================================================================
// Demo data — production reads from on-chain contracts
// ============================================================================

export const MOCK_POOL_DATA = {
  tvl: 18_200,
  apy: 11.4,
  utilizationRate: 58.3,
  activeAgents: 5,
  totalRevenue: 4_850,
  totalLoans: 10_600,
  defaultRate: 0,
}

export const MOCK_AGENTS = [
  {
    id: 3,
    name: "AutoTrader-v3",
    erc8004Id: "8004-0003",
    reputationScore: 500,
    revenue30d: 1_840,
    creditLine: 5_500,
    utilization: 62,
    status: "active" as const,
    walletAddress: "0x3E28346fE1f83780e1EDD31dcc9173969eCAf3B4",
    description: "Earn yield through independent auto strategies",
    registeredAt: 1774219207,
    agentCategory: "Trading" as const,
    externalToken: "0x0000000000000000000000000000000000000000",
    externalProtocolId: 0,
    hasSmartWallet: true,
    vaultAddress: "0x02Acb1A07B77AFA9D8d35681F2829d83df449525",
    lockboxAddress: "0xF6b09E6d68edAD5729aD5699a0bDA295A17AD3A2",
  },
  {
    id: 4,
    name: "AutoYield-Bot",
    erc8004Id: "8004-0004",
    reputationScore: 500,
    revenue30d: 920,
    creditLine: 2_800,
    utilization: 45,
    status: "active" as const,
    walletAddress: "0xa46E6e29d0b62c85eAA560d9e1A775cd7c201076",
    description: "Capture arbitrage opportunities across Base DEXs",
    registeredAt: 1774220287,
    agentCategory: "DeFi" as const,
    externalToken: "0x0000000000000000000000000000000000000000",
    externalProtocolId: 0,
    hasSmartWallet: true,
    vaultAddress: "0x7a37204068328a506CD8287fB55ba1D1600A253a",
    lockboxAddress: "0xEd049777e228DE52e25239B1Ad71d80260990981",
  },
  {
    id: 2,
    name: "Mateos-Arb-v1",
    erc8004Id: "8004-0002",
    reputationScore: 500,
    revenue30d: 640,
    creditLine: 1_900,
    utilization: 38,
    status: "active" as const,
    walletAddress: "0x3333333333333333333333333333333333333333",
    description: "Mateos ecosystem arbitrage agent. Cross-DEX spreads on Base.",
    registeredAt: 1774218681,
    agentCategory: "Trading" as const,
    externalToken: "0x0000000000000000000000000000000000000000",
    externalProtocolId: 2,
  },
  {
    id: 1,
    name: "Eliza-Keeper",
    erc8004Id: "8004-0001",
    reputationScore: 500,
    revenue30d: 480,
    creditLine: 1_400,
    utilization: 72,
    status: "active" as const,
    walletAddress: "0x2222222222222222222222222222222222222222",
    description: "ElizaOS keeper agent. Liquidates undercollateralized positions.",
    registeredAt: 1774218549,
    agentCategory: "DeFi" as const,
    externalToken: "0x0000000000000000000000000000000000000000",
    externalProtocolId: 3,
  },
]

// ── Vault-per-Agent demo data ─────────────────────────────────────────────────

import type {
  AgentWithVault,
  LeaderboardEntry,
  PortfolioSummary,
  ActivityEvent,
  GlobalStats,
} from "./types"

export const MOCK_AGENTS_WITH_VAULT: AgentWithVault[] = [
  {
    ...MOCK_AGENTS[0],
    vault: {
      agentId: 3,
      vaultAddress: "0x02Acb1A07B77AFA9D8d35681F2829d83df449525",
      totalBacked: 5_200,
      availableCapacity: 2_800,
      cap: 8_000,
      apy: 14.2,
      backersCount: 3,
      revenueHistory: [48, 52, 61, 58, 65, 62, 70, 68, 74, 71, 78, 75, 82, 80, 76, 84, 88, 85, 90, 87, 92, 89, 95, 91, 98, 94, 100, 96, 102, 98],
      utilization: 62,
      totalBorrowed: 3_224,
      totalRevenueReceived: 1_840,
      frozen: false,
      availableLiquidity: 1_976,
      protocolFeeBps: 1000,
      withdrawalDelay: 86400,
      creditLineAddress: "0xdbb95d8aF780D73e441e922f3b9642a5C116629c",
    },
    riskLevel: "moderate",
    badges: ["top_earner", "smart_wallet"],
    category: "Trading",
    avatarColor: "#ea580c",
  },
  {
    ...MOCK_AGENTS[1],
    vault: {
      agentId: 4,
      vaultAddress: "0x7a37204068328a506CD8287fB55ba1D1600A253a",
      totalBacked: 4_100,
      availableCapacity: 1_900,
      cap: 6_000,
      apy: 9.8,
      backersCount: 2,
      revenueHistory: [28, 30, 32, 29, 31, 33, 30, 34, 32, 35, 33, 36, 34, 37, 35, 38, 36, 39, 37, 40, 38, 41, 39, 42, 40, 43, 41, 44, 42, 45],
      utilization: 45,
      totalBorrowed: 1_845,
      totalRevenueReceived: 920,
      frozen: false,
      availableLiquidity: 2_255,
      protocolFeeBps: 1000,
      withdrawalDelay: 86400,
      creditLineAddress: "0xdbb95d8aF780D73e441e922f3b9642a5C116629c",
    },
    riskLevel: "safe",
    badges: ["consistent", "smart_wallet"],
    category: "DeFi",
    avatarColor: "#059669",
  },
  {
    ...MOCK_AGENTS[2],
    vault: {
      agentId: 2,
      vaultAddress: "0x0000000000000000000000000000000000000000",
      totalBacked: 3_800,
      availableCapacity: 2_200,
      cap: 6_000,
      apy: 7.4,
      backersCount: 2,
      revenueHistory: [18, 20, 22, 19, 21, 23, 20, 24, 22, 25, 23, 26, 24, 27, 25, 28, 26, 29, 27, 30, 28, 31, 29, 32, 30, 33, 31, 34, 32, 35],
      utilization: 38,
      totalBorrowed: 1_444,
      totalRevenueReceived: 640,
      frozen: false,
      availableLiquidity: 2_356,
      protocolFeeBps: 1000,
      withdrawalDelay: 86400,
      creditLineAddress: "0xdbb95d8aF780D73e441e922f3b9642a5C116629c",
    },
    riskLevel: "safe",
    badges: ["newcomer"],
    category: "Trading",
    avatarColor: "#3B82F6",
  },
  {
    ...MOCK_AGENTS[3],
    vault: {
      agentId: 1,
      vaultAddress: "0x0000000000000000000000000000000000000000",
      totalBacked: 2_900,
      availableCapacity: 1_100,
      cap: 4_000,
      apy: 11.6,
      backersCount: 2,
      revenueHistory: [12, 14, 16, 15, 17, 16, 18, 17, 19, 18, 20, 19, 21, 20, 22, 21, 23, 22, 24, 23, 25, 24, 26, 25, 27, 26, 28, 27, 29, 28],
      utilization: 72,
      totalBorrowed: 2_088,
      totalRevenueReceived: 480,
      frozen: false,
      availableLiquidity: 812,
      protocolFeeBps: 1000,
      withdrawalDelay: 86400,
      creditLineAddress: "0xdbb95d8aF780D73e441e922f3b9642a5C116629c",
    },
    riskLevel: "moderate",
    badges: [],
    category: "DeFi",
    avatarColor: "#059669",
  },
]

export const MOCK_PORTFOLIO: PortfolioSummary = {
  totalBacked: 2_500,
  totalYieldEarned: 146,
  activePositions: 2,
  avgApy: 12.0,
  positions: [
    {
      agentId: 3,
      agentName: "AutoTrader-v3",
      amount: 1_500,
      entryDate: 1774219207,
      yieldEarned: 92,
      currentApy: 14.2,
      riskLevel: "moderate",
      status: "active",
    },
    {
      agentId: 4,
      agentName: "AutoYield-Bot",
      amount: 1_000,
      entryDate: 1774220287,
      yieldEarned: 54,
      currentApy: 9.8,
      riskLevel: "safe",
      status: "active",
    },
  ],
}

export const MOCK_LEADERBOARD: LeaderboardEntry[] = [
  { rank: 1, agentId: 3, agentName: "AutoTrader-v3", apy: 14.2, revenue30d: 1_840, totalBacked: 5_200, backersCount: 3, riskLevel: "moderate", badges: ["top_earner", "smart_wallet"], trend: "up", trendDelta: 8 },
  { rank: 2, agentId: 4, agentName: "AutoYield-Bot", apy: 9.8, revenue30d: 920, totalBacked: 4_100, backersCount: 2, riskLevel: "safe", badges: ["consistent", "smart_wallet"], trend: "up", trendDelta: 4 },
  { rank: 3, agentId: 2, agentName: "Mateos-Arb-v1", apy: 7.4, revenue30d: 640, totalBacked: 3_800, backersCount: 2, riskLevel: "safe", badges: ["newcomer"], trend: "up", trendDelta: 3 },
  { rank: 4, agentId: 1, agentName: "Eliza-Keeper", apy: 11.6, revenue30d: 480, totalBacked: 2_900, backersCount: 2, riskLevel: "moderate", badges: [], trend: "stable", trendDelta: 0 },
]

export const MOCK_ACTIVITY_FEED: ActivityEvent[] = [
  { id: "evt-1", type: "revenue", agentId: 3, agentName: "AutoTrader-v3", amount: 82, message: "AutoTrader-v3 earned $82 from cross-DEX arb", timestamp: Date.now() / 1000 - 300 },
  { id: "evt-2", type: "backing", agentId: 4, agentName: "AutoYield-Bot", amount: 500, message: "0x3E28...f3B4 backed AutoYield-Bot with $500", timestamp: Date.now() / 1000 - 1200 },
  { id: "evt-3", type: "repayment", agentId: 3, agentName: "AutoTrader-v3", amount: 140, message: "AutoTrader-v3 repaid $140 via lockbox", timestamp: Date.now() / 1000 - 3600 },
  { id: "evt-4", type: "revenue", agentId: 4, agentName: "AutoYield-Bot", amount: 45, message: "AutoYield-Bot earned $45 from arb capture", timestamp: Date.now() / 1000 - 5400 },
  { id: "evt-5", type: "new_agent", agentId: 4, agentName: "AutoYield-Bot", message: "AutoYield-Bot registered on Base mainnet", timestamp: Date.now() / 1000 - 7200 },
  { id: "evt-6", type: "backing", agentId: 3, agentName: "AutoTrader-v3", amount: 1_000, message: "0x64D4...A94a backed AutoTrader-v3 with $1,000", timestamp: Date.now() / 1000 - 14400 },
  { id: "evt-7", type: "revenue", agentId: 1, agentName: "Eliza-Keeper", amount: 28, message: "Eliza-Keeper earned $28 from liquidation bounty", timestamp: Date.now() / 1000 - 18000 },
  { id: "evt-8", type: "repayment", agentId: 4, agentName: "AutoYield-Bot", amount: 65, message: "AutoYield-Bot repaid $65 on schedule", timestamp: Date.now() / 1000 - 28800 },
  { id: "evt-9", type: "revenue", agentId: 2, agentName: "Mateos-Arb-v1", amount: 32, message: "Mateos-Arb-v1 earned $32 from Mateos arb", timestamp: Date.now() / 1000 - 43200 },
  { id: "evt-10", type: "new_agent", agentId: 3, agentName: "AutoTrader-v3", message: "AutoTrader-v3 registered with vault + lockbox deployed", timestamp: Date.now() / 1000 - 57600 },
]

export const MOCK_GLOBAL_STATS: GlobalStats = {
  totalBacked: 16_000,
  activeAgents: 4,
  bestPerformerApy: 14.2,
  bestPerformerName: "AutoTrader-v3",
  biggestDefaultAmount: 0,
  biggestDefaultName: "",
  totalRevenue24h: 320,
  totalBackers: 9,
}

export const MOCK_BORROWER = {
  agentName: "AutoTrader-v3",
  erc8004Id: "8004-0003",
  creditLine: 5_500,
  availableCredit: 2_276,
  outstandingDebt: 3_224,
  interestRate: 8.5,
  lockboxRevenue: 1_840,
  lockboxBalance: 320,
  nextPayment: { amount: 140, dueDate: 1774305600 },
  repaymentSchedule: [
    { date: 1774305600, amount: 140, status: "upcoming" as const },
    { date: 1774910400, amount: 140, status: "upcoming" as const },
    { date: 1774219207, amount: 140, status: "paid" as const },
  ],
}

// ── Ticker messages for The Arena ────────────────────────────────────────────

export const MOCK_TICKER_MESSAGES: string[] = [
  "Protocol TVL reached $16K across 4 agents",
  "AutoTrader-v3 leading with 14.2% APY",
  "AutoYield-Bot completed 2nd repayment cycle",
  "2 agents with deployed vaults + lockboxes on Base",
  "Mateos-Arb-v1 vault pending deployment",
  "Average backer yield: 11.4%",
  "Zero defaults since protocol launch",
  "All agents using WDK smart wallets",
  "Contracts live on Base mainnet",
  "Base network gas: 0.001 gwei",
]
