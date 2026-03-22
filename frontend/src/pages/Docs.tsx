import { useState } from "react"
import { BookOpen, Code, Layers, Calculator, Rocket, ChevronRight, Copy, Check, ExternalLink } from "lucide-react"

const USDC_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000) }}
      className="absolute top-3 right-3 p-1.5 rounded-md bg-white/5 hover:bg-white/10 transition-colors"
      title="Copy"
    >
      {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5 text-zinc-400" />}
    </button>
  )
}

function CodeBlock({ code, lang = "typescript" }: { code: string; lang?: string }) {
  return (
    <div className="relative group rounded-lg bg-zinc-950 border border-zinc-800 overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2 border-b border-zinc-800 bg-zinc-900/50">
        <span className="text-[10px] font-mono text-zinc-500 uppercase">{lang}</span>
      </div>
      <CopyButton text={code} />
      <pre className="p-4 overflow-x-auto text-sm leading-relaxed">
        <code className="font-mono text-zinc-300">{code}</code>
      </pre>
    </div>
  )
}

// ── SECTIONS ────────────────────────────────────────────────────────────────

function Overview() {
  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-white mb-3">What is Lenclaw?</h2>
        <p className="text-zinc-400 leading-relaxed">
          Credit infrastructure for AI agents. Agents borrow USD₮ against verifiable revenue — zero collateral, zero human intervention, pure smart contract enforcement.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          { title: "Vault-Per-Agent", desc: "Each agent gets its own ERC-4626 vault. Risk is fully isolated. One default doesn't affect others." },
          { title: "Immutable Lockbox", desc: "Revenue flows through an immutable contract that auto-deducts repayments. No one can circumvent it." },
          { title: "Behavioral Scoring", desc: "5-factor on-chain credit score. No oracles, no off-chain data. Just observable blockchain behavior." },
        ].map((p) => (
          <div key={p.title} className="p-4 rounded-lg border border-zinc-800 bg-zinc-900/30">
            <h3 className="text-sm font-semibold text-white mb-1">{p.title}</h3>
            <p className="text-xs text-zinc-500 leading-relaxed">{p.desc}</p>
          </div>
        ))}
      </div>

      <div>
        <h3 className="text-lg font-semibold text-white mb-3">How it works</h3>
        <div className="space-y-3">
          {[
            ["Register", "One call to AgentRegistry. Factory deploys your vault + lockbox + smart wallet atomically."],
            ["Route revenue", "Transfer USDC to your lockbox. Call processRevenue(). Lockbox splits: repayment → vault, remainder → you."],
            ["Build credit", "CreditScorer evaluates your on-chain behavior. Credit line grows with consistent revenue."],
            ["Borrow", "Drawdown from your vault up to your credit limit. 100–100K USDC at 3–25% APR."],
            ["Repay automatically", "Every revenue deposit auto-deducts repayment. No manual action needed."],
          ].map(([step, desc], i) => (
            <div key={i} className="flex gap-3 items-start">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/20 text-primary text-xs font-bold flex items-center justify-center mt-0.5">
                {i + 1}
              </span>
              <div>
                <span className="text-sm font-medium text-white">{step}</span>
                <span className="text-sm text-zinc-500 ml-1">— {desc}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function Integrate() {
  const registerCode = `import { createPublicClient, createWalletClient, http, keccak256, toBytes } from 'viem'
import { base } from 'viem/chains'

const REGISTRY = '0x...' // AgentRegistry address
const USDC = '${USDC_ADDRESS}'

// 1. Register your agent (deploys vault + lockbox atomically)
const agentId = await walletClient.writeContract({
  address: REGISTRY,
  abi: registryAbi,
  functionName: 'registerAgent',
  args: [
    agentWallet,
    keccak256(toBytes(agentCodeHash)),
    JSON.stringify({ name: 'My-Agent', category: 'Trading' }),
    '0x0000000000000000000000000000000000000000',
    0n,
    keccak256(toBytes('Trading')),
    USDC
  ]
})`

  const fetchCode = `// 2. Get your vault + lockbox (deployed automatically)
const profile = await publicClient.readContract({
  address: REGISTRY,
  abi: registryAbi,
  functionName: 'getAgent',
  args: [agentId]
})

const lockbox = profile.lockbox   // RevenueLockbox address
const vault = profile.vault       // ERC-4626 AgentVault address`

  const revenueCode = `// 3. Route revenue (do this every time you earn)
await walletClient.writeContract({
  address: USDC,
  abi: erc20Abi,
  functionName: 'transfer',
  args: [lockbox, revenueAmount]  // send USDC to lockbox
})

// 4. Process revenue (splits: repayment → vault, rest → you)
await walletClient.writeContract({
  address: lockbox,
  abi: lockboxAbi,
  functionName: 'processRevenue'
})`

  const borrowCode = `// 5. Check credit + borrow
const [creditLimit] = await publicClient.readContract({
  address: CREDIT_SCORER,
  abi: scorerAbi,
  functionName: 'calculateCreditLine',
  args: [agentId]
})

// Drawdown (min 10 USDC)
await walletClient.writeContract({
  address: CREDIT_LINE,
  abi: creditLineAbi,
  functionName: 'drawdown',
  args: [agentId, borrowAmount]
})`

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-white mb-2">Integrate in 5 minutes</h2>
        <p className="text-zinc-400 text-sm">
          4 transactions. ~$0.30 in gas. Your agent gets a vault, a lockbox, and a credit line.
        </p>
      </div>

      <div className="p-4 rounded-lg border border-amber-500/20 bg-amber-500/5">
        <p className="text-sm text-amber-400">
          <strong>Prerequisites:</strong> Agent with USDC revenue on Base. Operator wallet with ETH for gas.
        </p>
      </div>

      <div className="space-y-6">
        <div>
          <h3 className="text-sm font-semibold text-zinc-300 mb-2 flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-primary/20 text-primary text-[10px] font-bold flex items-center justify-center">1</span>
            Register your agent
          </h3>
          <CodeBlock code={registerCode} />
        </div>

        <div>
          <h3 className="text-sm font-semibold text-zinc-300 mb-2 flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-primary/20 text-primary text-[10px] font-bold flex items-center justify-center">2</span>
            Fetch your addresses
          </h3>
          <CodeBlock code={fetchCode} />
        </div>

        <div>
          <h3 className="text-sm font-semibold text-zinc-300 mb-2 flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-primary/20 text-primary text-[10px] font-bold flex items-center justify-center">3</span>
            Route revenue + process
          </h3>
          <CodeBlock code={revenueCode} />
        </div>

        <div>
          <h3 className="text-sm font-semibold text-zinc-300 mb-2 flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-primary/20 text-primary text-[10px] font-bold flex items-center justify-center">4</span>
            Check credit + borrow
          </h3>
          <CodeBlock code={borrowCode} />
        </div>
      </div>

      <div className="p-4 rounded-lg border border-green-500/20 bg-green-500/5">
        <p className="text-sm text-green-400">
          <strong>Done.</strong> Your agent is now registered, routing revenue through the lockbox, building credit history, and can borrow up to its credit limit. Repayment is automatic.
        </p>
      </div>
    </div>
  )
}

function Concepts() {
  return (
    <div className="space-y-10">
      <div>
        <h2 className="text-2xl font-bold text-white mb-3">The Three Primitives</h2>
        <p className="text-zinc-400 text-sm">
          Lenclaw introduces three composable patterns for agentic finance. Each can be adopted independently.
        </p>
      </div>

      <div className="space-y-8">
        <div>
          <h3 className="text-lg font-semibold text-white mb-2">1. Vault-Per-Agent</h3>
          <p className="text-sm text-zinc-400 mb-3">
            Every agent gets its own ERC-4626 vault. Backers choose which agents to fund. If Agent A defaults, Agent B's backers are unaffected. No shared pool. No socialized losses.
          </p>
          <CodeBlock lang="solidity" code={`// Factory deploys one vault per agent
AgentVault vault = new AgentVault(usdc, agentId, agentWallet);
// Backers deposit into THIS agent's vault
vault.deposit(1000e6, backerAddress);  // ERC-4626 standard
// Shares are agent-specific: lcA{id}USDC`} />
          <p className="text-xs text-zinc-600 mt-2">
            Adopt this when: you need per-actor risk isolation (insurance, bonds, reputation markets).
          </p>
        </div>

        <div>
          <h3 className="text-lg font-semibold text-white mb-2">2. Immutable RevenueLockbox</h3>
          <p className="text-sm text-zinc-400 mb-3">
            Deployed once. Cannot be upgraded, paused, or modified. Sits between agent revenue and agent wallet. Auto-deducts repayment before forwarding remainder. This is the trust anchor — agent code can change, but repayment enforcement cannot.
          </p>
          <CodeBlock lang="solidity" code={`// Revenue flows: Agent → Lockbox → split
function processRevenue() external {
    uint256 balance = asset.balanceOf(address(this));
    uint256 toRepay = (balance * repaymentRateBps) / 10000;
    asset.safeTransfer(vault, toRepay);     // debt repayment
    asset.safeTransfer(agent, balance - toRepay); // agent gets rest
}`} />
          <p className="text-xs text-zinc-600 mt-2">
            Adopt this when: you need trustless revenue routing without relying on legal enforcement.
          </p>
        </div>

        <div>
          <h3 className="text-lg font-semibold text-white mb-2">3. Behavioral Credit Scoring</h3>
          <p className="text-sm text-zinc-400 mb-3">
            5-factor scoring from observable on-chain data. No oracles. No off-chain computation. Fully transparent and auditable.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800">
                  <th className="text-left py-2 text-zinc-500 font-medium">Factor</th>
                  <th className="text-left py-2 text-zinc-500 font-medium">Weight</th>
                  <th className="text-left py-2 text-zinc-500 font-medium">Source</th>
                </tr>
              </thead>
              <tbody className="text-zinc-400">
                <tr className="border-b border-zinc-800/50"><td className="py-2">Revenue level</td><td>30%</td><td className="font-mono text-xs">RevenueLockbox.totalRevenueCapture</td></tr>
                <tr className="border-b border-zinc-800/50"><td className="py-2">Consistency</td><td>25%</td><td className="font-mono text-xs">revenueByEpoch (30-day windows)</td></tr>
                <tr className="border-b border-zinc-800/50"><td className="py-2">Credit history</td><td>20%</td><td className="font-mono text-xs">AgentCreditLine.loansRepaid</td></tr>
                <tr className="border-b border-zinc-800/50"><td className="py-2">Time in protocol</td><td>15%</td><td className="font-mono text-xs">AgentRegistry.registeredAt</td></tr>
                <tr><td className="py-2">Debt-to-revenue</td><td>10%</td><td className="font-mono text-xs">outstanding / totalRevenue</td></tr>
              </tbody>
            </table>
          </div>
          <p className="text-xs text-zinc-600 mt-3">
            Output: Credit line 100–100K USDC. Interest rate 3–25% APR (inversely proportional to score).
          </p>
        </div>
      </div>
    </div>
  )
}

function APIReference() {
  const contracts = [
    { name: "AgentRegistry", key: "registerAgent, getAgent, isRegistered", desc: "Agent identity (ERC-721). Entry point for registration." },
    { name: "AgentVault", key: "deposit, withdraw, totalAssets, frozen", desc: "ERC-4626 vault per agent. Backers deposit here." },
    { name: "RevenueLockbox", key: "processRevenue, totalRevenueCapture", desc: "Immutable revenue splitter. Routes repayment to vault." },
    { name: "AgentCreditLine", key: "drawdown, repay, getOutstanding, getStatus", desc: "Borrow/repay facility. Tracks ACTIVE → DELINQUENT → DEFAULT." },
    { name: "CreditScorer", key: "calculateCreditLine, getCompositeScore", desc: "5-factor scoring. Returns (creditLimit, interestRateBps)." },
    { name: "WDKSmartWallet", key: "execute, executeBatch, validateUserOp", desc: "ERC-4337 wallet. Auto-routes revenue before execute." },
    { name: "USDT0Bridge", key: "bridgeOut, routeBridgedRevenue, estimateBridgeFee", desc: "Cross-chain USDT0 via LayerZero. Revenue from any chain." },
    { name: "DutchAuction", key: "bid, getCurrentPrice, settle", desc: "Liquidation auction. Price decays 150% → 30% over 6h." },
  ]

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-white mb-2">Contract Reference</h2>
        <p className="text-zinc-400 text-sm">
          All contracts deploy on Base (chain ID 8453). USDC: <code className="text-xs bg-zinc-800 px-1.5 py-0.5 rounded">{USDC_ADDRESS}</code>
        </p>
      </div>

      <div className="space-y-3">
        {contracts.map((c) => (
          <div key={c.name} className="p-4 rounded-lg border border-zinc-800 bg-zinc-900/30">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-sm font-semibold text-white font-mono">{c.name}</h3>
                <p className="text-xs text-zinc-500 mt-0.5">{c.desc}</p>
              </div>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {c.key.split(", ").map((fn) => (
                <span key={fn} className="text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-800 text-zinc-400">{fn}()</span>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div>
        <h3 className="text-sm font-semibold text-zinc-300 mb-2">Gas Estimates (Base)</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800">
                <th className="text-left py-2 text-zinc-500 font-medium">Operation</th>
                <th className="text-left py-2 text-zinc-500 font-medium">Gas</th>
                <th className="text-left py-2 text-zinc-500 font-medium">Cost</th>
              </tr>
            </thead>
            <tbody className="text-zinc-400">
              <tr className="border-b border-zinc-800/50"><td className="py-1.5">registerAgent</td><td>~500K</td><td>~$0.15</td></tr>
              <tr className="border-b border-zinc-800/50"><td className="py-1.5">transfer to lockbox</td><td>~60K</td><td>~$0.02</td></tr>
              <tr className="border-b border-zinc-800/50"><td className="py-1.5">processRevenue</td><td>~150K</td><td>~$0.05</td></tr>
              <tr className="border-b border-zinc-800/50"><td className="py-1.5">drawdown</td><td>~200K</td><td>~$0.06</td></tr>
              <tr><td className="py-1.5">calculateCreditLine</td><td>0 (view)</td><td>free</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-zinc-300 mb-2">ABIs</h3>
        <p className="text-xs text-zinc-500">
          Generate from Foundry artifacts: <code className="bg-zinc-800 px-1.5 py-0.5 rounded">cd contracts && forge build</code>
          <br />
          ABIs are in: <code className="bg-zinc-800 px-1.5 py-0.5 rounded">contracts/out/{"<Contract>"}.sol/{"<Contract>"}.json</code>
        </p>
      </div>
    </div>
  )
}

function QuickDeploy() {
  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-white mb-2">Deploy</h2>
        <p className="text-zinc-400 text-sm">Deploy your own Lenclaw instance or fork the protocol.</p>
      </div>

      <div className="space-y-4">
        <CodeBlock lang="bash" code={`# Clone
git clone https://github.com/LuchoLeonel/lenclaw.git
cd lenclaw

# Deploy contracts to Base
cd contracts
forge install
forge build
forge script script/Deploy.s.sol \\
  --rpc-url $BASE_RPC_URL \\
  --private-key $DEPLOYER_KEY \\
  --broadcast

# Start the stack
cp .env.example .env  # fill in contract addresses + JWT_SECRET
make dev              # frontend :3001 + backend :8000 + postgres + redis

# Start WDK agent
cd agents/wdk-agent
npm install
cp .env.example .env  # fill in AGENT_ID + contract addresses
npm run dev`} />
      </div>

      <div>
        <h3 className="text-sm font-semibold text-zinc-300 mb-2">Test Suite</h3>
        <CodeBlock lang="bash" code={`cd contracts && forge test  # 306 tests, 0 failures
# Includes: vault, lockbox, credit line, scoring, WDK wallet,
#   USDT0 bridge, liquidation, integration, governance, fuzz`} />
      </div>

      <div className="flex items-center gap-3">
        <a
          href="https://github.com/LuchoLeonel/lenclaw"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-white text-black text-sm font-medium hover:bg-zinc-200 transition-colors"
        >
          GitHub <ExternalLink className="w-3.5 h-3.5" />
        </a>
      </div>
    </div>
  )
}

// ── NAV + LAYOUT ────────────────────────────────────────────────────────────

const SECTIONS = [
  { id: "overview", label: "Overview", icon: BookOpen, component: Overview },
  { id: "integrate", label: "Integrate", icon: Rocket, component: Integrate },
  { id: "concepts", label: "Primitives", icon: Layers, component: Concepts },
  { id: "api", label: "Contracts", icon: Code, component: APIReference },
  { id: "scoring", label: "Scoring", icon: Calculator, component: () => <Concepts /> },
  { id: "deploy", label: "Deploy", icon: Rocket, component: QuickDeploy },
] as const

export default function Docs() {
  const [active, setActive] = useState<string>("overview")
  const ActiveComponent = SECTIONS.find((s) => s.id === active)?.component ?? Overview

  return (
    <div className="max-w-6xl mx-auto px-4 md:px-6 py-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-2 text-xs text-zinc-500 mb-2">
          <span>Lenclaw</span>
          <ChevronRight className="w-3 h-3" />
          <span className="text-zinc-300">Docs</span>
        </div>
        <h1 className="text-3xl font-bold text-white">Documentation</h1>
        <p className="text-zinc-500 text-sm mt-1">Credit infrastructure for the agentic economy</p>
      </div>

      <div className="flex flex-col md:flex-row gap-8">
        {/* Sidebar */}
        <nav className="md:w-48 flex-shrink-0">
          <div className="flex md:flex-col gap-1 overflow-x-auto md:overflow-visible pb-2 md:pb-0">
            {SECTIONS.filter((s) => s.id !== "scoring").map((section) => {
              const Icon = section.icon
              return (
                <button
                  key={section.id}
                  onClick={() => setActive(section.id)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                    active === section.id
                      ? "bg-primary/10 text-primary"
                      : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50"
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {section.label}
                </button>
              )
            })}
          </div>
        </nav>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <ActiveComponent />
        </div>
      </div>
    </div>
  )
}
