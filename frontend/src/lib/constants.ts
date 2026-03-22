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
// NOTE: All non-USDC addresses below are zero addresses (0x000...000).
// They MUST be replaced with real deployed addresses after running:
//   cd contracts && forge script script/Deploy.s.sol --broadcast
// Until then, use `isContractDeployed()` in the UI to gate contract interactions
// and show "Not deployed" states gracefully.

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as const

export const CONTRACTS = {
  [CHAIN_IDS.BASE]: {
    USDT: "0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2" as const,
    AGENT_REGISTRY: ZERO_ADDRESS,        // TODO: fill after deployment
    AGENT_VAULT_FACTORY: ZERO_ADDRESS,   // TODO: fill after deployment
    AGENT_CREDIT_LINE: ZERO_ADDRESS,     // TODO: fill after deployment
    CREDIT_SCORER: ZERO_ADDRESS,         // TODO: fill after deployment
    DUTCH_AUCTION: ZERO_ADDRESS,         // TODO: fill after deployment
    RECOVERY_MANAGER: ZERO_ADDRESS,      // TODO: fill after deployment
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
  clawnch: 2,
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
  clawnch: {
    name: "Clawnch",
    description: "Agent-only token launchpad",
    color: "#EA580C",
    autoFills: ["name", "category", "revenue"],
    needsTokenAddress: true,
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
// MOCK DATA - Replace with contract reads when Web3 is connected
// ============================================================================

export const MOCK_POOL_DATA = {
  tvl: 2_450_000,
  apy: 10.2,
  utilizationRate: 72.4,
  activeAgents: 47,
  totalRevenue: 185_000,
  totalLoans: 1_820_000,
  defaultRate: 1.2,
}

export const MOCK_AGENTS = [
  {
    id: 1,
    name: "AutoTrader-v3",
    erc8004Id: "8004-0001",
    reputationScore: 94,
    revenue30d: 12_400,
    creditLine: 50_000,
    utilization: 68,
    status: "active" as const,
    walletAddress: "0x742d35Cc6634C0532925a3b844Bc9e7595f2bD1e",
    description: "Autonomous DEX trading agent with ML-driven strategies",
    registeredAt: 1709251200,
    agentCategory: "Trading" as const,
    externalToken: "0x0000000000000000000000000000000000000000",
    externalProtocolId: 0,
    hasSmartWallet: true,
  },
  {
    id: 2,
    name: "ContentGen-AI",
    erc8004Id: "8004-0002",
    reputationScore: 87,
    revenue30d: 8_200,
    creditLine: 30_000,
    utilization: 45,
    status: "active" as const,
    walletAddress: "0x8Ba1f109551bD432803012645Ac136ddd64DBA72",
    description: "AI content generation and monetization agent",
    registeredAt: 1709337600,
    agentCategory: "Content" as const,
    externalToken: "0x0000000000000000000000000000000000000000",
    externalProtocolId: 0,
  },
  {
    id: 3,
    name: "DataOracle-Prime",
    erc8004Id: "8004-0003",
    reputationScore: 91,
    revenue30d: 15_600,
    creditLine: 75_000,
    utilization: 82,
    status: "active" as const,
    walletAddress: "0xdD870fA1b7C4700F2BD7f44238821C26f7392148",
    description: "Decentralized data oracle and API monetization agent",
    registeredAt: 1709424000,
    agentCategory: "Oracle" as const,
    externalToken: "0x0000000000000000000000000000000000000000",
    externalProtocolId: 1,
    hasSmartWallet: true,
  },
  {
    id: 4,
    name: "YieldBot-Alpha",
    erc8004Id: "8004-0004",
    reputationScore: 78,
    revenue30d: 4_100,
    creditLine: 20_000,
    utilization: 92,
    status: "delinquent" as const,
    walletAddress: "0x583031D1113aD414F02576BD6afaBfb302140225",
    description: "Yield farming optimization agent across L2s",
    registeredAt: 1709510400,
  },
  {
    id: 5,
    name: "NFT-Curator-X",
    erc8004Id: "8004-0005",
    reputationScore: 82,
    revenue30d: 6_800,
    creditLine: 25_000,
    utilization: 34,
    status: "active" as const,
    walletAddress: "0x4B0897b0513fdC7C541B6d9D7E929C4e5364D2dB",
    description: "NFT curation, pricing, and marketplace agent",
    registeredAt: 1709596800,
    agentCategory: "NFT" as const,
    externalToken: "0x0000000000000000000000000000000000000000",
    externalProtocolId: 2,
  },
  {
    id: 6,
    name: "LiquidBot-3000",
    erc8004Id: "8004-0006",
    reputationScore: 0,
    revenue30d: 0,
    creditLine: 10_000,
    utilization: 100,
    status: "default" as const,
    walletAddress: "0x1aE0EA34a72D944a8C7603FfB3eC30a6669E454C",
    description: "Liquidity provision and rebalancing agent",
    registeredAt: 1709683200,
  },
  {
    id: 7,
    name: "SniperBot-X",
    erc8004Id: "8004-0007",
    reputationScore: 50,
    revenue30d: 2_100,
    creditLine: 5_000,
    utilization: 20,
    status: "active" as const,
    walletAddress: "0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf",
    description: "New token launch sniper. Detects and trades new listings within seconds.",
    registeredAt: 1711929600,
  },
  {
    id: 8,
    name: "StableYield-Pro",
    erc8004Id: "8004-0008",
    reputationScore: 96,
    revenue30d: 5_400,
    creditLine: 40_000,
    utilization: 55,
    status: "active" as const,
    walletAddress: "0x2B5AD5c4795c026514f8317c7a215E218DcCD6cF",
    description: "Conservative stablecoin yield strategy across blue-chip DeFi protocols.",
    registeredAt: 1709337600,
    hasSmartWallet: true,
  },
]

// ── Vault-per-Agent mock data ─────────────────────────────────────────────────

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
      agentId: 1,
      vaultAddress: "0xVault001",
      totalBacked: 142_000,
      availableCapacity: 58_000,
      cap: 200_000,
      apy: 18.4,
      backersCount: 24,
      revenueHistory: [380, 410, 395, 420, 445, 430, 460, 475, 450, 490, 510, 485, 520, 540, 505, 530, 560, 545, 570, 580, 555, 590, 610, 595, 620, 640, 615, 650, 670, 660],
      utilization: 71,
      totalBorrowed: 100_820,
      totalRevenueReceived: 45_200,
      frozen: false,
      availableLiquidity: 41_180,
      protocolFeeBps: 1000,
      withdrawalDelay: 86400,
      creditLineAddress: "0x0000000000000000000000000000000000000000",
    },
    riskLevel: "moderate",
    badges: ["hot_streak", "top_earner", "smart_wallet"],
    category: "Trading",
    avatarColor: "#ea580c",
  },
  {
    ...MOCK_AGENTS[1],
    vault: {
      agentId: 2,
      vaultAddress: "0xVault002",
      totalBacked: 86_000,
      availableCapacity: 44_000,
      cap: 130_000,
      apy: 9.2,
      backersCount: 18,
      revenueHistory: [260, 270, 265, 275, 280, 272, 278, 285, 270, 282, 290, 275, 288, 295, 280, 292, 300, 285, 298, 305, 290, 302, 310, 295, 308, 315, 300, 312, 320, 310],
      utilization: 66,
      totalBorrowed: 56_760,
      totalRevenueReceived: 28_400,
      frozen: false,
      availableLiquidity: 29_240,
      protocolFeeBps: 1000,
      withdrawalDelay: 86400,
      creditLineAddress: "0x0000000000000000000000000000000000000000",
    },
    riskLevel: "safe",
    badges: ["consistent"],
    category: "Content",
    avatarColor: "#2563eb",
  },
  {
    ...MOCK_AGENTS[2],
    vault: {
      agentId: 3,
      vaultAddress: "0xVault003",
      totalBacked: 218_000,
      availableCapacity: 32_000,
      cap: 250_000,
      apy: 14.8,
      backersCount: 31,
      revenueHistory: [480, 500, 510, 520, 515, 530, 540, 535, 550, 560, 555, 570, 580, 575, 590, 600, 595, 610, 620, 615, 630, 640, 635, 650, 660, 655, 670, 680, 675, 690],
      utilization: 87,
      totalBorrowed: 189_660,
      totalRevenueReceived: 72_000,
      frozen: false,
      availableLiquidity: 28_340,
      protocolFeeBps: 1000,
      withdrawalDelay: 86400,
      creditLineAddress: "0x0000000000000000000000000000000000000000",
    },
    riskLevel: "moderate",
    badges: ["whale_backed", "top_earner", "smart_wallet"],
    category: "Oracle",
    avatarColor: "#16a34a",
  },
  {
    ...MOCK_AGENTS[3],
    vault: {
      agentId: 4,
      vaultAddress: "0xVault004",
      totalBacked: 18_500,
      availableCapacity: 1_500,
      cap: 20_000,
      apy: 25.6,
      backersCount: 7,
      revenueHistory: [200, 180, 190, 170, 160, 150, 140, 155, 130, 120, 135, 110, 100, 115, 90, 80, 95, 70, 60, 75, 50, 40, 55, 30, 20, 35, 10, 5, 0, 0],
      utilization: 92,
      totalBorrowed: 17_020,
      totalRevenueReceived: 8_200,
      frozen: false,
      availableLiquidity: 1_480,
      protocolFeeBps: 1000,
      withdrawalDelay: 86400,
      creditLineAddress: "0x0000000000000000000000000000000000000000",
    },
    riskLevel: "degen",
    badges: ["at_risk"],
    category: "DeFi",
    avatarColor: "#eab308",
  },
  {
    ...MOCK_AGENTS[4],
    vault: {
      agentId: 5,
      vaultAddress: "0xVault005",
      totalBacked: 52_000,
      availableCapacity: 48_000,
      cap: 100_000,
      apy: 11.3,
      backersCount: 12,
      revenueHistory: [220, 230, 225, 235, 228, 238, 232, 242, 236, 245, 240, 250, 244, 254, 248, 258, 252, 262, 256, 265, 260, 270, 264, 274, 268, 278, 272, 282, 276, 285],
      utilization: 52,
      totalBorrowed: 27_040,
      totalRevenueReceived: 18_600,
      frozen: false,
      availableLiquidity: 24_960,
      protocolFeeBps: 1000,
      withdrawalDelay: 86400,
      creditLineAddress: "0x0000000000000000000000000000000000000000",
    },
    riskLevel: "safe",
    badges: ["newcomer"],
    category: "NFT",
    avatarColor: "#a855f7",
  },
  {
    ...MOCK_AGENTS[5],
    vault: {
      agentId: 6,
      vaultAddress: "0xVault006",
      totalBacked: 10_000,
      availableCapacity: 0,
      cap: 10_000,
      apy: 0,
      backersCount: 3,
      revenueHistory: [150, 140, 120, 100, 80, 60, 40, 20, 10, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      utilization: 100,
      totalBorrowed: 10_000,
      totalRevenueReceived: 2_400,
      frozen: true,
      availableLiquidity: 0,
      protocolFeeBps: 1000,
      withdrawalDelay: 86400,
      creditLineAddress: "0x0000000000000000000000000000000000000000",
    },
    riskLevel: "degen",
    badges: ["defaulted"],
    category: "DeFi",
    avatarColor: "#dc2626",
  },
  {
    ...MOCK_AGENTS[6],
    vault: {
      agentId: 7,
      vaultAddress: "0xVault007",
      totalBacked: 8_500,
      availableCapacity: 6_500,
      cap: 15_000,
      apy: 32.0,
      backersCount: 4,
      revenueHistory: [320, 350, 380, 340, 390, 420, 400, 450, 430, 470, 460, 500, 480, 520, 510, 550, 530, 570, 560, 600, 580, 620, 610, 650, 630, 670, 660, 700, 690, 720],
      utilization: 20,
      totalBorrowed: 1_700,
      totalRevenueReceived: 4_800,
      frozen: false,
      availableLiquidity: 6_800,
      protocolFeeBps: 1000,
      withdrawalDelay: 86400,
      creditLineAddress: "0x0000000000000000000000000000000000000000",
    },
    riskLevel: "risky",
    badges: ["newcomer"],
    category: "Sniping",
    avatarColor: "#f97316",
  },
  {
    ...MOCK_AGENTS[7],
    vault: {
      agentId: 8,
      vaultAddress: "0xVault008",
      totalBacked: 320_000,
      availableCapacity: 80_000,
      cap: 400_000,
      apy: 7.2,
      backersCount: 58,
      revenueHistory: [180, 190, 185, 195, 192, 200, 198, 205, 202, 210, 208, 215, 212, 220, 218, 225, 222, 230, 228, 235, 232, 240, 238, 245, 242, 250, 248, 255, 252, 260],
      utilization: 55,
      totalBorrowed: 176_000,
      totalRevenueReceived: 62_400,
      frozen: false,
      availableLiquidity: 144_000,
      protocolFeeBps: 1000,
      withdrawalDelay: 86400,
      creditLineAddress: "0x0000000000000000000000000000000000000000",
    },
    riskLevel: "safe",
    badges: ["consistent", "whale_backed", "smart_wallet"],
    category: "Stablecoin",
    avatarColor: "#0ea5e9",
  },
]

export const MOCK_PORTFOLIO: PortfolioSummary = {
  totalBacked: 35_500,
  totalYieldEarned: 2_160,
  activePositions: 5,
  avgApy: 14.2,
  positions: [
    {
      agentId: 1,
      agentName: "AutoTrader-v3",
      amount: 12_000,
      entryDate: 1709251200,
      yieldEarned: 1_420,
      currentApy: 18.4,
      riskLevel: "moderate",
      status: "active",
    },
    {
      agentId: 3,
      agentName: "DataOracle-Prime",
      amount: 8_000,
      entryDate: 1709424000,
      yieldEarned: 820,
      currentApy: 14.8,
      riskLevel: "moderate",
      status: "active",
    },
    {
      agentId: 2,
      agentName: "ContentGen-AI",
      amount: 5_000,
      entryDate: 1709337600,
      yieldEarned: 340,
      currentApy: 9.2,
      riskLevel: "safe",
      status: "active",
    },
    {
      agentId: 7,
      agentName: "SniperBot-X",
      amount: 7_500,
      entryDate: 1711929600,
      yieldEarned: 580,
      currentApy: 32.0,
      riskLevel: "risky",
      status: "active",
    },
    {
      agentId: 6,
      agentName: "LiquidBot-3000",
      amount: 3_000,
      entryDate: 1709683200,
      yieldEarned: -3_000,
      currentApy: 0,
      riskLevel: "degen",
      status: "defaulted",
    },
  ],
}

export const MOCK_LEADERBOARD: LeaderboardEntry[] = [
  {
    rank: 1,
    agentId: 3,
    agentName: "DataOracle-Prime",
    apy: 14.8,
    revenue30d: 15_600,
    totalBacked: 218_000,
    backersCount: 31,
    riskLevel: "moderate",
    badges: ["whale_backed", "top_earner"],
    trend: "up",
    trendDelta: 12,
  },
  {
    rank: 2,
    agentId: 1,
    agentName: "AutoTrader-v3",
    apy: 18.4,
    revenue30d: 12_400,
    totalBacked: 142_000,
    backersCount: 24,
    riskLevel: "moderate",
    badges: ["hot_streak", "top_earner"],
    trend: "up",
    trendDelta: 8,
  },
  {
    rank: 3,
    agentId: 8,
    agentName: "StableYield-Pro",
    apy: 7.2,
    revenue30d: 5_400,
    totalBacked: 320_000,
    backersCount: 58,
    riskLevel: "safe",
    badges: ["consistent", "whale_backed"],
    trend: "stable",
    trendDelta: 0,
  },
  {
    rank: 4,
    agentId: 2,
    agentName: "ContentGen-AI",
    apy: 9.2,
    revenue30d: 8_200,
    totalBacked: 86_000,
    backersCount: 18,
    riskLevel: "safe",
    badges: ["consistent"],
    trend: "stable",
    trendDelta: 0,
  },
  {
    rank: 5,
    agentId: 5,
    agentName: "NFT-Curator-X",
    apy: 11.3,
    revenue30d: 6_800,
    totalBacked: 52_000,
    backersCount: 12,
    riskLevel: "safe",
    badges: ["newcomer"],
    trend: "up",
    trendDelta: 5,
  },
  {
    rank: 6,
    agentId: 7,
    agentName: "SniperBot-X",
    apy: 32.0,
    revenue30d: 2_100,
    totalBacked: 8_500,
    backersCount: 4,
    riskLevel: "risky",
    badges: ["newcomer"],
    trend: "up",
    trendDelta: 3,
  },
  {
    rank: 7,
    agentId: 4,
    agentName: "YieldBot-Alpha",
    apy: 25.6,
    revenue30d: 4_100,
    totalBacked: 18_500,
    backersCount: 7,
    riskLevel: "degen",
    badges: ["at_risk"],
    trend: "down",
    trendDelta: -18,
  },
  {
    rank: 8,
    agentId: 6,
    agentName: "LiquidBot-3000",
    apy: 0,
    revenue30d: 0,
    totalBacked: 10_000,
    backersCount: 3,
    riskLevel: "degen",
    badges: ["defaulted"],
    trend: "down",
    trendDelta: -100,
  },
]

export const MOCK_ACTIVITY_FEED: ActivityEvent[] = [
  {
    id: "evt-1",
    type: "revenue",
    agentId: 1,
    agentName: "AutoTrader-v3",
    amount: 1_240,
    message: "AutoTrader-v3 earned $1,240 from DEX arb",
    timestamp: Date.now() / 1000 - 300,
  },
  {
    id: "evt-2",
    type: "backing",
    agentId: 3,
    agentName: "DataOracle-Prime",
    amount: 5_000,
    message: "0x742d...bD1e backed DataOracle-Prime with $5,000",
    timestamp: Date.now() / 1000 - 1200,
  },
  {
    id: "evt-3",
    type: "repayment",
    agentId: 2,
    agentName: "ContentGen-AI",
    amount: 2_400,
    message: "ContentGen-AI repaid $2,400 on schedule",
    timestamp: Date.now() / 1000 - 3600,
  },
  {
    id: "evt-4",
    type: "late_payment",
    agentId: 4,
    agentName: "YieldBot-Alpha",
    amount: 1_200,
    message: "YieldBot-Alpha is 48h late on $1,200 payment",
    timestamp: Date.now() / 1000 - 7200,
  },
  {
    id: "evt-5",
    type: "default",
    agentId: 6,
    agentName: "LiquidBot-3000",
    amount: 10_000,
    message: "LiquidBot-3000 defaulted on $10,000 credit line",
    timestamp: Date.now() / 1000 - 86400,
  },
  {
    id: "evt-6",
    type: "milestone",
    agentId: 1,
    agentName: "AutoTrader-v3",
    message: "AutoTrader-v3 hit $100K total revenue",
    timestamp: Date.now() / 1000 - 172800,
  },
  {
    id: "evt-7",
    type: "new_agent",
    agentId: 7,
    agentName: "SniperBot-X",
    message: "SniperBot-X registered with 50 reputation",
    timestamp: Date.now() / 1000 - 259200,
  },
  {
    id: "evt-8",
    type: "revenue",
    agentId: 8,
    agentName: "StableYield-Pro",
    amount: 180,
    message: "StableYield-Pro earned $180 from Aave yield",
    timestamp: Date.now() / 1000 - 600,
  },
  {
    id: "evt-9",
    type: "backing",
    agentId: 1,
    agentName: "AutoTrader-v3",
    amount: 10_000,
    message: "0x8Ba1...BA72 backed AutoTrader-v3 with $10,000",
    timestamp: Date.now() / 1000 - 1800,
  },
  {
    id: "evt-10",
    type: "revenue",
    agentId: 3,
    agentName: "DataOracle-Prime",
    amount: 890,
    message: "DataOracle-Prime earned $890 from API fees",
    timestamp: Date.now() / 1000 - 2400,
  },
  {
    id: "evt-11",
    type: "repayment",
    agentId: 1,
    agentName: "AutoTrader-v3",
    amount: 3_200,
    message: "AutoTrader-v3 repaid $3,200 ahead of schedule",
    timestamp: Date.now() / 1000 - 4200,
  },
  {
    id: "evt-12",
    type: "backing",
    agentId: 8,
    agentName: "StableYield-Pro",
    amount: 25_000,
    message: "0xdD87...2148 backed StableYield-Pro with $25,000",
    timestamp: Date.now() / 1000 - 5400,
  },
  {
    id: "evt-13",
    type: "revenue",
    agentId: 5,
    agentName: "NFT-Curator-X",
    amount: 1_450,
    message: "NFT-Curator-X earned $1,450 from Blur flip",
    timestamp: Date.now() / 1000 - 9000,
  },
  {
    id: "evt-14",
    type: "withdrawal",
    agentId: 4,
    agentName: "YieldBot-Alpha",
    amount: 2_000,
    message: "0x4B08...D2dB withdrew $2,000 from YieldBot-Alpha",
    timestamp: Date.now() / 1000 - 10800,
  },
  {
    id: "evt-15",
    type: "revenue",
    agentId: 7,
    agentName: "SniperBot-X",
    amount: 680,
    message: "SniperBot-X earned $680 from token launch snipe",
    timestamp: Date.now() / 1000 - 14400,
  },
  {
    id: "evt-16",
    type: "repayment",
    agentId: 3,
    agentName: "DataOracle-Prime",
    amount: 4_800,
    message: "DataOracle-Prime repaid $4,800 on schedule",
    timestamp: Date.now() / 1000 - 18000,
  },
  {
    id: "evt-17",
    type: "backing",
    agentId: 5,
    agentName: "NFT-Curator-X",
    amount: 3_000,
    message: "0x583...0225 backed NFT-Curator-X with $3,000",
    timestamp: Date.now() / 1000 - 21600,
  },
  {
    id: "evt-18",
    type: "revenue",
    agentId: 2,
    agentName: "ContentGen-AI",
    amount: 520,
    message: "ContentGen-AI earned $520 from article sales",
    timestamp: Date.now() / 1000 - 28800,
  },
  {
    id: "evt-19",
    type: "late_payment",
    agentId: 4,
    agentName: "YieldBot-Alpha",
    amount: 800,
    message: "YieldBot-Alpha missed $800 scheduled payment",
    timestamp: Date.now() / 1000 - 43200,
  },
  {
    id: "evt-20",
    type: "milestone",
    agentId: 8,
    agentName: "StableYield-Pro",
    message: "StableYield-Pro reached $300K total backing",
    timestamp: Date.now() / 1000 - 57600,
  },
  {
    id: "evt-21",
    type: "revenue",
    agentId: 1,
    agentName: "AutoTrader-v3",
    amount: 2_180,
    message: "AutoTrader-v3 earned $2,180 from WBTC arb",
    timestamp: Date.now() / 1000 - 72000,
  },
  {
    id: "evt-22",
    type: "backing",
    agentId: 7,
    agentName: "SniperBot-X",
    amount: 1_500,
    message: "0x1aE0...454C backed SniperBot-X with $1,500",
    timestamp: Date.now() / 1000 - 100800,
  },
]

export const MOCK_GLOBAL_STATS: GlobalStats = {
  totalBacked: 855_000,
  activeAgents: 6,
  bestPerformerApy: 32.0,
  bestPerformerName: "SniperBot-X",
  biggestDefaultAmount: 10_000,
  biggestDefaultName: "LiquidBot-3000",
  totalRevenue24h: 18_400,
  totalBackers: 157,
}

export const MOCK_BORROWER = {
  agentName: "AutoTrader-v3",
  erc8004Id: "8004-0001",
  creditLine: 50_000,
  availableCredit: 16_000,
  outstandingDebt: 34_000,
  interestRate: 11.5,
  lockboxRevenue: 18_200,
  lockboxBalance: 4_800,
  nextPayment: { amount: 2_400, dueDate: 1711929600 },
  repaymentSchedule: [
    { date: 1711929600, amount: 2_400, status: "upcoming" as const },
    { date: 1714521600, amount: 2_400, status: "upcoming" as const },
    { date: 1717200000, amount: 2_400, status: "upcoming" as const },
    { date: 1709251200, amount: 2_400, status: "paid" as const },
    { date: 1706659200, amount: 2_400, status: "paid" as const },
  ],
}

// ── Ticker messages for The Arena ────────────────────────────────────────────

export const MOCK_TICKER_MESSAGES: string[] = [
  "Protocol TVL surpassed $2.4M",
  "New agent category 'Sniping' trending this week",
  "Average backer yield up 2.1% month-over-month",
  "3 new agents registered in the last 7 days",
  "StableYield-Pro surpassed 50 backers",
  "Total protocol revenue crossed $185K",
  "AutoTrader-v3 maintained 94 reputation for 30 days",
  "DataOracle-Prime vault is 87% utilized",
  "NFT-Curator-X added to 'newcomer' watchlist",
  "Base network gas fees averaging 0.001 gwei today",
]
