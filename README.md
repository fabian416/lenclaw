# Lenclaw

**Credit infrastructure for the agentic economy.**

Lenclaw is a DeFi lending protocol on Base that enables autonomous AI agents to borrow USDC against their verifiable revenue streams. Each agent gets its own isolated vault -- backers deposit directly into the agent they believe in, and an immutable RevenueLockbox auto-deducts repayments before revenue reaches the agent.

## How It Works

1. **Agent registers** via AgentRegistry (ERC-721 identity). A personal AgentVault + RevenueLockbox are deployed atomically
2. **Backers deposit** USDC into a specific agent's vault (ERC-4626). They receive agent-specific shares -- not pooled exposure
3. **Credit line** is calculated by CreditScorer based on revenue consistency, reputation, code verification, and smart wallet usage (100-100K USDC, 3-25% APR)
4. **Agent borrows** from its own vault up to the credit limit. Repayments are auto-deducted by the lockbox before revenue reaches the agent
5. **Default path**: Vault is frozen, a Dutch auction liquidates the position, and the RecoveryManager distributes proceeds back to vault backers

## Project Structure

```
lenclaw/
  contracts/    # Solidity + Foundry (vault-per-agent, lockbox, registry, scoring)
  frontend/     # React + Vite + Tailwind + wagmi
  backend/      # Python FastAPI + SQLAlchemy + web3.py
```

## Smart Contracts

| Contract | Description |
|----------|-------------|
| `AgentVault` | ERC-4626 vault per agent. Deposit caps, withdrawal timelock, frozen on default |
| `AgentVaultFactory` | Deploys AgentVault + RevenueLockbox per agent atomically |
| `AgentRegistry` | ERC-721 agent identity (ERC-8004 inspired). Stores wallet, codeHash, reputation |
| `RevenueLockbox` | Immutable per-agent revenue capture + auto-repayment split |
| `AgentCreditLine` | Per-agent borrow/repay with status tracking (ACTIVE/DELINQUENT/DEFAULT) |
| `CreditScorer` | Weighted multi-source scoring for credit lines and interest rates |
| `AgentSmartWallet` | Revenue-routing smart wallet. Auto-splits USDC to lockbox |
| `SmartWalletFactory` | Deploys smart wallets per agent |
| `DutchAuction` | Dutch auction for defaulted positions |
| `RecoveryManager` | Coordinates recovery after default, distributes proceeds to vault |
| `LiquidationKeeper` | Monitors defaults, triggers liquidation with keeper bounty |

## Getting Started

### Prerequisites

- Node.js 18+
- Python 3.12+
- Foundry (`curl -L https://foundry.paradigm.xyz | bash`)
- PostgreSQL

### Frontend

```bash
cd frontend
npm install
npm run dev
```

### Backend

```bash
cd backend
pip install -e ".[dev]"
uvicorn src.main:app --reload
```

### Contracts

```bash
cd contracts
forge install
forge build
forge test
```

## Key Innovation: Vault Isolation + Immutable Lockbox

**Vault-per-agent** means backers choose exactly which agent to back. No shared pool, no socialized losses. If one agent defaults, only that agent's vault is affected.

The **RevenueLockbox is immutable**. Once deployed, it cannot be modified by anyone. All agent revenue flows through the lockbox, which:

1. Captures incoming funds
2. Calculates repayment due
3. Sends repayment to the agent's vault
4. Forwards the remainder to the agent

This separation of mutable agent code from immutable financial infrastructure is what makes agent lending possible without legal enforcement.

## License

MIT
