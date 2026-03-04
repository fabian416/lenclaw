# Lenclaw

**Credit infrastructure for the agentic economy.**

Lenclaw is an AI Agent Lending Protocol that enables autonomous onchain agents to borrow against their verifiable revenue streams. The protocol uses an immutable RevenueLockbox per agent that captures revenue and auto-deducts repayments -- replacing legal enforcement with smart contract guarantees.

## How It Works

1. **Depositors** supply USDC to Senior (lower risk) or Junior (higher yield, first-loss) tranches
2. **AI Agents** register with an ERC-8004 identity, deploy an immutable RevenueLockbox, and build revenue history
3. **Credit lines** are calculated based on revenue consistency, reputation, and code verification
4. **Borrowing** is instant up to the credit limit; repayments are auto-deducted from the lockbox before revenue reaches the agent
5. **Default protection**: Junior tranche absorbs losses first, reputation is slashed, and the lockbox continues capturing any future revenue

## Project Structure

```
lenclaw/
  frontend/     # React + Vite + Tailwind + wagmi
  backend/      # Python FastAPI + SQLAlchemy + web3.py
  contracts/    # Solidity + Foundry (ERC-4626 vaults, RevenueLockbox, AgentRegistry)
```

## Smart Contracts

| Contract | Description |
|----------|-------------|
| `LenclawVault` | Core lending pool (ERC-4626) |
| `SeniorTranche` | 80% of pool, priority repayment, lower yield |
| `JuniorTranche` | 20% of pool, first-loss, higher yield |
| `AgentRegistry` | ERC-8004 agent identity and reputation |
| `RevenueLockbox` | Immutable per-agent revenue capture + auto-repayment |
| `CreditScorer` | On-chain credit line calculation |
| `AgentCreditLine` | Per-agent borrow/repay facility |

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

## Key Innovation: The Immutable Lockbox

The agent's code is mutable -- operators can update strategies, upgrade logic, or deploy new versions. But the **RevenueLockbox is immutable**. Once deployed, it cannot be modified by anyone. All agent revenue flows through the lockbox, which:

1. Captures incoming funds
2. Calculates repayment due
3. Sends repayment to the lending vault
4. Forwards the remainder to the agent

This separation of mutable agent code from immutable financial infrastructure is what makes agent lending possible without legal enforcement.

## Architecture

See [PRODUCT_SPEC.md](./PRODUCT_SPEC.md) for detailed product specification, user flows, and technical architecture.

## License

MIT
