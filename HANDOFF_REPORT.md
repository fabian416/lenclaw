# Lenclaw — Informe Técnico del Proyecto

**Fecha:** 4 de marzo de 2026
**Versión:** 0.1.0 (Post-MVP + Features)
**Stack:** Solidity · FastAPI · React · Noir ZK · TEE · Docker

---

## 1. Qué es Lenclaw

Lenclaw es un **protocolo de lending diseñado para agentes de IA autónomos que operan onchain**. La premisa es simple: los agentes generan revenue verificable a través de servicios que proveen (APIs, trading, automatización), y Lenclaw les permite tomar crédito contra ese revenue futuro.

La diferencia fundamental con lending tradicional (tanto DeFi como TradFi) es que **no hay enforcement legal ni colateral líquido**. En su lugar, Lenclaw usa un contrato inmutable llamado **RevenueLockbox** que intercepta el revenue del agente y auto-deduce los repagos antes de que el agente toque los fondos. El agente puede actualizar su código, pero no puede modificar ni evadir el lockbox.

---

## 2. Arquitectura General

```
┌─────────────┐     ┌──────────────┐     ┌─────────────────┐
│  Frontend    │────▶│  Backend     │────▶│  Smart Contracts│
│  React/Vite  │     │  FastAPI     │     │  Solidity/EVM   │
│  :3001       │     │  :8000       │     │  Base Chain     │
└─────────────┘     └──────┬───────┘     └────────┬────────┘
                           │                       │
                    ┌──────┴───────┐        ┌──────┴────────┐
                    │  PostgreSQL  │        │  Bridge/Oracle │
                    │  :5432       │        │  Revenue Poll  │
                    ├──────────────┤        ├───────────────┤
                    │  Redis       │        │  TEE Service   │
                    │  :6379       │        │  Code Verify   │
                    └──────────────┘        ├───────────────┤
                                            │  ZK Prover    │
                                            │  Credit Proofs│
                                            └───────────────┘
```

El proyecto se compone de 7 módulos principales:

| Módulo | Directorio | Tecnología | Propósito |
|--------|-----------|------------|-----------|
| Smart Contracts | `/contracts` | Solidity + Foundry | Lógica onchain del protocolo |
| Backend API | `/backend` | Python 3.12 + FastAPI | API REST, credit scoring, workers |
| Frontend | `/frontend` | React 18 + TypeScript + Vite | Interfaz de usuario |
| Bridge Oracle | `/bridge` | Python | Polling de payment processors, attestation de revenue |
| TEE Service | `/tee` | TypeScript + Express | Verificación de código en enclaves seguros |
| ZK Proofs | `/zk` | Noir (Nargo) + Python | Pruebas de creditworthiness privacy-preserving |
| Agente Ejemplo | `/agents` | Python | Agente demo "CryptoBro" |

---

## 3. Smart Contracts

Todos los contratos están en `/contracts/src` y se compilan con Foundry. Target: EVM compatible (Base chain, chainId 8453).

### 3.1 Core del Protocolo

**LenclawVault.sol** — Pool principal de liquidez (ERC-4626).
Los lenders depositan USDC y reciben lcUSDC como share token. El vault presta a agentes autorizados y cobra un protocol fee del 10% sobre el interest. Expone la utilización del pool y la liquidez disponible.

**RevenueLockbox.sol** — Contrato inmutable por agente.
Se deploya una vez por agente y no se puede modificar. Todo el revenue del agente (USDC o ETH) pasa por este contrato, que aplica un `repaymentRateBps` (ej: 50%) para auto-repagar la deuda antes de liberar fondos al agente. Es la pieza central de seguridad del protocolo.

**AgentRegistry.sol** — Registro de identidad (ERC-721 / ERC-8004).
Cada agente recibe un NFT como identidad onchain. El registro almacena: wallet, code hash, metadata, reputation score (0–1000), flag de código verificado, y dirección del lockbox. La reputación inicial es 500.

**AgentCreditLine.sol** — Línea de crédito individual.
Gestiona el crédito de cada agente: principal, interest accrued, tasa de interés, límite de crédito, y estado (ACTIVE → DELINQUENT → DEFAULT). Periodos de gracia: 7 días, delinquency: 14 días, default: 30 días.

**CreditScorer.sol** — Motor de scoring onchain.
Calcula la línea de crédito como: `revenue × multiplicador (3x) × reputation boost (50%–150%)`. Bonus de +20% si el código está verificado por TEE. Rango de crédito: 100 USDC a 100K USDC. Tasa de interés inversamente proporcional a la reputación (3%–25% APR).

### 3.2 Sistema de Tranches

El pool se divide en dos tranches para ofrecer diferentes perfiles de riesgo a los lenders:

**SeniorTranche.sol** — 80% del pool. Menor riesgo, menor yield. Los depositors reciben sUSDC. Tiene prioridad en repagos y está protegido por el tranche junior.

**JuniorTranche.sol** — 20% del pool. Mayor riesgo, mayor yield. Los depositors reciben jUSDC. Absorbe las pérdidas por defaults antes de que el senior tranche pierda. Tiene un cooldown de 7 días para withdrawals.

**TrancheRouter.sol** — Rutea depósitos entre senior y junior según la proporción configurada.

**TrancheMarket.sol** — Mercado secundario para trading de sUSDC/jUSDC entre depositors.

### 3.3 Liquidación y Recovery

**DutchAuction.sol** — Subasta descendente para vender colateral de agentes en default.

**LiquidationKeeper.sol** — Monitorea defaults, ejecuta liquidaciones, distribuye los proceeds entre los tranches.

**RecoveryManager.sol** — Colecta fondos recuperados de agentes defaulteados post-liquidación.

### 3.4 Funcionalidad Extendida

**CrossChainRevenue.sol** — Recibe attestations de revenue generado en otras cadenas.

**X402Receipt.sol** — Integración con el protocolo X-402 para micropagos pay-as-you-go.

**Governance** — `LenclawToken.sol` (governance token), `LenclawGovernor.sol` (DAO), `LenclawTimelock.sol`, `GovernableParams.sol` (parámetros ajustables por governance).

### 3.5 Tests

Los tests están en `/contracts/test` con Foundry:
- `GovernanceTest.t.sol` — Tests del sistema de governance
- `LiquidationTest.t.sol` — Tests de liquidación
- `MarketTest.t.sol` — Tests del mercado secundario

---

## 4. Backend

API REST construida con FastAPI (Python 3.12), base de datos PostgreSQL con SQLAlchemy async, y Redis para caching.

### 4.1 Módulos

| Módulo | Ruta API | Descripción |
|--------|----------|-------------|
| `auth/` | `/auth/*` | Autenticación SIWE (Sign In With Ethereum) + JWT |
| `agent/` | `/agents/*` | CRUD de agentes, activación, estados |
| `revenue/` | `/agents/{id}/revenue` | Ingesta y consulta de revenue, agregación temporal |
| `credit/` | `/agents/{id}/credit` | Scoring ML, líneas de crédito, draws, repagos |
| `pool/` | `/pool/*` | Gestión de tranches, depósitos, distribución de interest |
| `market/` | `/market/*` | Mercado secundario de tranche shares |
| `bridge/` | `/bridge/*` | Recepción de attestations del oracle |
| `liquidation/` | `/liquidation/*` | Tracking de liquidaciones |
| `fiat/` | `/fiat/*` | On/off-ramp de USDC |
| `monitoring/` | `/health`, `/metrics` | Health checks y métricas Prometheus |
| `x402/` | `/x402/*` | Middleware y endpoints del protocolo X-402 |
| `sdk/` | — | Cliente y servidor X-402 como librería |

### 4.2 Modelos de Datos

Los modelos principales en la base de datos:

- **Agent** — Wallet, code hash, lockbox address, reputation, status (PENDING → ACTIVE → SUSPENDED → DELINQUENT → DEFAULTED)
- **RevenueRecord** — Transacciones individuales de revenue por agente
- **CreditLine** — Línea de crédito: límite, tasa, estado
- **CreditDraw** — Cada drawdown individual con tenor y repago
- **Deposit** — Depósitos de lenders en tranches
- **Liquidation** — Registro de liquidaciones

### 4.3 Credit Scoring (ML)

El módulo `credit/` incluye un motor de scoring con machine learning:

- `features.py` — Extracción de features: consistencia de revenue, tendencia, volatilidad, edad del agente, historial de repagos
- `ml_scoring.py` — Modelo de scoring que combina features para calcular creditworthiness
- `model.py` — Gestión de líneas de crédito y lógica de negocio
- `training_data.py` — Generación de datos de entrenamiento

### 4.4 Workers

Background workers en `/backend/src/workers/`:

- **chain_sync_worker** — Sincroniza eventos onchain con la base de datos
- **credit_scoring_worker** — Recalcula scores periódicamente
- **revenue_sync_worker** — Sincroniza datos de revenue
- **monitoring_worker** — Monitoreo y alertas

Incluye infraestructura de resiliencia: circuit breaker, rate limiter, retry con backoff, dead letter queue, y observabilidad con structured logging y métricas.

### 4.5 Dependencias Clave

FastAPI 0.115.6, SQLAlchemy 2.0+, Alembic, asyncpg, Pydantic 2.10+, web3.py 7.6+, SIWE 4.3+, Redis 5.0+, structlog, prometheus-client.

---

## 5. Frontend

SPA (Single Page Application) construida con React 18, TypeScript, Vite 6, y Tailwind CSS 4. Usa Wagmi + Viem para interacciones Web3.

### 5.1 Páginas

| Página | Ruta | Descripción |
|--------|------|-------------|
| Home | `/` | Landing page con hero animado, features, métricas del pool |
| Dashboard | `/dashboard` | Overview: utilización del pool (anillos SVG), agentes activos, stats |
| Lend | `/lend` | Depósito en senior/junior tranche, selección de riesgo, yield display |
| Borrow | `/borrow` | Drawdown de crédito, schedule de repagos, balance del lockbox |
| Market | `/market` | Trading secundario de sUSDC/jUSDC, order book |
| Agent Registry | `/registry` | Explorador de agentes con cards, reputation, filtros |
| Agent Onboarding | `/onboarding` | Wizard multi-step: verificación de código → deploy lockbox → registro |

### 5.2 Componentes

- **Layout:** Header desktop, MobileHeader, BottomNav (mobile tabs)
- **Shared:** StatCard, ProgressBar, StatusBadge, LoadingSpinner, EmptyState
- **Features:** FiatRampWidget (on/off-ramp USDC), KYCBanner
- **UI Base:** Componentes Radix UI (Card, Button, Dialog, Tooltip)

### 5.3 Stack Frontend

React 18.3, TypeScript 5.6, Vite 6.0, Tailwind CSS 4.1, Wagmi 2.12, Viem 2.40, TanStack Query 5.60, React Router 7.9, Framer Motion 12.12, Radix UI, Lucide icons, PWA con service worker.

---

## 6. Bridge Oracle

Daemon de larga duración que conecta el mundo off-chain (payment processors) con el protocolo onchain. Ubicado en `/bridge`.

### 6.1 Funcionamiento

```
Stripe/Square/MercadoPago  ──▶  Bridge Daemon  ──▶  On-chain Attestation
       (APIs)                   (poll + aggregate)    (RevenueLockbox)
```

1. El daemon pollea conectores de payment processors a intervalos regulares
2. Agrega el revenue de todas las fuentes por agente
3. Genera una `RevenueAttestation` con hash de los datos
4. Submite la attestation onchain
5. Mantiene idempotencia trackando hashes ya submitidos

### 6.2 Conectores

- **StripeConnector** — Fetcha charges de la API de Stripe
- **SquareConnector** — Fetcha transacciones de Square
- **MercadoPagoConnector** — Fetcha historial de transacciones de MP

Todos implementan la interfaz base: `connect()`, `disconnect()`, `get_revenue(since, until)`.

### 6.3 Resiliencia

Retry con exponential backoff, graceful shutdown con signal handlers, polling concurrente de múltiples agentes.

---

## 7. TEE (Trusted Execution Environment)

Servicio de verificación que asegura que los agentes corren el código que dicen correr. Ubicado en `/tee`.

### 7.1 Problema que Resuelve

Un agente podría registrar un code hash "honesto" pero luego correr código malicioso. El TEE service verifica que el agente realmente ejecuta en un enclave seguro (Intel SGX o AWS Nitro) el código cuyo hash está registrado.

### 7.2 Componentes

- **API REST** (Express/TypeScript) — Endpoints: `POST /attest`, `GET /status/:agentId`, `POST /verify`
- **Attestor** — Parsea quotes SGX DCAP o Nitro COSE, extrae measurements, verifica firma
- **Hasher** — SHA-256 del código (binarios, WASM, source)
- **Scheduler** — Re-attestation periódica (cada 6 horas por defecto)
- **Monitor** — Vigila expiración de attestations (TTL: 24h)

### 7.3 Seguridad

El report-data del attestation bindea `SHA-256(agentId || codeHash)`, lo que previene replay attacks. La verificación de firma usa la root CA de Intel (SGX) o AWS (Nitro).

### 7.4 Contrato Onchain

`TEEAttestationVerifier.sol` — Almacena y verifica attestations onchain, consultable por el CreditScorer para aplicar el bonus de código verificado.

---

## 8. ZK Proofs (Zero-Knowledge)

Sistema de pruebas de conocimiento cero que permite a los agentes demostrar creditworthiness sin revelar datos sensibles. Ubicado en `/zk`.

### 8.1 Circuitos (Noir/Nargo)

| Circuito | Input Privado | Input Público | Prueba |
|----------|--------------|---------------|--------|
| `revenue_threshold` | Revenue real | Umbral mínimo | Revenue ≥ umbral, revela tier (no monto exacto) |
| `code_integrity` | Campos del código | Hash registrado | Código coincide con el hash |
| `reputation_minimum` | Reputation real | Mínimo requerido | Reputation ≥ mínimo, revela banda (no score exacto) |
| `composite_credit_proof` | Todos los anteriores | Todos + agent_id | Las 3 condiciones se cumplen simultáneamente |

### 8.2 Tiers y Bandas (lo que se revela públicamente)

**Revenue tiers:** 0 = ninguno, 1 = <1M, 2 = 1M–10M, 3 = 10M–100M, 4 = >100M

**Reputation bands:** 0 = <500, 1 = 500–749, 2 = 750–899, 3 = 900+

Esto permite a lenders evaluar riesgo sin ver datos exactos del agente.

### 8.3 Tooling

- `prove.py` — CLI para generar proofs y preparar calldata onchain
- `verify.py` — Verificación local de proofs
- `ZKCreditVerifier.sol` — Verificador onchain con expiración de proofs (7 días)

---

## 9. Infraestructura

### 9.1 Docker Compose

**Producción** (`docker-compose.yml`):
- Caddy (reverse proxy, HTTPS) — 128MB RAM
- Frontend (Nginx serving static) — 128MB RAM
- Backend (Gunicorn + Uvicorn workers) — 512MB RAM
- PostgreSQL 15 — 512MB RAM
- Redis 7 — 256MB RAM

**Desarrollo** (`docker-compose.dev.yml`):
- Backend con hot reload (uvicorn --reload)
- Postgres y Redis con puertos expuestos
- Frontend corre localmente con Vite dev server

### 9.2 Redes

Las redes están segmentadas: `frontend_net` (Caddy ↔ Frontend), `backend_net` (Caddy ↔ Backend), `db_net` (Backend ↔ PostgreSQL/Redis). El frontend no tiene acceso directo a la base de datos.

### 9.3 CI/CD (GitHub Actions)

| Workflow | Trigger | Qué hace |
|----------|---------|----------|
| `ci.yml` | Push/PR | Lint + test frontend, backend, y contracts en paralelo |
| `deploy.yml` | Push a main | Build y push de imágenes Docker a ghcr.io |
| `security.yml` | Push/PR | Análisis de seguridad |

### 9.4 Makefile

Comandos principales: `make dev` (levantar todo), `make test` (correr todos los tests), `make migrate` (migraciones de DB), `make health` (check de servicios), `make logs` (seguir logs), `make clean` (limpiar todo).

---

## 10. Flujo Principal del Protocolo

```
                    ┌─────────────────────────────────────────┐
                    │           REGISTRO DEL AGENTE           │
                    │                                         │
                    │  1. Agente llama registerAgent()        │
                    │  2. Recibe NFT de identidad             │
                    │  3. Se deploya su RevenueLockbox        │
                    │  4. TEE verifica su código              │
                    │  5. ZK proof de creditworthiness        │
                    └──────────────┬──────────────────────────┘
                                   │
                    ┌──────────────▼──────────────────────────┐
                    │         CAPTURA DE REVENUE              │
                    │                                         │
                    │  1. Agente genera revenue (Stripe, etc) │
                    │  2. Bridge pollea payment processors    │
                    │  3. Agrega y crea attestation           │
                    │  4. Submit onchain al Lockbox           │
                    │  5. Lockbox auto-split: repago + resto  │
                    └──────────────┬──────────────────────────┘
                                   │
                    ┌──────────────▼──────────────────────────┐
                    │           CRÉDITO                       │
                    │                                         │
                    │  1. CreditScorer calcula línea:         │
                    │     revenue × 3 × reputation boost      │
                    │  2. Agente hace drawdown()              │
                    │  3. Vault transfiere USDC al agente     │
                    │  4. Interest accrues según tenor         │
                    │  5. Repagos automáticos vía Lockbox     │
                    └──────────────┬──────────────────────────┘
                                   │
                    ┌──────────────▼──────────────────────────┐
                    │           LENDING (DEPOSITORS)          │
                    │                                         │
                    │  1. Lender deposita USDC                │
                    │  2. Elige tranche: senior o junior      │
                    │  3. Recibe sUSDC o jUSDC                │
                    │  4. Gana yield del interest de agentes  │
                    │  5. Puede tradear shares en el Market   │
                    └─────────────────────────────────────────┘
```

---

## 11. Estado Actual

- **Contratos:** Compilados y testeados con Foundry. Deployments configurados para Base, Arbitrum, Optimism, Polygon.
- **Backend:** Funcional con todos los módulos. Health check respondiendo OK. Workers y sistema de resiliencia implementados.
- **Frontend:** Funcional con mock data para desarrollo. Todas las páginas implementadas con UI responsive (mobile-first con bottom nav).
- **Bridge:** Implementado con conectores para Stripe, Square, MercadoPago. Listo para configurar con API keys reales.
- **TEE:** Servicio implementado, pendiente de despliegue en entorno con enclave real.
- **ZK:** Circuitos escritos en Noir, prover y verifier funcionales. Requiere Nargo instalado para generar proofs reales.

### Configuración

El archivo `.env.example` contiene todas las variables necesarias. Las principales:

| Variable | Descripción |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `REDIS_URL` | Redis connection string |
| `WEB3_RPC_URL` | RPC de Base chain (default) |
| `JWT_SECRET` | Secret para tokens de autenticación |
| `CHAIN_ID` | 8453 (Base) |

### Repositorio

- **Repo:** `git@github.com:LuchoLeonel/lenclaw.git`
- **Branch:** `main`
- **Último commit:** `feat: Post-MVP features - 13 modules, UX redesign, infrastructure`

---