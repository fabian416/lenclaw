# Lenclaw Contracts

Solidity smart contracts for the Lenclaw protocol. Built with Foundry.

## Contracts

| Contract | Description |
|----------|-------------|
| `AgentVault` | ERC-4626 vault per agent with deposit caps, withdrawal timelock, and freeze on default |
| `AgentVaultFactory` | Atomically deploys an AgentVault + RevenueLockbox for each agent |
| `AgentRegistry` | ERC-721 agent identity with wallet, codeHash, reputation (0-1000), and vault references |
| `RevenueLockbox` | Immutable per-agent revenue capture; splits between repayment and agent wallet |
| `AgentCreditLine` | Per-agent borrow/repay facility with ACTIVE/DELINQUENT/DEFAULT status tracking |
| `CreditScorer` | On-chain behavioral scoring (30% revenue, 25% consistency, 20% credit history, 15% time, 10% debt ratio) for credit lines and rates |
| `AgentSmartWallet` | Revenue-routing wallet that auto-splits USDT to lockbox before any execution |
| `SmartWalletFactory` | Deploys AgentSmartWallet instances per agent |
| `DutchAuction` | Linear price-decay auction for defaulted positions |
| `RecoveryManager` | Coordinates post-default recovery and distributes auction proceeds to vault backers |
| `LiquidationKeeper` | Monitors for defaults and triggers liquidation with keeper bounty |

## Architecture

```
                 Register
  Agent ──────────────────> AgentRegistry (ERC-721)
                                  │
                      deploys atomically
                         ┌────────┴────────┐
                         v                  v
                   AgentVault         RevenueLockbox
                   (ERC-4626)          (immutable)
                      ^                     │
                      │              revenue splits
           deposit    │            ┌────────┴────────┐
  Backers ────────────┘            v                  v
                            Repayment ──> Vault    Agent wallet
                                  ^
                                  │
                           AgentCreditLine
                           (borrow/repay)
                                  │
                            on default
                                  v
                     DutchAuction ──> RecoveryManager
```

## Build

```bash
forge build
```

## Test

```bash
forge test
```

191 tests across 10 test files.

## Deploy

```bash
# Base (primary)
forge script script/DeployBase.s.sol --rpc-url $BASE_RPC --broadcast

# Other chains
forge script script/DeployArbitrum.s.sol --rpc-url $ARBITRUM_RPC --broadcast
forge script script/DeployOptimism.s.sol --rpc-url $OPTIMISM_RPC --broadcast
forge script script/DeployPolygon.s.sol --rpc-url $POLYGON_RPC --broadcast
```

## License

MIT
