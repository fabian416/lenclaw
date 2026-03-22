import { useState } from "react"
import { useParams, useNavigate } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { StatCard } from "@/components/shared/StatCard"
import { StatusBadge } from "@/components/shared/StatusBadge"
import { formatUSD, formatPercent, shortenAddress, getRiskColor, getRiskLabel, timeAgo } from "@/lib/utils"
import { ReputationRing } from "@/components/shared/ReputationRing"
import {
  ArrowLeft,
  Bot,
  TrendingUp,
  DollarSign,
  Users,
  ShieldCheck,
  Zap,
  AlertTriangle,
  X,
  Activity,
  Wallet,
  CheckCircle2,
  XCircle,
  Star,
  ArrowUpRight,
} from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import { SpotlightCard } from "@/components/reactbits/SpotlightCard"
import { Magnet } from "@/components/reactbits/Magnet"
import { ClickSpark } from "@/components/reactbits/ClickSpark"
import { SpotlightButton } from "@/components/reactbits/SpotlightButton"
import { BorderBeam } from "@/components/reactbits/BorderBeam"
import { TextScramble } from "@/components/reactbits/TextScramble"
import { NumberTicker } from "@/components/reactbits/NumberTicker"
import { AnimatedContent } from "@/components/reactbits/AnimatedContent"
import type { ActivityEvent, RiskLevel } from "@/lib/types"
import { MOCK_AGENTS_WITH_VAULT } from "@/lib/constants"
import { useWDK } from "@/providers/WDKProvider"
import { WDKWalletButton } from "@/components/wallet/WDKWalletButton"

// ── Helpers ──────────────────────────────────────────────────────────────────

function getMockEvents(agentId: number, agentName: string): ActivityEvent[] {
  const now = Math.floor(Date.now() / 1000)
  return [
    { id: "e1", type: "revenue", agentId, agentName, amount: 1_240, message: `${agentName} earned $1,240 from DEX arbitrage`, timestamp: now - 1800 },
    { id: "e2", type: "repayment", agentId, agentName, amount: 2_400, message: `${agentName} repaid $2,400 on schedule`, timestamp: now - 7200 },
    { id: "e3", type: "backing", agentId, agentName, amount: 5_000, message: `0x742d...bD1e backed ${agentName} with $5,000`, timestamp: now - 14400 },
    { id: "e4", type: "revenue", agentId, agentName, amount: 890, message: `${agentName} earned $890 from swap fees`, timestamp: now - 28800 },
    { id: "e5", type: "revenue", agentId, agentName, amount: 2_100, message: `${agentName} earned $2,100 from MEV capture`, timestamp: now - 43200 },
    { id: "e6", type: "repayment", agentId, agentName, amount: 2_400, message: `${agentName} repaid $2,400 on schedule`, timestamp: now - 86400 },
    { id: "e7", type: "backing", agentId, agentName, amount: 10_000, message: `0x8Ba1...DBA7 backed ${agentName} with $10,000`, timestamp: now - 129600 },
    { id: "e8", type: "revenue", agentId, agentName, amount: 1_560, message: `${agentName} earned $1,560 from liquidity provision`, timestamp: now - 172800 },
    { id: "e9", type: "milestone", agentId, agentName, message: `${agentName} hit $100K total revenue`, timestamp: now - 259200 },
    { id: "e10", type: "withdrawal", agentId, agentName, amount: 3_000, message: `0xdD87...2148 withdrew $3,000 from ${agentName}`, timestamp: now - 345600 },
  ]
}

const MOCK_BACKERS = [
  { address: "0x742d35Cc6634C0532925a3b844Bc9e7595f2bD1e", amount: 45_000 },
  { address: "0x8Ba1f109551bD432803012645Ac136ddd64DBA72", amount: 32_000 },
  { address: "0xdD870fA1b7C4700F2BD7f44238821C26f7392148", amount: 28_500 },
  { address: "0x583031D1113aD414F02576BD6afaBfb302140225", amount: 21_000 },
  { address: "0x4B0897b0513fdC7C541B6d9D7E929C4e5364D2dB", amount: 18_200 },
  { address: "0x1aE0EA34a72D944a8C7603FfB3eC30a6669E454C", amount: 15_800 },
  { address: "0x14723A09ACff6D2A60DcdF7aA4AFf308FDDC160C", amount: 12_400 },
  { address: "0xCA35b7d915458EF540aDe6068dFe2F44E8fa733c", amount: 8_600 },
]

// ── Activity event icon ──────────────────────────────────────────────────────

function EventIcon({ type }: { type: ActivityEvent["type"] }) {
  const iconMap: Record<ActivityEvent["type"], { Icon: typeof DollarSign; color: string }> = {
    revenue: { Icon: DollarSign, color: "text-success" },
    backing: { Icon: ArrowUpRight, color: "text-primary" },
    repayment: { Icon: CheckCircle2, color: "text-success" },
    late_payment: { Icon: AlertTriangle, color: "text-warning" },
    default: { Icon: XCircle, color: "text-destructive" },
    milestone: { Icon: Star, color: "text-primary" },
    new_agent: { Icon: Bot, color: "text-primary" },
    withdrawal: { Icon: Wallet, color: "text-muted-foreground" },
  }
  const { Icon, color } = iconMap[type] || { Icon: Activity, color: "text-muted-foreground" }
  return <Icon className={`w-4 h-4 ${color} flex-shrink-0`} />
}

// ── Risk Meter gauge ─────────────────────────────────────────────────────────

function RiskMeter({ risk, score }: { risk: RiskLevel; score: number }) {
  const riskValue: Record<RiskLevel, number> = {
    safe: 20,
    moderate: 45,
    risky: 70,
    degen: 92,
  }
  const percent = riskValue[risk]
  const color = getRiskColor(risk)

  // Arc gauge: 180-degree arc
  const size = 160
  const strokeWidth = 10
  const radius = (size - strokeWidth) / 2
  const circumference = Math.PI * radius // half-circle
  const offset = circumference - (percent / 100) * circumference

  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ width: size, height: size / 2 + 20 }}>
        <svg width={size} height={size / 2 + 20} viewBox={`0 0 ${size} ${size / 2 + 20}`}>
          {/* Background arc */}
          <path
            d={`M ${strokeWidth / 2} ${size / 2 + 10} A ${radius} ${radius} 0 0 1 ${size - strokeWidth / 2} ${size / 2 + 10}`}
            fill="none"
            stroke="currentColor"
            className="text-border"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
          />
          {/* Filled arc */}
          <motion.path
            d={`M ${strokeWidth / 2} ${size / 2 + 10} A ${radius} ${radius} 0 0 1 ${size - strokeWidth / 2} ${size / 2 + 10}`}
            fill="none"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset: offset }}
            transition={{ duration: 1.2, ease: [0.4, 0, 0.2, 1] }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-end pb-1">
          <span className="text-lg font-bold text-foreground" style={{ color }}>{getRiskLabel(risk)}</span>
          <span className="text-[10px] text-muted-foreground">Rep. Score: {score}/100</span>
        </div>
      </div>
    </div>
  )
}

// ── Revenue Chart (30d bars) ─────────────────────────────────────────────────

function RevenueChart({ data }: { data: number[] }) {
  const max = Math.max(...data, 1)

  return (
    <div className="flex items-end gap-[3px] h-28 w-full">
      {data.map((value, i) => {
        const heightPercent = (value / max) * 100
        return (
          <motion.div
            key={i}
            className="flex-1 rounded-t-sm bg-primary/70 hover:bg-primary transition-colors cursor-default min-w-0"
            initial={{ height: 0 }}
            animate={{ height: `${heightPercent}%` }}
            transition={{ duration: 0.5, delay: i * 0.02, ease: [0.4, 0, 0.2, 1] }}
            title={`Day ${i + 1}: $${value.toFixed(0)}`}
          />
        )
      })}
    </div>
  )
}

// ── Main Component ───────────────────────────────────────────────────────────

export default function AgentDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [backAmount, setBackAmount] = useState("")
  const [mobileBackOpen, setMobileBackOpen] = useState(false)
  const [depositState, setDepositState] = useState<"idle" | "pending" | "success">("idle")
  const [depositError, setDepositError] = useState("")
  const wdk = useWDK()
  const isConnected = wdk.isConnected

  const agent = MOCK_AGENTS_WITH_VAULT.find((a) => String(a.id) === id)

  const events = agent ? getMockEvents(agent.id, agent.name) : []
  const estimatedMonthlyYield = agent && backAmount ? (parseFloat(backAmount) * (agent.vault.apy / 100)) / 12 : 0
  const isDefaulted = agent?.status === "default"
  const isRisky = agent?.riskLevel === "risky" || agent?.riskLevel === "degen"
  const availableCapacity = agent ? Math.max(agent.vault.cap - agent.vault.totalBacked, 0) : 0

  const handleDeposit = () => {
    if (!isConnected || !agent) {
      return
    }
    const amount = parseFloat(backAmount)
    if (!backAmount || amount <= 0) return
    if (amount > availableCapacity) {
      setDepositError(
        availableCapacity <= 0
          ? "This vault is fully backed. No additional capacity available."
          : `Amount exceeds available capacity of ${formatUSD(availableCapacity)}.`
      )
      return
    }
    setDepositError("")
    setDepositState("pending")
    setTimeout(() => {
      setDepositState("success")
      setTimeout(() => setDepositState("idle"), 3000)
    }, 2000)
  }

  if (!agent) {
    return (
      <div className="max-w-5xl mx-auto px-6 py-24 text-center">
        <div className="w-16 h-16 rounded-full bg-muted border border-border flex items-center justify-center mx-auto mb-6">
          <Bot className="w-8 h-8 text-muted-foreground" />
        </div>
        <h2 className="text-lg font-semibold mb-2 text-foreground">Agent not found</h2>
        <p className="text-sm text-muted-foreground mb-6 max-w-sm mx-auto">
          This agent doesn't exist or may have been removed. Browse available agents to find one to back.
        </p>
        <Button variant="outline" onClick={() => navigate("/agents")}>
          <ArrowLeft className="w-4 h-4 mr-2" /> Browse Agents
        </Button>
      </div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="max-w-5xl mx-auto px-4 sm:px-6 py-8 md:py-12 pb-40 md:pb-12"
    >
      {/* Back navigation */}
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6 group -ml-2 px-2 py-2"
      >
        <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
        Back
      </button>

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <AnimatedContent delay={0}>
        <div className="flex items-center gap-4 mb-8 md:mb-10">
          <div
            className="w-12 h-12 rounded-full border border-border flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor: `${agent.avatarColor}15` }}
          >
            <Bot className="w-6 h-6" style={{ color: agent.avatarColor }} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl md:text-2xl font-bold tracking-tight truncate text-foreground">{agent.name}</h1>
              <StatusBadge status={agent.status} />
              {agent.hasSmartWallet && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium uppercase tracking-wider border text-sky-600 bg-sky-50 border-sky-200 dark:text-sky-400 dark:bg-sky-900/30 dark:border-sky-500/30 ring-1 ring-sky-300/50 dark:ring-sky-500/20">
                  <ShieldCheck className="w-3 h-3" />
                  Smart Wallet
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              <Badge variant="outline" className="text-[10px] flex-shrink-0">
                <TextScramble text={agent.erc8004Id} trigger="hover" speed={40} />
              </Badge>
              <span className="text-xs text-muted-foreground line-clamp-2 md:truncate">{agent.description}</span>
            </div>
          </div>
          <div className="hidden md:block flex-shrink-0">
            <ReputationRing score={agent.reputationScore} size={56} strokeWidth={4} />
          </div>
        </div>
      </AnimatedContent>

      {/* ── Stats Grid ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 mb-8 md:mb-10">
        <StatCard label="APY" value={formatPercent(agent.vault.apy)} icon={TrendingUp} sublabel={isDefaulted ? "Defaulted" : undefined} trend={isDefaulted ? "down" : "up"} delay={0} />
        <StatCard label="Revenue 30d" value={formatUSD(agent.revenue30d)} icon={DollarSign} delay={1} />
        <StatCard label="Total Backed" value={formatUSD(agent.vault.totalBacked)} icon={Wallet} delay={2} />
        <StatCard label="Backers" value={String(agent.vault.backersCount)} icon={Users} delay={3} />
      </div>

      <div className="grid md:grid-cols-5 gap-6">
        {/* ── Left Column ───────────────────────────────────────────────── */}
        <div className="md:col-span-3 space-y-6">
          {/* Risk Meter */}
          <AnimatedContent delay={0.1}>
            <BorderBeam duration={8}>
              <div className="border border-border bg-card rounded-xl p-6">
                <div className="flex items-center gap-2 mb-4">
                  <ShieldCheck className="w-4 h-4 text-primary/50" />
                  <h3 className="text-sm font-medium text-foreground">Risk Assessment</h3>
                </div>
                <RiskMeter risk={agent.riskLevel} score={agent.reputationScore} />
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-5">
                  <div className="p-3 rounded-lg bg-muted text-center">
                    <div className="text-[10px] text-muted-foreground mb-1 uppercase tracking-wider">Utilization</div>
                    <div className="text-sm font-semibold mono-text text-foreground">{agent.utilization}%</div>
                  </div>
                  <div className="p-3 rounded-lg bg-muted text-center">
                    <div className="text-[10px] text-muted-foreground mb-1 uppercase tracking-wider">Credit Line</div>
                    <div className="text-sm font-semibold mono-text text-foreground">{formatUSD(agent.creditLine)}</div>
                  </div>
                  <div className="p-3 rounded-lg bg-muted text-center">
                    <div className="text-[10px] text-muted-foreground mb-1 uppercase tracking-wider">Risk Level</div>
                    <div className="text-sm font-semibold mono-text" style={{ color: getRiskColor(agent.riskLevel) }}>
                      {getRiskLabel(agent.riskLevel)}
                    </div>
                  </div>
                </div>

                {agent.hasSmartWallet && (
                  <div className="mt-4 p-3 rounded-lg bg-sky-50 dark:bg-sky-900/20 border border-sky-200 dark:border-sky-500/30">
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="w-4 h-4 text-sky-600 dark:text-sky-400 flex-shrink-0" />
                      <div>
                        <div className="text-sm font-medium text-sky-700 dark:text-sky-300">Smart Wallet Verified</div>
                        <div className="text-[11px] text-sky-600/80 dark:text-sky-400/70 mt-0.5">
                          Revenue auto-routes to lockbox. Higher trust score via on-chain verification.
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </BorderBeam>
          </AnimatedContent>

          {/* Revenue Chart */}
          <AnimatedContent delay={0.15}>
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: 0.2 }}
              className="border border-border bg-card rounded-xl p-6"
            >
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-primary/50" />
                  <h3 className="text-sm font-medium text-foreground">Revenue (30d)</h3>
                </div>
                <div className="text-right">
                  <div className="text-lg font-semibold mono-text text-foreground">
                    <NumberTicker value={agent.revenue30d} prefix="$" />
                  </div>
                  <div className="text-[10px] text-muted-foreground">Total 30d</div>
                </div>
              </div>
              <RevenueChart data={agent.vault.revenueHistory} />
              <div className="flex justify-between mt-2 text-[10px] text-muted-foreground">
                <span>30d ago</span>
                <span>Today</span>
              </div>
            </motion.div>
          </AnimatedContent>

          {/* Activity Feed */}
          <AnimatedContent delay={0.2}>
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: 0.25 }}
              className="border border-border bg-card rounded-xl p-6"
            >
              <div className="flex items-center gap-2 mb-5">
                <Activity className="w-4 h-4 text-primary/50" />
                <h3 className="text-sm font-medium text-foreground">Activity</h3>
              </div>
              <div className="space-y-0 divide-y divide-border">
                {events.map((event) => (
                  <div key={event.id} className="flex items-start gap-3 py-3 md:hover:bg-muted -mx-2 px-2 rounded-lg transition-colors duration-200">
                    <div className="mt-0.5">
                      <EventIcon type={event.type} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-foreground leading-snug line-clamp-2">{event.message}</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">{timeAgo(event.timestamp)}</p>
                    </div>
                    {event.amount && (
                      <span className="text-sm font-medium mono-text text-foreground flex-shrink-0">
                        {formatUSD(event.amount)}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </motion.div>
          </AnimatedContent>

          {/* Backers List */}
          <AnimatedContent delay={0.25}>
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: 0.3 }}
              className="border border-border bg-card rounded-xl p-6"
            >
              <div className="flex items-center gap-2 mb-5">
                <Users className="w-4 h-4 text-primary/50" />
                <h3 className="text-sm font-medium text-foreground">Top Backers</h3>
                <Badge variant="secondary" className="ml-auto text-[10px]">{agent.vault.backersCount} total</Badge>
              </div>
              <div className="space-y-0 divide-y divide-border">
                {MOCK_BACKERS.slice(0, agent.vault.backersCount > 8 ? 8 : agent.vault.backersCount).map((backer, i) => (
                  <div key={i} className="flex items-center justify-between py-3 md:hover:bg-muted -mx-2 px-2 rounded-lg transition-colors duration-200">
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-muted-foreground w-5 text-right mono-text">#{i + 1}</span>
                      <span className="text-sm mono-text text-foreground">
                        <TextScramble text={shortenAddress(backer.address)} trigger="hover" speed={30} />
                      </span>
                    </div>
                    <span className="text-sm font-medium mono-text text-foreground">{formatUSD(backer.amount)}</span>
                  </div>
                ))}
              </div>
            </motion.div>
          </AnimatedContent>

          {/* Mobile reputation ring */}
          <div className="md:hidden flex justify-center">
            <ReputationRing score={agent.reputationScore} size={80} strokeWidth={5} />
          </div>
        </div>

        {/* ── Right Column: Back this Agent (desktop) ────────────────────── */}
        <div className="hidden md:block md:col-span-2">
          <SpotlightCard className="p-6 sticky top-24">
            <h3 className="text-sm font-medium mb-5 text-foreground flex items-center gap-2">
              <Zap className="w-4 h-4 text-primary/50" />
              Back this Agent
            </h3>
            <div className="space-y-4">
              <div className="p-4 rounded-lg bg-muted text-center">
                <div className="text-[10px] text-muted-foreground mb-1 uppercase tracking-wider">Current APY</div>
                <div className="text-2xl font-bold mono-text" style={{ color: getRiskColor(agent.riskLevel) }}>
                  <NumberTicker value={agent.vault.apy} suffix="%" />
                </div>
              </div>

              <div>
                <label className="text-[10px] text-muted-foreground mb-1.5 block uppercase tracking-wider">Amount (USDT)</label>
                <div className="relative">
                  <Input
                    type="number"
                    placeholder="0.00"
                    value={backAmount}
                    onChange={(e) => setBackAmount(e.target.value)}
                    className="pr-16 text-lg h-12 mono-text"
                    disabled={isDefaulted}
                  />
                  <button
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-primary font-semibold px-2 py-1 hover:text-primary/70 transition-colors duration-200"
                    onClick={() => setBackAmount(String(availableCapacity))}
                    disabled={isDefaulted}
                  >
                    MAX
                  </button>
                </div>
              </div>

              <div className="space-y-2 text-sm p-3 rounded-lg bg-muted">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">APY</span>
                  <span className="font-medium mono-text text-foreground">{formatPercent(agent.vault.apy)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Risk Level</span>
                  <span className="font-medium mono-text" style={{ color: getRiskColor(agent.riskLevel) }}>
                    {getRiskLabel(agent.riskLevel)}
                  </span>
                </div>
                <AnimatePresence>
                  {backAmount && parseFloat(backAmount) > 0 && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="space-y-2 pt-2 border-t border-border"
                    >
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Est. Monthly Yield</span>
                        <span className="font-medium mono-text text-success">{formatUSD(estimatedMonthlyYield)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Est. Annual Yield</span>
                        <span className="font-medium mono-text text-success">{formatUSD(estimatedMonthlyYield * 12)}</span>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {!isConnected ? (
                <WDKWalletButton />
              ) : (
                <Magnet strength={0.15}>
                  <ClickSpark>
                    <SpotlightButton
                      onClick={handleDeposit}
                      disabled={!backAmount || parseFloat(backAmount) <= 0 || isDefaulted || depositState === "pending"}
                      className={`w-full font-semibold h-11 px-4 py-2.5 bg-primary text-primary-foreground hover:opacity-90 rounded-lg cursor-pointer text-sm ${
                        !backAmount || parseFloat(backAmount) <= 0 || isDefaulted || depositState === "pending" ? "opacity-50 pointer-events-none" : ""
                      }`}
                    >
                      <span className="flex items-center justify-center gap-2">
                        {depositState === "pending" ? (
                          <>
                            <span className="h-4 w-4 rounded-full border-2 border-primary-foreground border-t-transparent animate-spin" />
                            Confirming...
                          </>
                        ) : depositState === "success" ? (
                          <>
                            <CheckCircle2 className="w-4 h-4" />
                            Backed!
                          </>
                        ) : (
                          <>
                            <Zap className="w-4 h-4" />
                            Back this Agent
                          </>
                        )}
                      </span>
                    </SpotlightButton>
                  </ClickSpark>
                </Magnet>
              )}

              {depositError && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20">
                  <AlertTriangle className="w-4 h-4 text-destructive flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-destructive">{depositError}</p>
                </div>
              )}

              {isRisky && !isDefaulted && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-warning/10 border border-warning/20">
                  <AlertTriangle className="w-4 h-4 text-warning flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-warning">
                    This agent has a {getRiskLabel(agent.riskLevel).toLowerCase()} risk profile. Higher APY comes with increased risk of loss.
                  </p>
                </div>
              )}

              {isDefaulted && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20">
                  <XCircle className="w-4 h-4 text-destructive flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-destructive">
                    This agent has defaulted. Backing is disabled. Recovery may be in progress.
                  </p>
                </div>
              )}

              <div className="pt-4 border-t border-border">
                <div className="text-[10px] text-muted-foreground mb-2 uppercase tracking-wider">Vault Capacity</div>
                <div className="w-full bg-muted rounded-full h-2 mb-2">
                  <motion.div
                    className="h-2 rounded-full bg-primary"
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.min((agent.vault.totalBacked / agent.vault.cap) * 100, 100)}%` }}
                    transition={{ duration: 0.8, ease: [0.4, 0, 0.2, 1] }}
                  />
                </div>
                <div className="flex justify-between text-xs text-muted-foreground mono-text">
                  <span>{formatUSD(agent.vault.totalBacked)}</span>
                  <span>{formatUSD(agent.vault.cap)}</span>
                </div>
              </div>
            </div>
          </SpotlightCard>
        </div>
      </div>

      {/* ── Mobile: Fixed bottom Back Agent ──────────────────────────────── */}
      <div className="md:hidden">
        {!mobileBackOpen && !isDefaulted && (
          <div className="fixed bottom-[calc(env(safe-area-inset-bottom,0px)+4.5rem)] left-0 right-0 z-30 px-4 pb-2">
            <Button
              className="w-full font-semibold h-14 text-base rounded-xl"
              size="lg"
              onClick={() => setMobileBackOpen(true)}
            >
              <span className="flex items-center gap-2">
                <Zap className="w-5 h-5" />
                Back this Agent
              </span>
            </Button>
          </div>
        )}

        <AnimatePresence>
          {mobileBackOpen && (
            <div className="fixed inset-0 z-[101] md:hidden">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 bg-foreground/20 dark:bg-black/60"
                onClick={() => setMobileBackOpen(false)}
              />
              <motion.div
                initial={{ y: "100%" }}
                animate={{ y: 0 }}
                exit={{ y: "100%" }}
                drag="y"
                dragConstraints={{ top: 0 }}
                dragElastic={0.2}
                onDragEnd={(_, info) => {
                  if (info.offset.y > 100) setMobileBackOpen(false)
                }}
                transition={{ type: "spring", damping: 30, stiffness: 300 }}
                className="absolute bottom-0 left-0 right-0 mobile-bottom-sheet bg-background border-t border-border"
              >
                <div className="flex justify-between items-center px-5 pt-2">
                  <span className="text-sm font-medium text-foreground flex items-center gap-2">
                    <Zap className="w-4 h-4 text-primary/50" />
                    Back {agent.name}
                  </span>
                  <button
                    onClick={() => setMobileBackOpen(false)}
                    className="p-2 text-muted-foreground hover:text-foreground min-h-[44px] min-w-[44px] flex items-center justify-center"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="px-5 pb-6 space-y-5 overflow-y-auto" style={{ maxHeight: "calc(85vh - 60px)" }}>
                  <div className="p-4 rounded-lg bg-muted text-center">
                    <div className="text-[10px] text-muted-foreground mb-1 uppercase tracking-wider">Current APY</div>
                    <div className="text-3xl font-bold mono-text" style={{ color: getRiskColor(agent.riskLevel) }}>
                      {formatPercent(agent.vault.apy)}
                    </div>
                  </div>

                  <div>
                    <label className="text-xs text-muted-foreground mb-2 block uppercase tracking-wider">Amount (USDT)</label>
                    <div className="relative">
                      <Input
                        type="number"
                        placeholder="0.00"
                        value={backAmount}
                        onChange={(e) => setBackAmount(e.target.value)}
                        className="pr-16 text-2xl h-16 rounded-xl mono-text"
                        inputMode="decimal"
                      />
                      <button
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-primary font-semibold px-3 py-2 min-h-[44px] min-w-[44px] flex items-center justify-center hover:text-primary/70 transition-colors duration-200"
                        onClick={() => setBackAmount(String(availableCapacity))}
                      >
                        MAX
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2 text-sm p-3 rounded-lg bg-muted">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">APY</span>
                      <span className="font-medium mono-text text-foreground">{formatPercent(agent.vault.apy)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Risk Level</span>
                      <span className="font-medium mono-text" style={{ color: getRiskColor(agent.riskLevel) }}>
                        {getRiskLabel(agent.riskLevel)}
                      </span>
                    </div>
                    {backAmount && parseFloat(backAmount) > 0 && (
                      <>
                        <div className="flex justify-between pt-2 border-t border-border">
                          <span className="text-muted-foreground">Est. Monthly Yield</span>
                          <span className="font-medium mono-text text-success">{formatUSD(estimatedMonthlyYield)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Est. Annual Yield</span>
                          <span className="font-medium mono-text text-success">{formatUSD(estimatedMonthlyYield * 12)}</span>
                        </div>
                      </>
                    )}
                  </div>

                  {depositError && (
                    <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20">
                      <AlertTriangle className="w-4 h-4 text-destructive flex-shrink-0 mt-0.5" />
                      <p className="text-xs text-destructive">{depositError}</p>
                    </div>
                  )}

                  {isRisky && (
                    <div className="flex items-start gap-2 p-3 rounded-lg bg-warning/10 border border-warning/20">
                      <AlertTriangle className="w-4 h-4 text-warning flex-shrink-0 mt-0.5" />
                      <p className="text-xs text-warning">
                        High risk profile. You may lose your backing if this agent defaults.
                      </p>
                    </div>
                  )}

                  {!isConnected ? (
                    <WDKWalletButton />
                  ) : (
                    <ClickSpark>
                      <Button
                        className="w-full font-semibold h-14 text-base rounded-xl"
                        size="lg"
                        disabled={!backAmount || parseFloat(backAmount) <= 0 || depositState === "pending"}
                        onClick={handleDeposit}
                      >
                        <span className="flex items-center gap-2">
                          {depositState === "pending" ? (
                            <>
                              <span className="h-5 w-5 rounded-full border-2 border-primary-foreground border-t-transparent animate-spin" />
                              Confirming...
                            </>
                          ) : depositState === "success" ? (
                            <>
                              <CheckCircle2 className="w-5 h-5" />
                              Backed!
                            </>
                          ) : (
                            <>
                              <Zap className="w-5 h-5" />
                              Back this Agent
                            </>
                          )}
                        </span>
                      </Button>
                    </ClickSpark>
                  )}

                  <div className="pt-3 border-t border-border">
                    <div className="text-[10px] text-muted-foreground mb-2 uppercase tracking-wider">Vault Capacity</div>
                    <div className="w-full bg-muted rounded-full h-2 mb-2">
                      <div
                        className="h-2 rounded-full bg-primary transition-all duration-500"
                        style={{ width: `${Math.min((agent.vault.totalBacked / agent.vault.cap) * 100, 100)}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-xs text-muted-foreground mono-text">
                      <span>{formatUSD(agent.vault.totalBacked)}</span>
                      <span>{formatUSD(agent.vault.cap)}</span>
                    </div>
                  </div>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  )
}
