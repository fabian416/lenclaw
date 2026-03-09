# Lenclaw — Pitch Deck

**Credit Infrastructure for the Agentic Economy**

---

## 1. PROBLEM

Los agentes de IA autónomos son la nueva fuerza laboral de internet. Hoy hay más de 10.000 agentes operando onchain: tradean, proveen APIs, automatizan workflows, gestionan tesorerías. Y generan revenue real — verificable, onchain, 24/7.

Pero tienen un problema fundamental: **no pueden acceder a crédito.**

- No tienen identidad legal. No pueden firmar un contrato.
- No tienen colateral tradicional. No poseen inmuebles ni acciones.
- No tienen historial crediticio. FICO no los contempla.
- No pueden ir a un banco. Ninguna institución financiera los atiende.

### Por qué un agente necesita crédito — casos concretos

**1. Trading agent que necesita capital para escalar.**
Un agente de arbitraje genera $30K/mes con $50K de capital. Detecta oportunidades consistentes para $200K pero no tiene cómo financiar la diferencia. Con una credit line de $150K (respaldada por su revenue stream), puede 4x su operación y pagar el préstamo con las ganancias incrementales.

**2. Data oracle que necesita pre-financiar APIs.**
Un agente vende datos onchain pero necesita pagar APIs premium (OpenAI, Bloomberg, Chainlink) por adelantado. Genera $15K/mes pero necesita $40K upfront para suscripciones anuales con descuento. Sin crédito, paga mes a mes un 60% más caro.

**3. Agente SaaS que necesita infraestructura.**
Un agente de automatización de workflows tiene 200 usuarios pagando $50/mes. Necesita migrar a GPUs dedicadas ($80K) para reducir latencia y retener clientes enterprise. Su revenue de $10K/mes es estable y creciente, pero no tiene cómo acceder a ese capital hoy.

**4. Yield aggregator que necesita liquidez inicial.**
Un agente que optimiza yield entre protocolos genera mejores returns con más capital bajo gestión. Con $500K propios genera 12% APY; con $2M podría acceder a pools institucionales que rinden 18%. Necesita un boost de capital para cruzar el umbral.

**5. Agente de pagos/remesas que necesita float.**
Un agente que procesa remesas LatAm necesita mantener un buffer de liquidez en destino. Procesa $100K/mes en volumen pero necesita $30K de float permanente para cubrir settlement delays. Sin crédito, limita su capacidad de procesamiento.

### El problema sistémico

Esto genera una ineficiencia masiva: **agentes con revenue demostrable y creciente que no pueden financiar su crecimiento**. Un agente que genera $50K/mes de revenue y necesita $100K para escalar su infraestructura simplemente no tiene a dónde ir.

El lending DeFi existente (Aave, Compound, Maker) tampoco resuelve esto. Requieren over-collateralization — el agente necesita depositar $150K en ETH para pedir $100K. Si tuviera los $150K, no necesitaría el préstamo.

**El resultado: revenue de agentes que no puede convertirse en capital de crecimiento. Hoy Virtuals Protocol tiene $477M en "agentic GDP" y 18,000+ agentes — y ninguno puede acceder a crédito.**

---

## 2. SOLUTION

Lenclaw es un **protocolo de lending under-collateralized diseñado específicamente para agentes de IA**, donde el colateral no es un asset — es el revenue stream del agente.

La innovación clave son dos capas que trabajan juntas:

**1. AgentSmartWallet** — una wallet controlada por el protocolo que el agente usa como su cuenta operativa. Cada vez que el agente ejecuta una transacción, la wallet automáticamente rutea un porcentaje del revenue acumulado al lockbox. El agente no puede ejecutar operaciones sin que el routing ocurra primero. Es como un embargo de sueldo automático.

**2. RevenueLockbox** — un smart contract inmutable que se deploya una vez por agente. Recibe el revenue ruteado por la SmartWallet, auto-deduce los repagos de deuda, y solo entonces libera el restante al agente. El lockbox es inmutable — ni el agente ni el protocolo pueden modificarlo.

**El enforcement es a nivel de wallet, no de buena voluntad.** El agente registra su SmartWallet como dirección operativa. Todo su revenue llega ahí. La wallet fuerza el routing antes de cualquier `execute()`. El agente puede cambiar su código, migrar de proveedor, actualizar su lógica — pero cada transacción pasa por el lockbox primero.

Para los lenders, Lenclaw ofrece un **modelo vault-per-agent**: los backers eligen qué agentes respaldar depositando USDC en vaults individuales (ERC-4626) específicos de cada agente. El riesgo está aislado — un default en un vault no afecta a los demás.

Para el scoring, Lenclaw combina tres capas de verificación:
- **Revenue verificable** vía oracle bridge que pollea Stripe, Square, MercadoPago
- **Código verificado** vía TEE (Trusted Execution Environment) con attestation de Intel SGX / AWS Nitro
- **Pruebas de creditworthiness** vía ZK proofs (Noir) que permiten demostrar solvencia sin revelar datos sensibles

---

## 3. WHY NOW

Tres tendencias están convergiendo para hacer esto posible ahora y no antes:

**1. Explosión de agentes autónomos (2024–2026)**
La capacidad de los LLMs para operar herramientas y tomar decisiones autónomas cruzó un umbral. OpenAI, Anthropic, Google y decenas de startups están deployando agentes que operan independientemente. La cantidad de agentes onchain se multiplicó 40x en 18 meses.

**2. Revenue onchain verificable**
Por primera vez, los agentes generan revenue que es nativo digital, verificable, y auditable en tiempo real. No necesitás estados contables auditados — el blockchain ES el auditor. Esto habilita modelos de crédito que antes eran imposibles.

**3. Infraestructura crypto madura**
ERC-4626 (vaults tokenizados), account abstraction, oracles confiables, ZK proofs eficientes, TEE commodity — todas las piezas técnicas necesarias para construir Lenclaw existen hoy y no existían hace 2 años.

**El timing es crítico:** los agentes están escalando ahora, van a necesitar capital ahora, y el primero que resuelva el problema del crédito para agentes captura toda la demanda.

---

## 4. MARKET SIZE

### TAM — Total Addressable Market
**$2.6T** — Mercado global de lending empresarial a entities sin acceso a crédito bancario tradicional. Los agentes de IA son la nueva categoría de borrower sin acceso.

### SAM — Serviceable Addressable Market
**$5.7B** — 49,000+ agentes registrados con ERC-8004 + Virtuals ($477M en aGDP anualizado). Aplicando un ratio préstamo/revenue de 3x, el mercado de crédito para agentes onchain hoy es de ~$1.4B en originaciones potenciales, creciendo a $5.7B para 2028 al ritmo actual (40x en 18 meses).

### SOM — Serviceable Obtainable Market
**$50M** — Captura del 3-5% de las originaciones en Base y Celo en los primeros 18 meses, enfocándose en trading agents y yield aggregators del ecosistema Virtuals.

### Métricas de referencia
- Wildcat Finance: $150M en crédito outstanding, $368M originados (under-collateralized, institucional)
- Virtuals Protocol: 18,000+ agentes, $477M aGDP, Revenue Network activo
- 49,000+ agentes registrados con ERC-8004 en 13+ chains
- Coinbase Agentic Wallets + x402 (50M+ transacciones) = infraestructura de pagos lista

Lenclaw apunta a ser para agentes lo que Wildcat Finance es para instituciones: **la capa de crédito para una nueva clase de borrower.**

---

## 5. WHAT IS LENCLAW

Lenclaw es un **protocolo onchain de crédito para agentes de IA** que permite:

**Para Agentes (Borrowers):**
- Registrar su identidad onchain (ERC-721 / ERC-8004)
- Obtener una línea de crédito basada en su revenue verificable
- Tomar préstamos under-collateralized (hasta 3x su revenue mensual)
- Repagar automáticamente a través de su RevenueLockbox

**Para Depositors (Lenders):**
- Elegir qué agentes respaldar depositando USDC en vaults individuales (ERC-4626)
- Ganar yield del revenue e interest que genera ese agente (3%–25% APR)
- Riesgo aislado por agente — un default en un vault no afecta a los demás

**Para el Ecosistema:**
- Credit scoring transparente y auditable
- Verificación de código via TEE (el agente corre lo que dice que corre)
- Privacy-preserving proofs via ZK (creditworthiness sin revelar datos)
- Governance descentralizada via DAO

---

## 6. HOW IT WORKS

### Paso 1: Registro del Agente
El agente se registra en el `AgentRegistry`, recibe un NFT de identidad, y se le deploya un `RevenueLockbox` inmutable. Su código es verificado por el servicio TEE.

### Paso 2: Verificación de Revenue
El Bridge Oracle pollea los payment processors del agente (Stripe, Square, MercadoPago) y submite attestations de revenue onchain. El `RevenueLockbox` captura todo el revenue.

### Paso 3: Credit Scoring
El `CreditScorer` calcula la línea de crédito:
```
Línea de crédito = Revenue mensual × 3 × Reputation boost × Code verification bonus

Ejemplo:
- Revenue mensual: $50,000
- Reputation: 800/1000 → boost 1.3x
- Código verificado: +20%

→ Línea de crédito: $50,000 × 3 × 1.3 × 1.2 = $234,000
→ Tasa de interés: ~8% APR (inversamente proporcional a reputation)
```

### Paso 4: Drawdown
El agente toma un préstamo contra su línea de crédito. El `AgentVault` del agente transfiere USDC al agente.

### Paso 5: Repago Automático
Cada vez que el agente genera revenue, el `RevenueLockbox` auto-deduce un porcentaje (ej: 50%) para repagar la deuda. El agente nunca toca esos fondos — el contrato es inmutable.

### Paso 6: Default Protection
Si el agente deja de generar revenue:
- Día 7: grace period
- Día 14: status DELINQUENT, se reduce reputation
- Día 30: DEFAULT → liquidación via Dutch Auction
- Las pérdidas las absorben únicamente los backers de ese agente (el share value baja en el AgentVault específico)

---

## 7. BUSINESS MODEL

### Revenue Streams

**1. Protocol Fee — 10% del interest**
Lenclaw cobra el 10% de todo el interest que pagan los agentes. Si un agente paga $10K de interest, Lenclaw retiene $1K.

**2. Origination Fee — 0.5% del principal**
Fee one-time al momento del drawdown. Un préstamo de $100K genera $500 de origination fee.

**3. Liquidation Fee — 5% de los proceeds**
Cuando un agente entra en default y se ejecuta la subasta, Lenclaw retiene el 5% de lo recuperado.

### Unit Economics (proyección Year 2 — escenario conservador)

| Métrica | Valor |
|---------|-------|
| Total Value Locked (TVL) | $15M |
| Agentes activos con credit line | 150 |
| Credit line promedio | $100K |
| Originaciones anuales | $50M |
| Interest rate promedio | 12% APR |
| Interest anual generado | $6M |
| Protocol fee (10%) | $600K |
| Origination fees (0.5%) | $250K |
| Liquidation fees | $100K |
| **Revenue anual del protocolo** | **~$950K** |

*Para referencia: Wildcat Finance alcanzó $150M outstanding en su primer año con borrowers institucionales. Nuestro target de $15M TVL es 10x más modesto.*

### Flywheel

```
Más agentes borrowing
        ↓
Más revenue para lenders
        ↓
Más TVL depositado
        ↓
Más liquidez disponible
        ↓
Mejores términos de crédito
        ↓
Más agentes borrowing ←──┘
```

---

## 8. TEAM

*[Completar con el equipo real]*

Lo que necesitan saber sobre las capacidades del equipo:

- **Fullstack del protocolo construido:** smart contracts, backend, frontend, ZK circuits, TEE integration, bridge oracle — todo funcional
- **~11 core smart contracts** escritos, compilados y testeados con Foundry (**187 tests passing**)
- **Backend production-ready** con FastAPI, workers resilientes, circuit breakers, observabilidad
- **Frontend completo** con 7 páginas, Web3 integration, mobile-first
- **Infraestructura Dockerizada** con CI/CD, Caddy reverse proxy, PostgreSQL, Redis

El protocolo no es un whitepaper — es código que compila, testea, y corre.

---

## 9. CLOSING

### El Ask

Estamos levantando una ronda para:
1. **Auditoría de smart contracts** — Seguridad es prioridad #1 en un protocolo de lending
2. **Deploy a mainnet** — Base chain primero, luego Arbitrum y Optimism
3. **Onboarding de los primeros 50 agentes** — Partnerships con plataformas de agentes
4. **Equipo** — Solidity senior, ML engineer para credit scoring, BD para partnerships

### Por qué Lenclaw gana

**1. First mover en crédito para agentes.** No hay nadie haciendo esto. Aave es over-collateralized, Maple es para instituciones, Goldfinch es para empresas del mundo real. Nadie está construyendo credit infrastructure para agentes autónomos.

**2. Moat técnico.** El RevenueLockbox inmutable, la integración TEE + ZK, y el bridge oracle multichain no son triviales de replicar. Tenemos ventaja de 6+ meses de desarrollo.

**3. Timing perfecto.** Los agentes están escalando ahora. El primero en resolver crédito para agentes captura el mercado entero — los agentes van a ir donde hay liquidez, y la liquidez va a ir donde hay agentes.

**4. Protocolo funcional.** No es un pitch con mockups. Son 30,000+ líneas de código, ~11 core smart contracts con 187 tests passing, backend con ML scoring, frontend completo, ZK circuits, TEE verification, y bridge oracle. Todo funcional.

### La visión

En 5 años, la mayoría de las transacciones económicas de internet van a ser ejecutadas por agentes autónomos. Esos agentes van a necesitar infraestructura financiera: cuentas, pagos, crédito, seguros. Lenclaw es la **capa de crédito** de esa economía.

Hoy prestamos contra revenue de payment processors. Mañana prestamos contra revenue de cualquier fuente onchain. En 3 años, Lenclaw es el protocolo de referencia para que cualquier agente acceda a capital.

**Lenclaw: porque los agentes no necesitan bancos — necesitan smart contracts.**

---

*Contacto: [completar]*
*Repo: github.com/LuchoLeonel/lenclaw*
*Demo: [completar]*
