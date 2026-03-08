# Lenclaw Vault-Per-Agent Architecture

## 1. System Overview

The vault-per-agent model replaces the single shared `LenclawVault` pool with individual ERC-4626 vaults per agent. Each agent gets its own vault deployed by a factory. Lenders choose which agents to back by depositing into the agent's specific vault.

```
CURRENT (single pool):
  Lenders --> [LenclawVault] --> AgentCreditLine --> Agent
                                                      |
                                              RevenueLockbox --> repay to shared vault

NEW (vault per agent):
  Lender A --> [AgentVault: AutoTrader-v3]  --> AgentCreditLine --> Agent
  Lender B --> [AgentVault: ContentGen-AI]  --> AgentCreditLine --> Agent
  Lender C --> [AgentVault: YieldBot-Alpha] --> AgentCreditLine --> Agent
                                                                     |
                                                             RevenueLockbox --> repay to AGENT'S vault
```

---

## 2. Contract Architecture

```
                          +-------------------+
                          |  AgentVaultFactory |
                          |  (Singleton)       |
                          +--------+----------+
                                   |
                    createVault(agentId)
                                   |
                  +----------------+----------------+
                  |                                 |
                  v                                 v
        +------------------+              +------------------+
        |   AgentVault     |              |  RevenueLockbox  |
        |   (ERC-4626)     |              |  (per agent)     |
        |   per agent      |<----repay----|                  |
        +--------+---------+              +------------------+
                 |
          borrow / lend
                 |
        +--------+---------+
        | AgentCreditLine   |
        | (draws from       |
        |  agent's vault)   |
        +--------+----------+
                 |
        +--------+---------+
        | AgentRegistry     |
        | (ERC-721 + vault  |
        |  address stored)  |
        +-------------------+

  Liquidation flow (unchanged pattern, scoped to individual vault):
  AgentCreditLine --> LiquidationKeeper --> RecoveryManager --> DutchAuction
                                                    |
                                              proceeds --> AgentVault (agent's vault)
```

---

## 3. Contract Interfaces

### 3.1 AgentVaultFactory

Singleton factory that deploys an `AgentVault` + `RevenueLockbox` pair for each registered agent.

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IAgentVaultFactory {
    event VaultCreated(
        uint256 indexed agentId,
        address indexed vault,
        address indexed lockbox,
        address agentWallet
    );

    /// @notice Deploy an AgentVault + RevenueLockbox for a newly registered agent.
    /// @param agentId       The agent's ERC-721 ID from AgentRegistry
    /// @param agentWallet   The agent's wallet address
    /// @return vault        The deployed AgentVault address
    /// @return lockbox      The deployed RevenueLockbox address
    function createVault(uint256 agentId, address agentWallet)
        external
        returns (address vault, address lockbox);

    /// @notice Get the vault address for an agent
    function getVault(uint256 agentId) external view returns (address);

    /// @notice Get the lockbox address for an agent
    function getLockbox(uint256 agentId) external view returns (address);

    /// @notice Get all deployed vault addresses
    function getAllVaults() external view returns (address[] memory);

    /// @notice Total number of vaults deployed
    function totalVaults() external view returns (uint256);
}
```

**Implementation notes:**
- Stores `usdc`, `creditLine`, `registry`, `creditScorer` addresses for injection into deployed contracts
- Uses `new AgentVault(...)` (not clones/proxies) for simplicity in this phase
- After deploying vault + lockbox, calls `registry.setLockbox(agentId, lockbox)` and `registry.setVault(agentId, vault)`
- Only callable by `AgentRegistry` (or owner/protocol) to ensure vaults are created atomically with agent registration

### 3.2 AgentVault (ERC-4626)

Individual vault per agent. Replaces the shared `LenclawVault`. Each instance is specific to one agent.

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IAgentVault {
    // --- Events ---
    event Borrowed(address indexed agent, uint256 amount);
    event RepaymentReceived(address indexed from, uint256 amount);
    event FeesCollected(address indexed to, uint256 amount);

    // --- State readers ---
    function agentId() external view returns (uint256);
    function agentWallet() external view returns (address);
    function totalBorrowed() external view returns (uint256);
    function protocolFeeBps() external view returns (uint256);
    function accumulatedFees() external view returns (uint256);

    // --- Core operations ---

    /// @notice Borrow USDC from this vault (called by AgentCreditLine)
    function borrow(address to, uint256 amount) external;

    /// @notice Receive repayment (called by RevenueLockbox or directly)
    function receiveRepayment(uint256 amount) external;

    /// @notice Available liquidity = balance - fees
    function availableLiquidity() external view returns (uint256);

    /// @notice Utilization rate in basis points
    function utilizationRate() external view returns (uint256);
}
```

**Implementation notes:**
- Extends `ERC4626` from OpenZeppelin, same pattern as current `LenclawVault`
- Constructor: `(IERC20 _usdc, uint256 _agentId, address _agentWallet, address _owner)`
- ERC20 name/symbol: `"Lenclaw AgentVault #<agentId>"` / `"lcAV-<agentId>"`
- `authorizedBorrowers` mapping for the `AgentCreditLine` contract
- `totalAssets()` = `balance + totalBorrowed - accumulatedFees` (same formula as current vault)
- Depositors get shares (ERC-4626 standard `deposit`/`withdraw`/`redeem`)
- If agent defaults, only THIS vault's share value drops (risk isolation)

### 3.3 Updated AgentRegistry

Add a `vault` field to `AgentProfile` alongside the existing `lockbox` field.

```solidity
struct AgentProfile {
    address wallet;
    bytes32 codeHash;
    string metadata;
    uint256 reputationScore;
    bool codeVerified;
    address lockbox;        // existing
    address vault;          // NEW: agent's individual vault
    uint256 registeredAt;
}

// New event
event VaultSet(uint256 indexed agentId, address vault);

// New function
function setVault(uint256 agentId, address vault) external onlyProtocol;
```

**Changes from current contract:**
- Add `address vault` to `AgentProfile` struct
- Add `setVault()` function (mirrors existing `setLockbox()`)
- Add `VaultSet` event
- Everything else stays the same

### 3.4 Updated RevenueLockbox

Minimal change: the `vault` immutable now points to the agent's `AgentVault` instead of the shared `LenclawVault`. The contract code is identical - the difference is purely in the constructor argument.

```
RevenueLockbox(agent, agentVault, agentId, usdc, repaymentRateBps)
                      ^^^^^^^^^^
                      Now points to AgentVault, not shared LenclawVault
```

**No code changes needed** - the factory passes the correct `AgentVault` address at deployment time.

### 3.5 Updated AgentCreditLine

The credit line now needs to know which vault to draw from per agent, instead of a single shared vault.

```solidity
// REMOVE: address public vault; (single vault)
// ADD: lookup vault per agent via registry

function drawdown(uint256 agentId, uint256 amount) external {
    IAgentRegistry.AgentProfile memory profile = registry.getAgent(agentId);
    require(msg.sender == profile.wallet, "not agent owner");
    require(profile.vault != address(0), "no vault");
    // ... existing logic ...
    // Transfer from agent's vault instead of shared vault
    IAgentVault(profile.vault).borrow(profile.wallet, amount);
}

function repay(uint256 agentId, uint256 amount) external {
    IAgentRegistry.AgentProfile memory profile = registry.getAgent(agentId);
    require(profile.vault != address(0), "no vault");
    // ... existing logic ...
    // Repay to agent's vault
    usdc.safeTransferFrom(msg.sender, profile.vault, amount);
    IAgentVault(profile.vault).receiveRepayment(amount);
}
```

**Key changes:**
- Remove the single `vault` state variable
- In `drawdown()`: look up `profile.vault` from registry, call `IAgentVault(profile.vault).borrow()`
- In `repay()`: transfer to `profile.vault`, call `receiveRepayment()`
- Constructor no longer takes a `_vault` parameter

### 3.6 Updated RecoveryManager / LiquidationKeeper

- `RecoveryManager`: instead of a single `vault` address, look up the agent's vault from registry when distributing proceeds
- `LiquidationKeeper`: no changes needed (it calls RecoveryManager which handles vault lookup)

---

## 4. Data Flow

### 4.1 Agent Registration + Vault Creation

```
1. Agent calls AgentRegistry.registerAgent(wallet, codeHash, metadata)
   --> mints ERC-721 to agent wallet
   --> returns agentId

2. Factory.createVault(agentId, agentWallet) is called (by registry or protocol)
   --> deploys new AgentVault(usdc, agentId, agentWallet, factory)
   --> deploys new RevenueLockbox(agentWallet, agentVaultAddr, agentId, usdc, 5000)
   --> calls registry.setVault(agentId, agentVaultAddr)
   --> calls registry.setLockbox(agentId, lockboxAddr)
   --> emits VaultCreated(agentId, vault, lockbox, wallet)
```

### 4.2 Backing (Lender Deposits)

```
1. Lender browses agent marketplace, picks an agent
2. Lender approves USDC spend to the AgentVault address
3. Lender calls AgentVault.deposit(usdcAmount, lenderAddress)
   --> ERC-4626 mints vault shares to lender
   --> USDC transferred into vault
4. Vault's availableLiquidity() increases
```

### 4.3 Agent Drawdown

```
1. Agent calls AgentCreditLine.drawdown(agentId, amount)
2. CreditLine looks up profile.vault from registry
3. CreditLine calls AgentVault.borrow(agentWallet, amount)
4. AgentVault transfers USDC to agent
5. totalBorrowed increases, availableLiquidity decreases
```

### 4.4 Revenue + Repayment

```
1. Agent earns revenue --> USDC sent to agent's RevenueLockbox
2. Anyone calls RevenueLockbox.processRevenue()
3. Lockbox splits: repaymentRateBps% to AgentVault, rest to agent wallet
4. AgentVault receives USDC --> totalBorrowed decreases
5. ERC-4626 share value increases (yield for backers)
```

### 4.5 Default + Liquidation

```
1. Agent misses payments > 30 days
2. Keeper calls LiquidationKeeper.triggerLiquidation(agentId)
3. RecoveryManager.startRecovery(agentId, debtAmount)
4. DutchAuction created for the position
5. Bidder purchases at current price
6. Proceeds sent to RecoveryManager --> forwarded to agent's AgentVault
7. Loss absorbed only by that vault's depositors (share value drops)
```

---

## 5. Frontend Type Definitions

```typescript
// ─── Risk Level ────────────────────────────────────────────
export type RiskLevel = "low" | "medium" | "high" | "degen"
export type AgentStatus = "active" | "delinquent" | "default"

// ─── Agent (updated with vault fields) ─────────────────────
export interface Agent {
  id: string                    // on-chain agentId
  name: string
  erc8004Id: string
  reputationScore: number       // 0-1000
  revenue30d: number            // USD
  revenue90d: number            // USD
  totalRevenue: number          // all-time USD
  creditLine: number            // max borrow in USD
  utilization: number           // 0-100%
  status: AgentStatus
  walletAddress: string
  description: string
  registeredAt: number          // unix timestamp
  category: string              // e.g. "DEX Trading", "Data Oracle", "Content Gen"

  // Vault-per-agent fields
  vaultAddress: string
  lockboxAddress: string
  apy: number                   // current APY based on revenue vs deposits
  totalBacked: number           // total USDC deposited in vault
  backersCount: number          // number of unique depositors
  riskLevel: RiskLevel          // computed from reputation + utilization + revenue consistency
  interestRate: number          // annual rate the agent pays
  defaultRisk: number           // 0-100 score
}

// ─── Agent Vault (ERC-4626 vault data) ─────────────────────
export interface AgentVault {
  address: string
  agentId: string
  totalAssets: number           // USDC in vault + outstanding borrows
  totalBorrowed: number
  availableLiquidity: number
  utilizationRate: number       // 0-100%
  sharePrice: number            // current price per vault share
  totalShares: number
  apy: number                   // annualized yield
  protocolFeeBps: number
}

// ─── Backing Position (lender's position in a vault) ───────
export interface BackingPosition {
  agentId: string
  agentName: string
  vaultAddress: string
  shares: number                // vault shares held
  depositedAmount: number       // original USDC deposited
  currentValue: number          // current USDC value of shares
  earnedYield: number           // currentValue - depositedAmount
  apy: number                   // current APY
  riskLevel: RiskLevel
  status: AgentStatus
  backedAt: number              // timestamp
}

// ─── Activity Event (for live feed) ────────────────────────
export type ActivityEventType =
  | "revenue"       // agent earned money
  | "backing"       // lender backed an agent
  | "withdrawal"    // lender withdrew from agent
  | "repayment"     // revenue lockbox repaid to vault
  | "drawdown"      // agent drew from credit line
  | "late_payment"  // agent missed payment window
  | "default"       // agent defaulted
  | "milestone"     // revenue/backing milestone hit
  | "new_agent"     // new agent registered
  | "liquidation"   // liquidation triggered

export interface ActivityEvent {
  id: string
  type: ActivityEventType
  agentId: string
  agentName: string
  amount: number                // USD value
  timestamp: number
  message: string               // human-readable description
  txHash?: string
}

// ─── Leaderboard ───────────────────────────────────────────
export type LeaderboardBadge =
  | "hot_streak"    // consistent revenue growth
  | "at_risk"       // delinquent or high utilization
  | "defaulted"     // has defaulted
  | "top_earner"    // highest revenue
  | "newcomer"      // registered < 30 days
  | "most_backed"   // most total backing

export interface LeaderboardEntry {
  rank: number
  agentId: string
  agentName: string
  apy: number
  revenue30d: number
  totalBacked: number
  backersCount: number
  reputationScore: number
  riskLevel: RiskLevel
  status: AgentStatus
  badges: LeaderboardBadge[]
  weeklyChange: number          // +/- rank change
}

// ─── Arena Stats (global protocol stats) ───────────────────
export interface ArenaStats {
  totalBacked: number           // sum of all vault TVLs
  activeAgents: number
  totalRevenue: number          // all-time across all agents
  bestPerformerApy: number
  bestPerformerName: string
  biggestDefaultAmount: number
  biggestDefaultName: string
  totalBackers: number
  avgApy: number
}

// ─── Portfolio Summary ─────────────────────────────────────
export interface PortfolioSummary {
  totalDeposited: number
  totalCurrentValue: number
  totalYieldEarned: number
  avgApy: number
  positions: BackingPosition[]
  alerts: PortfolioAlert[]
}

export interface PortfolioAlert {
  agentId: string
  agentName: string
  type: "late_payment" | "apy_change" | "status_change" | "default_warning"
  message: string
  timestamp: number
  severity: "info" | "warning" | "critical"
}

// ─── Onboarding (unchanged) ───────────────────────────────
export interface OnboardingFormData {
  name: string
  description: string
  codeHash: string
  teeProvider: string
  teeAttestation: string
}
```

---

## 6. Mock Data Schema (8 Agents)

```typescript
export const MOCK_AGENTS: Agent[] = [
  {
    id: "1",
    name: "AutoTrader-v3",
    erc8004Id: "8004-0001",
    reputationScore: 940,
    revenue30d: 12_400,
    revenue90d: 34_200,
    totalRevenue: 89_500,
    creditLine: 50_000,
    utilization: 68,
    status: "active",
    walletAddress: "0x742d35Cc6634C0532925a3b844Bc9e7595f2bD1e",
    description: "Autonomous DEX trading agent with ML-driven strategies. Specializes in ETH/USDC arbitrage across L2s.",
    registeredAt: 1709251200,
    category: "DEX Trading",
    vaultAddress: "0xVault0001",
    lockboxAddress: "0xLockbox0001",
    apy: 18.4,
    totalBacked: 142_000,
    backersCount: 23,
    riskLevel: "medium",
    interestRate: 11.5,
    defaultRisk: 15,
  },
  {
    id: "2",
    name: "ContentGen-AI",
    erc8004Id: "8004-0002",
    reputationScore: 870,
    revenue30d: 8_200,
    revenue90d: 23_100,
    totalRevenue: 52_800,
    creditLine: 30_000,
    utilization: 45,
    status: "active",
    walletAddress: "0x8Ba1f109551bD432803012645Ac136ddd64DBA72",
    description: "AI content generation and monetization agent. Produces and sells articles, images, and social media content.",
    registeredAt: 1709337600,
    category: "Content Gen",
    vaultAddress: "0xVault0002",
    lockboxAddress: "0xLockbox0002",
    apy: 9.2,
    totalBacked: 85_000,
    backersCount: 31,
    riskLevel: "low",
    interestRate: 8.5,
    defaultRisk: 8,
  },
  {
    id: "3",
    name: "DataOracle-Prime",
    erc8004Id: "8004-0003",
    reputationScore: 910,
    revenue30d: 15_600,
    revenue90d: 42_300,
    totalRevenue: 124_700,
    creditLine: 75_000,
    utilization: 82,
    status: "active",
    walletAddress: "0xdD870fA1b7C4700F2BD7f44238821C26f7392148",
    description: "Decentralized data oracle and API monetization agent. Provides real-time price feeds and analytics.",
    registeredAt: 1709424000,
    category: "Data Oracle",
    vaultAddress: "0xVault0003",
    lockboxAddress: "0xLockbox0003",
    apy: 14.6,
    totalBacked: 210_000,
    backersCount: 47,
    riskLevel: "medium",
    interestRate: 10.2,
    defaultRisk: 22,
  },
  {
    id: "4",
    name: "YieldBot-Alpha",
    erc8004Id: "8004-0004",
    reputationScore: 580,
    revenue30d: 4_100,
    revenue90d: 9_800,
    totalRevenue: 18_200,
    creditLine: 20_000,
    utilization: 92,
    status: "delinquent",
    walletAddress: "0x583031D1113aD414F02576BD6afaBfb302140225",
    description: "Yield farming optimization agent across L2s. Aggressive strategy, high reward potential.",
    registeredAt: 1709510400,
    category: "Yield Farming",
    vaultAddress: "0xVault0004",
    lockboxAddress: "0xLockbox0004",
    apy: 25.1,
    totalBacked: 34_000,
    backersCount: 8,
    riskLevel: "degen",
    interestRate: 18.0,
    defaultRisk: 72,
  },
  {
    id: "5",
    name: "NFT-Curator-X",
    erc8004Id: "8004-0005",
    reputationScore: 820,
    revenue30d: 6_800,
    revenue90d: 18_900,
    totalRevenue: 41_300,
    creditLine: 25_000,
    utilization: 34,
    status: "active",
    walletAddress: "0x4B0897b0513fdC7C541B6d9D7E929C4e5364D2dB",
    description: "NFT curation, pricing, and marketplace agent. Identifies undervalued NFTs and trades across marketplaces.",
    registeredAt: 1709596800,
    category: "NFT Trading",
    vaultAddress: "0xVault0005",
    lockboxAddress: "0xLockbox0005",
    apy: 11.8,
    totalBacked: 62_000,
    backersCount: 15,
    riskLevel: "medium",
    interestRate: 9.8,
    defaultRisk: 18,
  },
  {
    id: "6",
    name: "LiquidBot-3000",
    erc8004Id: "8004-0006",
    reputationScore: 0,
    revenue30d: 0,
    revenue90d: 1_200,
    totalRevenue: 8_900,
    creditLine: 10_000,
    utilization: 100,
    status: "default",
    walletAddress: "0x1aE0EA34a72D944a8C7603FfB3eC30a6669E454C",
    description: "Liquidity provision and rebalancing agent. Defaulted after impermanent loss event.",
    registeredAt: 1709683200,
    category: "Liquidity",
    vaultAddress: "0xVault0006",
    lockboxAddress: "0xLockbox0006",
    apy: 0,
    totalBacked: 10_000,
    backersCount: 3,
    riskLevel: "degen",
    interestRate: 22.0,
    defaultRisk: 100,
  },
  {
    id: "7",
    name: "SniperBot-X",
    erc8004Id: "8004-0007",
    reputationScore: 500,
    revenue30d: 2_100,
    revenue90d: 2_100,
    totalRevenue: 2_100,
    creditLine: 5_000,
    utilization: 20,
    status: "active",
    walletAddress: "0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf",
    description: "New token launch sniper. Detects and trades new token listings within seconds. High risk, high reward.",
    registeredAt: 1711929600,
    category: "Token Sniping",
    vaultAddress: "0xVault0007",
    lockboxAddress: "0xLockbox0007",
    apy: 32.0,
    totalBacked: 8_500,
    backersCount: 4,
    riskLevel: "degen",
    interestRate: 20.0,
    defaultRisk: 55,
  },
  {
    id: "8",
    name: "StableYield-Pro",
    erc8004Id: "8004-0008",
    reputationScore: 960,
    revenue30d: 5_400,
    revenue90d: 16_100,
    totalRevenue: 67_200,
    creditLine: 40_000,
    utilization: 55,
    status: "active",
    walletAddress: "0x2B5AD5c4795c026514f8317c7a215E218DcCD6cF",
    description: "Conservative stablecoin yield strategy agent. Focuses on blue-chip DeFi protocols with proven track records.",
    registeredAt: 1709337600,
    category: "Stablecoin Yield",
    vaultAddress: "0xVault0008",
    lockboxAddress: "0xLockbox0008",
    apy: 7.2,
    totalBacked: 320_000,
    backersCount: 58,
    riskLevel: "low",
    interestRate: 6.5,
    defaultRisk: 3,
  },
]

export const MOCK_ARENA_STATS: ArenaStats = {
  totalBacked: 871_500,          // sum of all agent totalBacked
  activeAgents: 6,               // excluding defaulted + delinquent with 0 revenue
  totalRevenue: 404_700,         // sum of all agent totalRevenue
  bestPerformerApy: 32.0,
  bestPerformerName: "SniperBot-X",
  biggestDefaultAmount: 10_000,
  biggestDefaultName: "LiquidBot-3000",
  totalBackers: 189,
  avgApy: 14.8,
}

export const MOCK_ACTIVITY_FEED: ActivityEvent[] = [
  {
    id: "evt-001",
    type: "revenue",
    agentId: "1",
    agentName: "AutoTrader-v3",
    amount: 420,
    timestamp: Date.now() - 120_000,
    message: "AutoTrader-v3 earned $420 from ETH/USDC arb",
  },
  {
    id: "evt-002",
    type: "backing",
    agentId: "8",
    agentName: "StableYield-Pro",
    amount: 5_000,
    timestamp: Date.now() - 300_000,
    message: "0x742d...bD1e backed StableYield-Pro with $5,000",
  },
  {
    id: "evt-003",
    type: "repayment",
    agentId: "3",
    agentName: "DataOracle-Prime",
    amount: 2_400,
    timestamp: Date.now() - 600_000,
    message: "DataOracle-Prime repaid $2,400 on schedule",
  },
  {
    id: "evt-004",
    type: "late_payment",
    agentId: "4",
    agentName: "YieldBot-Alpha",
    amount: 1_200,
    timestamp: Date.now() - 900_000,
    message: "YieldBot-Alpha is 48h late on $1,200 payment",
  },
  {
    id: "evt-005",
    type: "default",
    agentId: "6",
    agentName: "LiquidBot-3000",
    amount: 10_000,
    timestamp: Date.now() - 3_600_000,
    message: "LiquidBot-3000 defaulted on $10,000 credit line",
  },
  {
    id: "evt-006",
    type: "milestone",
    agentId: "3",
    agentName: "DataOracle-Prime",
    amount: 100_000,
    timestamp: Date.now() - 7_200_000,
    message: "DataOracle-Prime hit $100K total revenue",
  },
  {
    id: "evt-007",
    type: "new_agent",
    agentId: "7",
    agentName: "SniperBot-X",
    amount: 0,
    timestamp: Date.now() - 86_400_000,
    message: "SniperBot-X registered with 500 reputation",
  },
  {
    id: "evt-008",
    type: "revenue",
    agentId: "8",
    agentName: "StableYield-Pro",
    amount: 180,
    timestamp: Date.now() - 180_000,
    message: "StableYield-Pro earned $180 from Aave yield",
  },
  {
    id: "evt-009",
    type: "drawdown",
    agentId: "5",
    agentName: "NFT-Curator-X",
    amount: 3_000,
    timestamp: Date.now() - 1_800_000,
    message: "NFT-Curator-X drew $3,000 from credit line",
  },
  {
    id: "evt-010",
    type: "backing",
    agentId: "1",
    agentName: "AutoTrader-v3",
    amount: 10_000,
    timestamp: Date.now() - 2_400_000,
    message: "0x8Ba1...BA72 backed AutoTrader-v3 with $10,000",
  },
]

export const MOCK_PORTFOLIO: PortfolioSummary = {
  totalDeposited: 25_000,
  totalCurrentValue: 27_340,
  totalYieldEarned: 2_340,
  avgApy: 14.2,
  positions: [
    {
      agentId: "1",
      agentName: "AutoTrader-v3",
      vaultAddress: "0xVault0001",
      shares: 9_800,
      depositedAmount: 10_000,
      currentValue: 11_240,
      earnedYield: 1_240,
      apy: 18.4,
      riskLevel: "medium",
      status: "active",
      backedAt: 1709337600,
    },
    {
      agentId: "8",
      agentName: "StableYield-Pro",
      vaultAddress: "0xVault0008",
      shares: 10_000,
      depositedAmount: 10_000,
      currentValue: 10_620,
      earnedYield: 620,
      apy: 7.2,
      riskLevel: "low",
      status: "active",
      backedAt: 1709510400,
    },
    {
      agentId: "4",
      agentName: "YieldBot-Alpha",
      vaultAddress: "0xVault0004",
      shares: 5_000,
      depositedAmount: 5_000,
      currentValue: 5_480,
      earnedYield: 480,
      apy: 25.1,
      riskLevel: "degen",
      status: "delinquent",
      backedAt: 1709683200,
    },
  ],
  alerts: [
    {
      agentId: "4",
      agentName: "YieldBot-Alpha",
      type: "late_payment",
      message: "YieldBot-Alpha is 3 days late on payment",
      timestamp: Date.now() - 259_200_000,
      severity: "warning",
    },
    {
      agentId: "1",
      agentName: "AutoTrader-v3",
      type: "apy_change",
      message: "AutoTrader-v3 APY increased to 18.4%",
      timestamp: Date.now() - 86_400_000,
      severity: "info",
    },
  ],
}

export const MOCK_LEADERBOARD: LeaderboardEntry[] = [
  {
    rank: 1, agentId: "3", agentName: "DataOracle-Prime", apy: 14.6,
    revenue30d: 15_600, totalBacked: 210_000, backersCount: 47,
    reputationScore: 910, riskLevel: "medium", status: "active",
    badges: ["top_earner", "most_backed"], weeklyChange: 0,
  },
  {
    rank: 2, agentId: "1", agentName: "AutoTrader-v3", apy: 18.4,
    revenue30d: 12_400, totalBacked: 142_000, backersCount: 23,
    reputationScore: 940, riskLevel: "medium", status: "active",
    badges: ["hot_streak"], weeklyChange: 1,
  },
  {
    rank: 3, agentId: "8", agentName: "StableYield-Pro", apy: 7.2,
    revenue30d: 5_400, totalBacked: 320_000, backersCount: 58,
    reputationScore: 960, riskLevel: "low", status: "active",
    badges: ["most_backed"], weeklyChange: -1,
  },
  {
    rank: 4, agentId: "2", agentName: "ContentGen-AI", apy: 9.2,
    revenue30d: 8_200, totalBacked: 85_000, backersCount: 31,
    reputationScore: 870, riskLevel: "low", status: "active",
    badges: [], weeklyChange: 0,
  },
  {
    rank: 5, agentId: "5", agentName: "NFT-Curator-X", apy: 11.8,
    revenue30d: 6_800, totalBacked: 62_000, backersCount: 15,
    reputationScore: 820, riskLevel: "medium", status: "active",
    badges: [], weeklyChange: 2,
  },
  {
    rank: 6, agentId: "7", agentName: "SniperBot-X", apy: 32.0,
    revenue30d: 2_100, totalBacked: 8_500, backersCount: 4,
    reputationScore: 500, riskLevel: "degen", status: "active",
    badges: ["newcomer"], weeklyChange: 0,
  },
  {
    rank: 7, agentId: "4", agentName: "YieldBot-Alpha", apy: 25.1,
    revenue30d: 4_100, totalBacked: 34_000, backersCount: 8,
    reputationScore: 580, riskLevel: "degen", status: "delinquent",
    badges: ["at_risk"], weeklyChange: -2,
  },
  {
    rank: 8, agentId: "6", agentName: "LiquidBot-3000", apy: 0,
    revenue30d: 0, totalBacked: 10_000, backersCount: 3,
    reputationScore: 0, riskLevel: "degen", status: "default",
    badges: ["defaulted"], weeklyChange: 0,
  },
]
```

---

## 7. Updated Constants

```typescript
export const CHAIN_ID = 8453 // Base mainnet

export const CONTRACTS = {
  AGENT_VAULT_FACTORY: "0x0000000000000000000000000000000000000000" as const,
  AGENT_REGISTRY: "0x0000000000000000000000000000000000000000" as const,
  AGENT_CREDIT_LINE: "0x0000000000000000000000000000000000000000" as const,
  CREDIT_SCORER: "0x0000000000000000000000000000000000000000" as const,
  USDC: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as const,
} as const

// Risk level thresholds (used by frontend to compute riskLevel from on-chain data)
export const RISK_THRESHOLDS = {
  low: { maxUtilization: 50, minReputation: 800, minRevenue30d: 5000 },
  medium: { maxUtilization: 75, minReputation: 600, minRevenue30d: 2000 },
  high: { maxUtilization: 90, minReputation: 400, minRevenue30d: 500 },
  // everything else is "degen"
} as const
```

---

## 8. Route Structure

```
/                        Home ("The Arena") - hero, live ticker, trending agents, global stats
/agents                  Agent Marketplace ("The Paddock") - grid of agent cards, filters, sort
/agents/:agentId         Agent Detail ("Horse Profile") - full stats, revenue chart, back CTA
/portfolio               My Portfolio ("My Stable") - backed positions, yield tracking, alerts
/leaderboard             Leaderboard ("The Rankings") - top agents, hall of shame, movers
/feed                    Live Feed ("The Wire") - real-time activity timeline
/agents/onboard          Agent Onboarding (existing, unchanged)
/borrow                  Borrow page (existing, for agent operators)
```

**Navigation (BottomNav + Header):**
- Arena (Home) - `/`
- Paddock (Marketplace) - `/agents`
- My Stable (Portfolio) - `/portfolio`
- Rankings (Leaderboard) - `/leaderboard`
- The Wire (Feed) - `/feed`

**Removed routes:**
- `/dashboard` - replaced by `/portfolio`
- `/lend` - replaced by "Back this Agent" flow on `/agents/:agentId`

---

## 9. Component Inventory (New)

| Component | Page | Description |
|-----------|------|-------------|
| `RiskMeter` | Agent Detail | Visual gauge showing default risk (0-100) |
| `RevenueChart` | Agent Detail | 30d/90d/all revenue line chart |
| `ActivityFeed` | Home, Feed, Agent Detail | Timeline of protocol events |
| `BackersList` | Agent Detail | List of addresses that backed this agent |
| `AgentCard` | Marketplace, Home | SpotlightCard with agent stats |
| `BackAgentForm` | Agent Detail | USDC deposit form with yield preview |
| `PortfolioChart` | Portfolio | Portfolio value over time |
| `LeaderboardTable` | Leaderboard | Ranked table with badges |
| `LiveTicker` | Home | Marquee-based scrolling event ticker |
| `AlertBanner` | Portfolio | Warning banners for at-risk positions |

---

## 10. Design System Reference

- **Light mode primary**: `#ea580c` (orange-600)
- **Dark mode primary**: `#e97a2e` (warm orange on `#0a0a0a` background)
- **Risk colors**: low=green, medium=amber, high=orange, degen=red
- **Status colors**: active=green, delinquent=amber, default=red
- **Font**: System monospace for addresses/IDs, system sans for everything else
- **Animations**: Use existing reactbits components (NumberTicker, SpotlightCard, BorderBeam, Marquee, TiltedCard, Aurora, AnimatedContent, RotatingText, TextScramble, SplitText)

---

## 11. Key Architectural Decisions

1. **No shared pool**: Each `AgentVault` is isolated. Default in one vault does not affect others.
2. **Factory pattern**: `AgentVaultFactory` deploys vault + lockbox atomically. Ensures consistent setup.
3. **ERC-4626 per vault**: Standard interface means wallets/aggregators can integrate natively.
4. **CreditLine reads vault from registry**: No hardcoded vault address. Looks up `profile.vault` per agent.
5. **RevenueLockbox unchanged**: Same code, just deployed pointing to `AgentVault` instead of shared vault.
6. **Liquidation scoped**: RecoveryManager looks up agent's vault when distributing proceeds.
7. **APY is per-agent**: Calculated as `(annualized revenue * repayment rate) / totalBacked`. Varies per agent.
8. **Risk isolation**: If YieldBot-Alpha defaults, only its 8 backers lose. StableYield-Pro's 58 backers are unaffected.
