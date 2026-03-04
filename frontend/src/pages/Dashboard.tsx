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
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { StatusBadge } from "@/components/shared/StatusBadge"
import { Link } from "react-router-dom"

export default function Dashboard() {
  const pool = MOCK_POOL_DATA
  const topAgents = MOCK_AGENTS.filter((a) => a.status === "active").slice(0, 5)

  return (
    <div className="max-w-5xl mx-auto px-4 md:px-6 py-8">
      <div className="mb-8">
        <h1 className="text-2xl md:text-3xl font-bold mono-text mb-2">Protocol Dashboard</h1>
        <p className="text-muted-foreground text-sm">Real-time overview of the Lenclaw lending pool</p>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard
          label="Total Value Locked"
          value={formatUSD(pool.tvl)}
          icon={DollarSign}
          sublabel="+12.4%"
          trend="up"
        />
        <StatCard
          label="Senior APY"
          value={formatPercent(pool.seniorAPY)}
          icon={TrendingUp}
          sublabel="stable"
          trend="neutral"
        />
        <StatCard
          label="Junior APY"
          value={formatPercent(pool.juniorAPY)}
          icon={BarChart3}
          sublabel="+2.1%"
          trend="up"
        />
        <StatCard
          label="Active Agents"
          value={formatCompact(pool.activeAgents)}
          icon={Bot}
          sublabel="+5 this week"
          trend="up"
        />
      </div>

      {/* Utilization & Revenue */}
      <div className="grid md:grid-cols-2 gap-6 mb-8">
        <Card className="data-card rounded-2xl border-primary/15">
          <CardHeader>
            <CardTitle className="mono-text text-sm flex items-center gap-2">
              <Activity className="w-4 h-4 text-primary" />
              Pool Utilization
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-end justify-between mb-3">
              <span className="text-3xl font-bold mono-text">{formatPercent(pool.utilizationRate)}</span>
              <span className="text-xs text-muted-foreground mono-text">
                {formatUSD(pool.totalLoans)} / {formatUSD(pool.tvl)}
              </span>
            </div>
            <ProgressBar value={pool.utilizationRate} />
            <div className="mt-4 grid grid-cols-2 gap-4 text-xs mono-text">
              <div>
                <span className="text-muted-foreground">Total Loans</span>
                <div className="text-foreground font-semibold">{formatUSD(pool.totalLoans)}</div>
              </div>
              <div>
                <span className="text-muted-foreground">Default Rate</span>
                <div className={pool.defaultRate > 5 ? "text-red-400 font-semibold" : "text-emerald-400 font-semibold"}>
                  {formatPercent(pool.defaultRate)}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="data-card rounded-2xl border-primary/15">
          <CardHeader>
            <CardTitle className="mono-text text-sm flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-primary" />
              Revenue Overview
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-end justify-between mb-6">
              <span className="text-3xl font-bold mono-text">{formatUSD(pool.totalRevenue)}</span>
              <span className="text-xs text-emerald-400 mono-text">+18.3% MoM</span>
            </div>
            <div className="space-y-3">
              <div className="flex justify-between items-center text-xs mono-text">
                <span className="text-muted-foreground">Agent Revenue (30d)</span>
                <span className="text-foreground font-semibold">{formatUSD(pool.totalRevenue)}</span>
              </div>
              <div className="flex justify-between items-center text-xs mono-text">
                <span className="text-muted-foreground">Protocol Fees (30d)</span>
                <span className="text-foreground font-semibold">{formatUSD(pool.totalRevenue * 0.05)}</span>
              </div>
              <div className="flex justify-between items-center text-xs mono-text">
                <span className="text-muted-foreground">Lender Distributions</span>
                <span className="text-foreground font-semibold">{formatUSD(pool.totalRevenue * 0.85)}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Risk Monitor + Top Agents */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Risk */}
        <Card className="data-card rounded-2xl border-primary/15">
          <CardHeader>
            <CardTitle className="mono-text text-sm flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400" />
              Risk Monitor
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {[
                { label: "Senior Tranche Coverage", value: 142, color: "success" as const },
                { label: "Junior Tranche Buffer", value: 28, color: "primary" as const },
                { label: "Average Agent Score", value: 86, color: "primary" as const },
              ].map((item) => (
                <div key={item.label}>
                  <div className="flex justify-between text-xs mono-text mb-1">
                    <span className="text-muted-foreground">{item.label}</span>
                    <span className="text-foreground">{item.value}%</span>
                  </div>
                  <ProgressBar value={item.value} color={item.color} />
                </div>
              ))}
              <div className="pt-2 border-t border-border">
                <div className="flex justify-between text-xs mono-text">
                  <span className="text-muted-foreground">Delinquent Agents</span>
                  <span className="text-amber-400 font-semibold">
                    {MOCK_AGENTS.filter((a) => a.status === "delinquent").length}
                  </span>
                </div>
                <div className="flex justify-between text-xs mono-text mt-1">
                  <span className="text-muted-foreground">Defaulted Agents</span>
                  <span className="text-red-400 font-semibold">
                    {MOCK_AGENTS.filter((a) => a.status === "default").length}
                  </span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Top Agents */}
        <Card className="data-card rounded-2xl border-primary/15">
          <CardHeader>
            <div className="flex items-center justify-between w-full">
              <CardTitle className="mono-text text-sm flex items-center gap-2">
                <Bot className="w-4 h-4 text-primary" />
                Top Agents
              </CardTitle>
              <Link to="/agents" className="text-xs text-primary hover:underline mono-text flex items-center gap-1">
                View all <ArrowUpRight className="w-3 h-3" />
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {topAgents.map((agent) => (
                <div key={agent.id} className="flex items-center justify-between py-2 border-b border-border/50 last:border-0">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Bot className="w-4 h-4 text-primary/70" />
                    </div>
                    <div>
                      <div className="text-sm font-medium mono-text">{agent.name}</div>
                      <div className="text-xs text-muted-foreground mono-text">{agent.erc8004Id}</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-semibold mono-text">{formatUSD(agent.revenue30d)}</div>
                    <StatusBadge status={agent.status} />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
