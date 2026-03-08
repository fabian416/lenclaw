import { StatCard } from "@/components/shared/StatCard"
import { EmptyState } from "@/components/shared/EmptyState"
import { MOCK_PORTFOLIO, MOCK_ACTIVITY_FEED } from "@/lib/constants"
import { formatUSD, formatPercent } from "@/lib/utils"
import type { BackingPosition, RiskLevel } from "@/lib/types"
import {
  Wallet,
  TrendingUp,
  Activity,
  BarChart3,
  Bot,
  AlertTriangle,
  ArrowUpRight,
  LogOut,
  Briefcase,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Link } from "react-router-dom"
import { useState } from "react"
import { motion } from "framer-motion"
import { NumberTicker } from "@/components/reactbits/NumberTicker"
import { SpotlightCard } from "@/components/reactbits/SpotlightCard"
import { AnimatedContent } from "@/components/reactbits/AnimatedContent"
import { BorderBeam } from "@/components/reactbits/BorderBeam"
import { TextScramble } from "@/components/reactbits/TextScramble"

const riskConfig: Record<RiskLevel, { label: string; variant: "success" | "warning" | "danger" | "destructive" }> = {
  safe: { label: "Safe", variant: "success" },
  moderate: { label: "Moderate", variant: "warning" },
  risky: { label: "Risky", variant: "danger" },
  degen: { label: "Degen", variant: "destructive" },
}

function PositionCard({ position, index }: { position: BackingPosition; index: number }) {
  const risk = riskConfig[position.riskLevel]

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: index * 0.06 }}
    >
      <SpotlightCard className="p-4 md:p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-full bg-muted border border-border flex items-center justify-center flex-shrink-0">
              <Bot className="w-4.5 h-4.5 text-primary/50" />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-foreground truncate">{position.agentName}</div>
              <div className="text-xs text-muted-foreground">
                <TextScramble text={position.agentId} trigger="hover" speed={40} />
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <Badge variant={risk.variant} className="mono-text text-[10px] uppercase tracking-wider">
              {risk.label}
            </Badge>
            {position.status === "active" && (
              <div className="w-2 h-2 rounded-full bg-success animate-pulse" />
            )}
            {position.status === "defaulted" && (
              <div className="w-2 h-2 rounded-full bg-destructive" />
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <div className="p-2.5 rounded-lg bg-muted">
            <span className="text-[10px] text-muted-foreground block mb-0.5 uppercase tracking-wider">Backed</span>
            <div className="font-semibold text-sm mono-text text-foreground">{formatUSD(position.amount)}</div>
          </div>
          <div className="p-2.5 rounded-lg bg-muted">
            <span className="text-[10px] text-muted-foreground block mb-0.5 uppercase tracking-wider">Yield</span>
            <div className="font-semibold text-sm mono-text text-primary">{formatUSD(position.yieldEarned)}</div>
          </div>
          <div className="p-2.5 rounded-lg bg-muted">
            <span className="text-[10px] text-muted-foreground block mb-0.5 uppercase tracking-wider">APY</span>
            <div className="font-semibold text-sm mono-text text-foreground">{formatPercent(position.currentApy)}</div>
          </div>
          <div className="p-2.5 rounded-lg bg-muted">
            <span className="text-[10px] text-muted-foreground block mb-0.5 uppercase tracking-wider">Status</span>
            <div className={`font-semibold text-sm capitalize ${
              position.status === "active" ? "text-success" :
              position.status === "defaulted" ? "text-destructive" :
              "text-warning"
            }`}>
              {position.status}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <Link
            to={`/agents/${position.agentId}`}
            className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1 transition-colors py-2 -my-2"
          >
            View agent <ArrowUpRight className="w-3 h-3" />
          </Link>
          {position.status === "active" && (
            <button className="text-xs text-muted-foreground hover:text-destructive flex items-center gap-1 transition-colors py-2 -my-2">
              <LogOut className="w-3 h-3" />
              Withdraw
            </button>
          )}
        </div>
      </SpotlightCard>
    </motion.div>
  )
}

export default function Portfolio() {
  const portfolio = MOCK_PORTFOLIO
  const [showAlerts] = useState(true)
  const hasPositions = portfolio.positions.length > 0

  const alerts = MOCK_ACTIVITY_FEED.filter(
    (e) => e.type === "late_payment" || e.type === "default"
  ).slice(0, 3)

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="max-w-6xl mx-auto px-4 sm:px-6 py-8 md:py-12"
    >
      {/* Header */}
      <div className="mb-8 md:mb-10">
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight mb-1 text-foreground">Portfolio</h1>
        <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4 text-sm text-muted-foreground">
          <span>
            Total value: <span className="font-semibold mono-text text-foreground"><NumberTicker value={portfolio.totalBacked} prefix="$" /></span>
          </span>
          <span>
            Total yield: <span className="font-semibold mono-text text-primary"><NumberTicker value={portfolio.totalYieldEarned} prefix="$" /></span>
          </span>
        </div>
      </div>

      {!hasPositions ? (
        <EmptyState
          icon={Briefcase}
          title="No positions yet"
          description="Browse agents and back your first one to start earning yield."
          action={
            <Link
              to="/agents"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              Browse Agents <ArrowUpRight className="w-4 h-4" />
            </Link>
          }
        />
      ) : (
        <>
          {/* Summary Stats */}
          <AnimatedContent>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 mb-8 md:mb-10">
              <StatCard label="Total Backed" value={formatUSD(portfolio.totalBacked)} icon={Wallet} sublabel="across all agents" delay={0} />
              <StatCard label="Active Positions" value={String(portfolio.activePositions)} icon={Activity} delay={1} />
              <StatCard label="Avg APY" value={formatPercent(portfolio.avgApy)} icon={TrendingUp} sublabel="weighted" trend="up" delay={2} />
              <StatCard label="Total Yield" value={formatUSD(portfolio.totalYieldEarned)} icon={BarChart3} sublabel="+$420 this week" trend="up" delay={3} />
            </div>
          </AnimatedContent>

          {/* Alerts */}
          {showAlerts && alerts.length > 0 && (
            <AnimatedContent delay={0.1}>
              <div className="mb-8 md:mb-10 space-y-2">
                {alerts.map((alert) => (
                  <div
                    key={alert.id}
                    className={`flex items-center gap-3 p-3 rounded-lg border text-sm ${
                      alert.type === "default"
                        ? "border-destructive/30 bg-destructive/5 text-destructive"
                        : "border-warning/30 bg-warning/5 text-warning"
                    }`}
                  >
                    <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                    <span>{alert.message}</span>
                  </div>
                ))}
              </div>
            </AnimatedContent>
          )}

          {/* Portfolio Value Card */}
          <AnimatedContent delay={0.15}>
            <BorderBeam duration={8} className="mb-8 md:mb-10">
              <SpotlightCard className="p-6">
                <div className="flex items-center gap-2 mb-4">
                  <Wallet className="w-4 h-4 text-primary/50" />
                  <h3 className="text-sm font-medium text-foreground">Portfolio Overview</h3>
                </div>
                <div className="flex items-end justify-between mb-4">
                  <div>
                    <span className="text-[10px] text-muted-foreground uppercase tracking-wider block mb-1">Net Value</span>
                    <span className="text-2xl sm:text-3xl font-bold mono-text text-foreground truncate block">
                      <NumberTicker value={portfolio.totalBacked + portfolio.totalYieldEarned} prefix="$" />
                    </span>
                  </div>
                  <span className="text-xs text-primary mono-text px-2 py-1 rounded-md bg-primary/10">
                    +{formatPercent(portfolio.avgApy)} APY
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {portfolio.positions.map((pos) => {
                    const pct = ((pos.amount / portfolio.totalBacked) * 100).toFixed(0)
                    return (
                      <div key={pos.agentId} className="p-3 rounded-lg bg-muted">
                        <span className="text-[10px] text-muted-foreground block mb-1 truncate">{pos.agentName}</span>
                        <div className="font-semibold text-sm mono-text text-foreground">{pct}%</div>
                        <div className="text-[10px] text-muted-foreground mono-text">{formatUSD(pos.amount)}</div>
                      </div>
                    )
                  })}
                </div>
              </SpotlightCard>
            </BorderBeam>
          </AnimatedContent>

          {/* Positions */}
          <AnimatedContent delay={0.2}>
            <div className="mb-4">
              <h2 className="text-sm font-medium text-foreground">Backed Agents ({portfolio.positions.length})</h2>
            </div>
            <div className="space-y-3">
              {portfolio.positions.map((position, i) => (
                <PositionCard key={position.agentId} position={position} index={i} />
              ))}
            </div>
          </AnimatedContent>
        </>
      )}
    </motion.div>
  )
}
