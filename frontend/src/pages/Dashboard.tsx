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
import { StatusBadge } from "@/components/shared/StatusBadge"
import { Link } from "react-router-dom"
import { useState } from "react"
import { motion } from "framer-motion"

function UtilizationRing({ value, size = 120, strokeWidth = 8 }: { value: number; size?: number; strokeWidth?: number }) {
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const percent = Math.min(Math.max(value, 0), 100)

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          className="text-muted"
          strokeWidth={strokeWidth}
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          className="text-foreground"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: circumference - (percent / 100) * circumference }}
          transition={{ duration: 1, ease: [0.4, 0, 0.2, 1] }}
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
      transition={{ duration: 0.3 }}
      className="max-w-6xl mx-auto px-6 py-8 md:py-12"
    >
      <div className="mb-8 md:mb-10">
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight mb-1">Protocol Dashboard</h1>
        <p className="text-muted-foreground text-sm">Real-time overview of the Lenclaw lending pool</p>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 mb-8 md:mb-10">
        <StatCard label="Total Value Locked" value={formatUSD(pool.tvl)} icon={DollarSign} sublabel="+12.4%" trend="up" delay={0} />
        <StatCard label="Pool APY" value={formatPercent(pool.apy)} icon={TrendingUp} sublabel="stable" trend="neutral" delay={1} />
        <StatCard label="Utilization" value={formatPercent(pool.utilizationRate)} icon={BarChart3} delay={2} />
        <StatCard label="Active Agents" value={formatCompact(pool.activeAgents)} icon={Bot} sublabel="+5 this week" trend="up" delay={3} />
      </div>

      {/* Utilization & Revenue */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6 mb-8 md:mb-10">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.2 }}
          className="border border-border rounded-xl p-6"
        >
          <div className="flex items-center gap-2 mb-6">
            <Activity className="w-4 h-4 text-muted-foreground" />
            <h3 className="text-sm font-medium">Pool Utilization</h3>
          </div>
          <div className="flex flex-col items-center mb-6">
            <UtilizationRing value={pool.utilizationRate} />
            <span className="text-xs text-muted-foreground mono-text mt-3">
              {formatUSD(pool.totalLoans)} / {formatUSD(pool.tvl)}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 rounded-lg bg-muted/50">
              <span className="text-xs text-muted-foreground block mb-1">Total Loans</span>
              <div className="font-semibold text-sm mono-text">{formatUSD(pool.totalLoans)}</div>
            </div>
            <div className="p-3 rounded-lg bg-muted/50">
              <span className="text-xs text-muted-foreground block mb-1">Default Rate</span>
              <div className={`text-sm font-semibold mono-text ${pool.defaultRate > 5 ? "text-red-500" : "text-emerald-600 dark:text-emerald-400"}`}>
                {formatPercent(pool.defaultRate)}
              </div>
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.25 }}
          className="border border-border rounded-xl p-6"
        >
          <div className="flex items-center gap-2 mb-6">
            <DollarSign className="w-4 h-4 text-muted-foreground" />
            <h3 className="text-sm font-medium">Revenue Overview</h3>
          </div>
          <div className="flex items-end justify-between mb-6">
            <span className="text-3xl font-bold mono-text">{formatUSD(pool.totalRevenue)}</span>
            <span className="text-xs text-emerald-600 dark:text-emerald-400 mono-text px-2 py-1 rounded-md bg-emerald-50 dark:bg-emerald-500/10">
              +18.3% MoM
            </span>
          </div>
          <div className="space-y-0 divide-y divide-border">
            {[
              { label: "Agent Revenue (30d)", value: formatUSD(pool.totalRevenue) },
              { label: "Protocol Fees (30d)", value: formatUSD(pool.totalRevenue * 0.05) },
              { label: "Lender Distributions", value: formatUSD(pool.totalRevenue * 0.85) },
            ].map((item) => (
              <div key={item.label} className="flex justify-between items-center text-sm py-3">
                <span className="text-muted-foreground">{item.label}</span>
                <span className="font-medium mono-text">{item.value}</span>
              </div>
            ))}
          </div>
        </motion.div>
      </div>

      {/* Risk Monitor + Top Agents */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.35 }}
          className="border border-border rounded-xl p-6"
        >
          <button
            className="flex items-center justify-between w-full mb-6 md:pointer-events-none"
            onClick={() => setRiskExpanded(!riskExpanded)}
          >
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-muted-foreground" />
              <h3 className="text-sm font-medium">Risk Monitor</h3>
            </div>
            <ChevronDown className={`w-4 h-4 text-muted-foreground md:hidden transition-transform ${riskExpanded ? "rotate-180" : ""}`} />
          </button>
          <div className={`${riskExpanded ? "" : "hidden md:block"}`}>
            <div className="space-y-5">
              {[
                { label: "Pool Coverage Ratio", value: 142, color: "success" as const },
                { label: "Loss Reserve Buffer", value: 28, color: "primary" as const },
                { label: "Average Agent Score", value: 86, color: "primary" as const },
              ].map((item) => (
                <div key={item.label}>
                  <div className="flex justify-between text-sm mb-2">
                    <span className="text-muted-foreground">{item.label}</span>
                    <span className="font-medium mono-text">{item.value}%</span>
                  </div>
                  <ProgressBar value={item.value} color={item.color} />
                </div>
              ))}
              <div className="pt-4 border-t border-border space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Delinquent Agents</span>
                  <span className="text-amber-600 dark:text-amber-400 font-medium">
                    {MOCK_AGENTS.filter((a) => a.status === "delinquent").length}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Defaulted Agents</span>
                  <span className="text-red-500 font-medium">
                    {MOCK_AGENTS.filter((a) => a.status === "default").length}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.35, delay: 0.05 }}
          className="border border-border rounded-xl p-6"
        >
          <div className="flex items-center justify-between mb-6">
            <button
              className="flex items-center gap-2 md:pointer-events-none"
              onClick={() => setAgentsExpanded(!agentsExpanded)}
            >
              <Bot className="w-4 h-4 text-muted-foreground" />
              <h3 className="text-sm font-medium">Top Agents</h3>
              <ChevronDown className={`w-4 h-4 text-muted-foreground md:hidden transition-transform ${agentsExpanded ? "rotate-180" : ""}`} />
            </button>
            <Link to="/agents" className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors">
              View all <ArrowUpRight className="w-3 h-3" />
            </Link>
          </div>
          <div className={`${agentsExpanded ? "" : "hidden md:block"}`}>
            <div className="space-y-0 divide-y divide-border">
              {topAgents.map((agent) => (
                <div
                  key={agent.id}
                  className="flex items-center justify-between py-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                      <Bot className="w-3.5 h-3.5 text-muted-foreground" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">{agent.name}</div>
                      <div className="text-xs text-muted-foreground mono-text">{agent.erc8004Id}</div>
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0 ml-3">
                    <div className="text-sm font-medium mono-text">{formatUSD(agent.revenue30d)}</div>
                    <StatusBadge status={agent.status} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </motion.div>
      </div>
    </motion.div>
  )
}
