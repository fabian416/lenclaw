# Prompt: Vault-Per-Agent Refactor — "Back Your Agent"

## Contexto del proyecto

Lenclaw es un protocolo DeFi de lending para AI agents en Base (EVM). Los agentes autónomos toman crédito, generan revenue, y repagan a los lenders.

### Stack actual
- **Contracts**: Solidity 0.8.24, Foundry, OpenZeppelin
- **Frontend**: React 18 + TypeScript + Vite + Tailwind CSS 4 + Framer Motion
- **Chain**: Base (ERC-4626, ERC-721 para identidad de agentes)

### Arquitectura actual (pool único)
```
Lenders → [LenclawVault (ERC-4626)] → AgentCreditLine → Agent usa crédito
                                                              ↓
                                                     Agent genera revenue
                                                              ↓
                                                     [RevenueLockbox] → split: repago al vault + resto al agente
```

**Contratos existentes:**
- `LenclawVault.sol` — ERC-4626, pool ÚNICO de USDC. Lenders depositan, reciben lcUSDC shares. Presta a agentes autorizados.
- `AgentRegistry.sol` — ERC-721, identidad on-chain de agentes. Reputation score (0-1000), code hash, TEE attestation.
- `RevenueLockbox.sol` — Uno por agente. Captura revenue y splitea entre repago al vault y remainder al agente.
- `AgentCreditLine.sol` — Línea de crédito por agente, drawdown y repayments.
- `CreditScorer.sol` — Score algorítmico basado en revenue history, repayment rate, etc.
- `DutchAuction.sol`, `LiquidationKeeper.sol`, `RecoveryManager.sol` — Liquidación y recovery.
- `CrossChainRevenue.sol` — Revenue cross-chain via CCIP.

**Frontend actual:**
- Home: landing con stats del pool único, hero con animaciones (Aurora, Squares, TextReveal)
- Dashboard: métricas del pool (TVL, APY, utilization)
- Lend: depositar USDC en el pool único
- Agents: registry de agentes registrados
- Borrow: vista del agente para hacer drawdown de su crédito
- Agent Onboarding: wizard de 5 pasos para registrar agente
- 19 componentes animados de reactbits (SplitText, BorderBeam, SpotlightCard, NumberTicker, TextScramble, etc.)
- Light mode (default, naranja #ea580c) + Dark mode (toggle, naranja apagado #e97a2e sobre negro #0a0a0a)

---

## Lo que quiero: Modelo "Vault por Agente" con UX lúdica/de apuestas

### Concepto core
En vez de un pool genérico donde depositás USDC y te da un yield promedio, quiero que cada agente tenga su propio vault. El lender ELIGE en qué agente confiar y le pone plata. Es como apostar en una carrera de caballos pero con data real: revenue del agente, reputation score, historial de repagos.

### Arquitectura nueva
```
Lender A → [AgentVault: AutoTrader-v3]  → 18% APY (high revenue, risky)
Lender B → [AgentVault: ContentGen-AI]  → 9% APY (stable, safe)
Lender C → [AgentVault: YieldBot-Alpha] → 25% APY (degen, might default)
```

Cada agente tiene:
- **AgentVault (ERC-4626)**: su propio vault donde lenders depositan USDC
- **RevenueLockbox**: captura revenue del agente, repaga a SU vault (no a un pool genérico)
- **APY individual**: calculado del revenue real del agente vs USDC depositado
- **Riesgo individual**: si el agente defaultea, solo pierden los que le apostaron
- **Cap**: máximo que el agente puede tomar prestado (basado en su reputation + revenue history)

### Factory Pattern
```solidity
AgentVaultFactory.createVault(agentId) → deploya AgentVault + linkea con RevenueLockbox
```

### Flujo
1. Agente se registra → AgentRegistry minta ERC-721 → Factory deploya AgentVault + Lockbox
2. Lender browsea agentes → ve stats, revenue, APY, riesgo → elige uno → "Back this Agent" → deposita USDC en el AgentVault
3. Agente hace drawdown de SU vault
4. Agente genera revenue → cae en SU Lockbox → auto-repaga a SU vault → yield fluye a SUS backers
5. Si el agente defaultea → liquidación afecta solo a los backers de ESE agente

---

## UX: Lúdica, de apuestas, adictiva

### Principios de diseño
- **NO es un banco, es un ring de apuestas sofisticado**
- El usuario está tomando una decisión activa: "le apuesto a este agente"
- Tiene que sentir la tensión del riesgo/reward
- Los agentes son los "caballos" — cada uno con su perfil, stats, historial
- Feed en vivo de actividad para que se sienta vivo
- Leaderboard con drama (agentes que suben, bajan, defaultean)

### Pantallas y features

#### 1. Home — "The Arena"
- Hero: "Pick your agent. Back the future." (no "deposit USDC", eso es aburrido)
- Live ticker/feed de actividad de agentes: "AutoTrader-v3 earned $420 from ETH arb", "YieldBot-Alpha missed a payment ⚠️", "DataOracle-Prime revenue up 23% this week 🔥"
- Top 3 agentes trending con mini-cards
- Stats globales: Total Backed, Active Agents, Best Performer, Biggest Default

#### 2. Agent Marketplace — "The Paddock" (donde elegís tu caballo)
- Grid/lista de agentes como cards interactivas
- Cada card muestra: nombre, avatar/icono, APY actual, revenue 30d, reputation score, riesgo (bajo/medio/alto/degen), backers count, total backed
- Filtros: por APY, por riesgo, por revenue, por reputation
- Sort: hot (más backed últimamente), top earners, riskiest, newest
- Click en un agente → página de detalle

#### 3. Agent Detail — "Horse Profile"
- Header: nombre, ERC-8004 ID, status badge, reputation ring
- Stats grid: APY, Revenue 30d, Total Backed, Backers, Utilization, Default Risk
- **Revenue chart** (30d/90d/all): gráfico de revenue real del agente
- **Activity feed**: historial de transacciones del agente (earnings, drawdowns, repayments)
- **Risk meter**: gauge visual de riesgo (basado en utilization, revenue consistency, repayment history)
- **"Back this Agent" CTA**: input de monto + preview de estimated yield
- **Backers list**: quiénes más le apostaron a este agente (addresses + montos)

#### 4. My Bets / Portfolio — "My Stable"
- Lista de agentes que backeaste con montos, yield acumulado, status
- Performance chart: tu portfolio total vs tiempo
- Alertas: "YieldBot-Alpha is 3 days late on payment", "AutoTrader-v3 APY increased to 22%"
- Botón de withdraw per-agent

#### 5. Leaderboard — "The Rankings"
- Top agents por: APY, revenue, consistency, total backed
- "Hall of Shame": agentes que defaultearon
- Weekly/monthly movers: quién subió, quién bajó
- Badges: "🔥 Hot Streak", "⚠️ At Risk", "💀 Defaulted", "🏆 Top Earner", "🆕 Newcomer"

#### 6. Live Feed — "The Wire"
- Timeline estilo Twitter de eventos del protocolo
- Tipos de eventos:
  - 💰 Revenue: "AutoTrader-v3 earned $1,240 from DEX arb"
  - 🎯 Backing: "0x742d...bD1e backed ContentGen-AI with $5,000"
  - ✅ Repayment: "DataOracle-Prime repaid $2,400 on schedule"
  - ⚠️ Late: "YieldBot-Alpha is 48h late on $1,200 payment"
  - 💀 Default: "LiquidBot-3000 defaulted on $10,000 credit line"
  - 📈 Milestone: "AutoTrader-v3 hit $100K total revenue"
  - 🆕 New Agent: "SniperBot-X registered with 0 reputation"
- Filterable por agente, por tipo de evento

### Lenguaje y tono
- NO usar: "deposit", "withdraw", "lending pool", "yield farming"
- SÍ usar: "back", "bet on", "pick", "stake on", "your stable", "the arena", "backers", "runners"
- El tono es crypto-degen meets horse racing meets venture capital
- Tiene que ser divertido, no un Excel financiero

### Componentes reactbits a aprovechar
- **NumberTicker**: para yields y revenues en tiempo real
- **SpotlightCard**: para agent cards en el marketplace
- **BorderBeam**: para highlight del agente top performer
- **TextScramble**: para addresses y IDs
- **Marquee**: para el live ticker
- **TiltedCard**: para las cards de agentes trending
- **Aurora**: background del arena
- **RotatingText**: para stats que cambian
- **AnimatedContent**: para transiciones en el feed

---

## Scope del refactor

### Contracts (Solidity)
1. Crear `AgentVaultFactory.sol` — Factory que deploya un `AgentVault` por agente
2. Refactorear `LenclawVault.sol` → `AgentVault.sol` — Vault individual por agente (no pool compartido)
3. Actualizar `RevenueLockbox.sol` — Ahora repaga al `AgentVault` individual
4. Actualizar `AgentCreditLine.sol` — Drawdown del vault individual
5. Actualizar `AgentRegistry.sol` — Linkear cada agente con su vault
6. Actualizar deploy scripts

### Frontend (React + TypeScript)
1. Nuevos types: `AgentVault`, `BackingPosition`, `ActivityEvent`, `LeaderboardEntry`
2. Nuevas pages: Agent Marketplace, Agent Detail, My Portfolio, Leaderboard, Live Feed
3. Refactorear: Home (arena), Dashboard (portfolio)
4. Eliminar: Lend page genérica (reemplazada por "Back Agent" flow)
5. Mock data actualizada: vaults por agente, actividad simulada, rankings
6. Nuevos componentes: RiskMeter, ActivityFeed, RevenueChart, BackersList

### Backend (si aplica)
- Websocket o polling para simular actividad de agentes en tiempo real
- Endpoint para leaderboard y rankings

---

## Restricciones
- Mantener el design system actual: light mode naranja (#ea580c) + dark mode naranja apagado (#e97a2e) sobre negro
- Mantener los 19 componentes reactbits existentes
- Mantener la calidad visual 10/10 que se logró
- Mantener mobile-first responsive design
- Stack: React 18 + TypeScript + Vite + Tailwind CSS 4 + Framer Motion
- Chain: Base, ERC-4626, Solidity 0.8.24, Foundry

---

## Resultado esperado
Un producto que se sienta como una mezcla de:
- **Polymarket** (apuestas con data real)
- **OpenSea** (browsear y elegir)
- **Horse racing app** (pick your runner, watch the race)
- **DeFi dashboard** (yields, charts, portfolio tracking)

Pero para AI agents. El usuario entra, ve agentes compitiendo, elige los que le gustan, les pone plata, y ve en tiempo real si su apuesta paga o no.
