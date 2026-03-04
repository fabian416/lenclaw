import { StatCard } from "@/components/shared/StatCard"
import { ProgressBar } from "@/components/shared/ProgressBar"
import { MOCK_POOL_DATA, MOCK_AGENTS } from "@/lib/constants"
import { formatUSD, formatPercent, formatCompact } from "@/lib/utils"
import {
  DollarSign,
  TrendingUp,
  Activity,
  Bot,
  BarChart3,
  AlertTriangle,
  ArrowUpRight,
  ChevronDown,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { StatusBadge } from "@/components/shared/StatusBadge"
import { Link } from "react-router-dom"
import { useState } from "react"
import { motion } from "framer-motion"

// Animated utilization ring component
function UtilizationRing({ value, size = 120, strokeWidth = 10, color = "violet" }: { value: number; size?: number; strokeWidth?: number; color?: string }) {
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const percent = Math.min(Math.max(value, 0), 100)

  const colorMap: Record<string, { stroke: string; glow: string }> = {
    violet: { stroke: "url(#violet-gradient)", glow: "rgba(139,92,246,0.3)" },
    emerald: { stroke: "url(#emerald-gradient)", glow: "rgba(16,185,129,0.3)" },
    amber: { stroke: "url(#amber-gradient)", glow: "rgba(245,158,11,0.3)" },
  }

  const c = colorMap[color] ?? colorMap.violet

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <defs>
          <linearGradient id="violet-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#8b5cf6" />
            <stop offset="100%" stopColor="#a78bfa" />
          </linearGradient>
          <linearGradient id="emerald-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#10b981" />
            <stop offset="100%" stopColor="#34d399" />
          </linearGradient>
          <linearGradient id="amber-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#f59e0b" />
            <stop offset="100%" stopColor="#fbbf24" />
          </linearGradient>
        </defs>
        {/* Track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgba(139,92,246,0.08)"
          strokeWidth={strokeWidth}
        />
        {/* Progress */}
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={c.stroke}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: circumference - (percent / 100) * circumference }}
          transition={{ duration: 1.5, ease: [0.4, 0, 0.2, 1] }}
          style={{ filter: `drop-shadow(0 0 6px ${c.glow})` }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-bold mono-text">{formatPercent(value)}</span>
      </div>
    </div>
  )
}

export default function Dashboard() {
  const pool = MOCK_POOL_DATA
  const topAgents = MOCK_AGENTS.filter((a) => a.status === "active").slice(0, 5)
  const [riskExpanded, setRiskExpanded] = useState(true)
  const [agentsExpanded, setAgentsExpanded] = useState(true)

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
      className="max-w-5xl mx-auto px-4 md:px-6 py-6 md:py-8"
    >
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="mb-6 md:mb-8"
      >
        <h1 className="text-xl sm:text-2xl md:text-3xl font-bold mono-text mb-1.5 md:mb-2">Protocol Dashboard</h1>
        <p className="text-muted-foreground text-xs md:text-sm">Real-time overview of the Lenclaw lending pool</p>
      </motion.div>

      {/* Key Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 mb-6 md:mb-8">
        <StatCard
          label="Total Value Locked"
          value={formatUSD(pool.tvl)}
          icon={DollarSign}
          sublabel="+12.4%"
          trend="up"
          delay={0}
        />
        <StatCard
          label="Pool APY"
          value={formatPercent(pool.apy)}
          icon={TrendingUp}
          sublabel="stable"
          trend="neutral"
          delay={1}
        />
        <StatCard
          label="Utilization"
          value={formatPercent(pool.utilizationRate)}
          icon={BarChart3}
          delay={2}
        />
        <StatCard
          label="Active Agents"
          value={formatCompact(pool.activeAgents)}
          icon={Bot}
          sublabel="+5 this week"
          trend="up"
          delay={3}
        />
      </div>

      {/* Utilization & Revenue */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6 mb-6 md:mb-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
        >
          <Card className="data-card rounded-2xl border-primary/15">
            <CardHeader>
              <CardTitle className="mono-text text-sm flex items-center gap-2">
                <div className="w-6 h-6 rounded-md bg-gradient-to-br from-violet-500/20 to-purple-600/10 flex items-center justify-center">
                  <Activity className="w-3.5 h-3.5 text-primary" />
                </div>
                Pool Utilization
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col items-center mb-4">
                <UtilizationRing value={pool.utilizationRate} />
                <span className="text-[10px] md:text-xs text-muted-foreground mono-text mt-2">
                  {formatUSD(pool.totalLoans)} / {formatUSD(pool.tvl)}
                </span>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-4 text-xs mono-text">
                <div className="p-3 rounded-lg bg-muted/30 border border-border/50">
                  <span className="text-muted-foreground block mb-1">Total Loans</span>
                  <div className="text-foreground font-semibold text-sm">{formatUSD(pool.totalLoans)}</div>
                </div>
                <div className="p-3 rounded-lg bg-muted/30 border border-border/50">
                  <span className="text-muted-foreground block mb-1">Default Rate</span>
                  <div className={`text-sm font-semibold ${pool.defaultRate > 5 ? "text-red-400" : "text-emerald-400"}`}>
                    {formatPercent(pool.defaultRate)}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.4 }}
        >
          <Card className="data-card rounded-2xl border-primary/15">
            <CardHeader>
              <CardTitle className="mono-text text-sm flex items-center gap-2">
                <div className="w-6 h-6 rounded-md bg-gradient-to-br from-emerald-500/20 to-emerald-600/10 flex items-center justify-center">
                  <DollarSign className="w-3.5 h-3.5 text-emerald-400" />
                </div>
                Revenue Overview
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-end justify-between mb-4 md:mb-6">
                <span className="text-2xl md:text-3xl font-bold mono-text">{formatUSD(pool.totalRevenue)}</span>
                <motion.span
                  className="text-[10px] md:text-xs text-emerald-400 mono-text px-2 py-1 rounded-md bg-emerald-400/10"
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.8 }}
                >
                  +18.3% MoM
                </motion.span>
              </div>
              <div className="space-y-3">
                {[
                  { label: "Agent Revenue (30d)", value: formatUSD(pool.totalRevenue) },
                  { label: "Protocol Fees (30d)", value: formatUSD(pool.totalRevenue * 0.05) },
                  { label: "Lender Distributions", value: formatUSD(pool.totalRevenue * 0.85) },
                ].map((item, i) => (
                  <motion.div
                    key={item.label}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.5 + i * 0.1 }}
                    className="flex justify-between items-center text-xs mono-text py-2 border-b border-border/30 last:border-0"
                  >
                    <span className="text-muted-foreground">{item.label}</span>
                    <span className="text-foreground font-semibold">{item.value}</span>
                  </motion.div>
                ))}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Risk Monitor + Top Agents */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
        {/* Risk */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
        >
          <Card className="data-card rounded-2xl border-primary/15">
            <CardHeader>
              <button
                className="flex items-center justify-between w-full md:pointer-events-none"
                onClick={() => setRiskExpanded(!riskExpanded)}
              >
                <CardTitle className="mono-text text-sm flex items-center gap-2">
                  <div className="w-6 h-6 rounded-md bg-gradient-to-br from-amber-500/20 to-amber-600/10 flex items-center justify-center">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                  </div>
                  Risk Monitor
                </CardTitle>
                <ChevronDown className={`w-4 h-4 text-muted-foreground md:hidden transition-transform ${riskExpanded ? 'rotate-180' : ''}`} />
              </button>
            </CardHeader>
            <CardContent className={`${riskExpanded ? '' : 'hidden md:block'}`}>
              <div className="space-y-4">
                {[
                  { label: "Pool Coverage Ratio", value: 142, color: "success" as const },
                  { label: "Loss Reserve Buffer", value: 28, color: "primary" as const },
                  { label: "Average Agent Score", value: 86, color: "primary" as const },
                ].map((item, i) => (
                  <motion.div
                    key={item.label}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.3 + i * 0.1 }}
                  >
                    <div className="flex justify-between text-xs mono-text mb-1">
                      <span className="text-muted-foreground">{item.label}</span>
                      <span className="text-foreground font-medium">{item.value}%</span>
                    </div>
                    <ProgressBar value={item.value} color={item.color} />
                  </motion.div>
                ))}
                <div className="pt-3 border-t border-border/50">
                  <div className="flex justify-between text-xs mono-text py-1">
                    <span className="text-muted-foreground">Delinquent Agents</span>
                    <span className="text-amber-400 font-semibold flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block" />
                      {MOCK_AGENTS.filter((a) => a.status === "delinquent").length}
                    </span>
                  </div>
                  <div className="flex justify-between text-xs mono-text py-1">
                    <span className="text-muted-foreground">Defaulted Agents</span>
                    <span className="text-red-400 font-semibold flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-red-400 inline-block" />
                      {MOCK_AGENTS.filter((a) => a.status === "default").length}
                    </span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Top Agents */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.1 }}
        >
          <Card className="data-card rounded-2xl border-primary/15">
            <CardHeader>
              <div className="flex items-center justify-between w-full">
                <button
                  className="flex items-center gap-2 md:pointer-events-none"
                  onClick={() => setAgentsExpanded(!agentsExpanded)}
                >
                  <CardTitle className="mono-text text-sm flex items-center gap-2">
                    <div className="w-6 h-6 rounded-md bg-gradient-to-br from-violet-500/20 to-purple-600/10 flex items-center justify-center">
                      <Bot className="w-3.5 h-3.5 text-primary" />
                    </div>
                    Top Agents
                  </CardTitle>
                  <ChevronDown className={`w-4 h-4 text-muted-foreground md:hidden transition-transform ${agentsExpanded ? 'rotate-180' : ''}`} />
                </button>
                <Link to="/agents" className="text-xs text-primary hover:text-primary/80 mono-text flex items-center gap-1 transition-colors">
                  View all <ArrowUpRight className="w-3 h-3" />
                </Link>
              </div>
            </CardHeader>
            <CardContent className={`${agentsExpanded ? '' : 'hidden md:block'}`}>
              <div className="space-y-1">
                {topAgents.map((agent, i) => (
                  <motion.div
                    key={agent.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.3 + i * 0.08 }}
                    className="flex items-center justify-between py-2.5 md:py-2.5 px-2 -mx-2 rounded-lg hover:bg-primary/5 transition-colors border-b border-border/30 last:border-0"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500/15 to-purple-600/5 flex items-center justify-center flex-shrink-0">
                        <Bot className="w-4 h-4 text-primary/70" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-medium mono-text truncate">{agent.name}</div>
                        <div className="text-[10px] md:text-xs text-muted-foreground mono-text truncate">{agent.erc8004Id}</div>
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0 ml-2">
                      <div className="text-sm font-semibold mono-text">{formatUSD(agent.revenue30d)}</div>
                      <StatusBadge status={agent.status} />
                    </div>
                  </motion.div>
                ))}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </motion.div>
  )
}
