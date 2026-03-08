import { useState, useMemo } from "react"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { SpotlightCard } from "@/components/reactbits/SpotlightCard"
import { AnimatedContent } from "@/components/reactbits/AnimatedContent"
import { TextScramble } from "@/components/reactbits/TextScramble"
import { NumberTicker } from "@/components/reactbits/NumberTicker"
import { formatUSD, shortenAddress } from "@/lib/utils"
import { MOCK_AGENTS_WITH_VAULT } from "@/lib/constants"
import type { RiskLevel } from "@/lib/types"
import { Bot, Search, Users, TrendingUp, ArrowRight, Flame, Clock, ChevronDown } from "lucide-react"
import { Link } from "react-router-dom"
import { motion, AnimatePresence } from "framer-motion"

// ── Risk config ──────────────────────────────────────────────────────────────

const RISK_CONFIG: Record<RiskLevel, { label: string; color: string; bg: string; border: string }> = {
  safe: {
    label: "Safe",
    color: "text-success",
    bg: "bg-success/10",
    border: "border-success/20",
  },
  moderate: {
    label: "Moderate",
    color: "text-warning",
    bg: "bg-warning/10",
    border: "border-warning/20",
  },
  risky: {
    label: "Risky",
    color: "text-primary",
    bg: "bg-primary/10",
    border: "border-primary/20",
  },
  degen: {
    label: "Degen",
    color: "text-destructive",
    bg: "bg-destructive/10",
    border: "border-destructive/20",
  },
}

function getApyColor(apy: number): string {
  if (apy >= 20) return "text-destructive"
  if (apy >= 14) return "text-primary"
  if (apy >= 10) return "text-warning"
  return "text-success"
}

// ── Sub-components ───────────────────────────────────────────────────────────

function ReputationRing({ score }: { score: number }) {
  const radius = 16
  const circumference = 2 * Math.PI * radius
  const filled = (score / 100) * circumference

  const getColor = (s: number) => {
    if (s >= 90) return "stroke-primary"
    if (s >= 70) return "stroke-foreground"
    if (s >= 50) return "stroke-warning"
    return "stroke-destructive"
  }

  return (
    <div className="relative w-10 h-10 flex-shrink-0">
      <svg className="w-10 h-10 -rotate-90" viewBox="0 0 40 40">
        <circle
          cx="20"
          cy="20"
          r={radius}
          fill="none"
          className="stroke-muted"
          strokeWidth="3"
        />
        <circle
          cx="20"
          cy="20"
          r={radius}
          fill="none"
          className={getColor(score)}
          strokeWidth="3"
          strokeDasharray={circumference}
          strokeDashoffset={circumference - filled}
          strokeLinecap="round"
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold mono-text text-foreground">
        {score}
      </span>
    </div>
  )
}

function RiskBadge({ level }: { level: RiskLevel }) {
  const config = RISK_CONFIG[level]
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium uppercase tracking-wider border ${config.color} ${config.bg} ${config.border}`}>
      {config.label}
    </span>
  )
}

// ── Sort / Filter types ──────────────────────────────────────────────────────

type SortOption = "hot" | "top_earners" | "highest_apy" | "newest"
type RiskFilter = RiskLevel | "all"

const SORT_OPTIONS: { value: SortOption; label: string; icon: typeof Flame }[] = [
  { value: "hot", label: "Hot", icon: Flame },
  { value: "top_earners", label: "Top Earners", icon: TrendingUp },
  { value: "highest_apy", label: "Highest APY", icon: TrendingUp },
  { value: "newest", label: "Newest", icon: Clock },
]

const RISK_FILTERS: { value: RiskFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "safe", label: "Safe" },
  { value: "moderate", label: "Moderate" },
  { value: "risky", label: "Risky" },
  { value: "degen", label: "Degen" },
]

// ── Main component ───────────────────────────────────────────────────────────

export default function AgentMarketplace() {
  const [search, setSearch] = useState("")
  const [riskFilter, setRiskFilter] = useState<RiskFilter>("all")
  const [sortBy, setSortBy] = useState<SortOption>("hot")
  const [showSortDropdown, setShowSortDropdown] = useState(false)

  const filtered = useMemo(() => {
    let agents = MOCK_AGENTS_WITH_VAULT

    // Search
    if (search) {
      const q = search.toLowerCase()
      agents = agents.filter(
        (a) =>
          a.name.toLowerCase().includes(q) ||
          a.erc8004Id.toLowerCase().includes(q)
      )
    }

    // Risk filter
    if (riskFilter !== "all") {
      agents = agents.filter((a) => a.riskLevel === riskFilter)
    }

    // Sort
    agents = [...agents].sort((a, b) => {
      switch (sortBy) {
        case "hot":
          return b.vault.backersCount - a.vault.backersCount
        case "top_earners":
          return b.revenue30d - a.revenue30d
        case "highest_apy":
          return b.vault.apy - a.vault.apy
        case "newest":
          return b.registeredAt - a.registeredAt
        default:
          return 0
      }
    })

    return agents
  }, [search, riskFilter, sortBy])

  const currentSort = SORT_OPTIONS.find((s) => s.value === sortBy)!

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="max-w-6xl mx-auto px-4 sm:px-6 py-8 md:py-12"
    >
      {/* Header */}
      <AnimatedContent>
        <div className="mb-8 md:mb-10 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight mb-1 text-foreground">
              Agents
            </h1>
            <p className="text-muted-foreground text-sm">
              Browse agents, study the stats, deposit into their vaults
            </p>
          </div>
          <Link
            to="/agents/onboard"
            className="hidden sm:inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity flex-shrink-0"
          >
            <Bot className="w-4 h-4" />
            Register Agent
          </Link>
        </div>
      </AnimatedContent>

      {/* Filters */}
      <div className="flex flex-col gap-3 mb-8">
        {/* Search + Sort row */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search by name or ID..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 min-h-[44px] md:min-h-0"
            />
          </div>

          {/* Sort dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowSortDropdown(!showSortDropdown)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg border border-border bg-card text-sm font-medium text-foreground hover:bg-muted transition-colors w-full sm:w-auto justify-between sm:justify-start min-h-[44px] md:min-h-0"
            >
              <currentSort.icon className="w-3.5 h-3.5 text-muted-foreground" />
              {currentSort.label}
              <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground transition-transform ${showSortDropdown ? "rotate-180" : ""}`} />
            </button>
            <AnimatePresence>
              {showSortDropdown && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.15 }}
                  className="absolute right-0 top-full mt-1 z-20 bg-card border border-border rounded-lg shadow-lg overflow-hidden min-w-[160px]"
                >
                  {SORT_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => {
                        setSortBy(opt.value)
                        setShowSortDropdown(false)
                      }}
                      className={`flex items-center gap-2 w-full px-4 py-3 text-sm text-left transition-colors ${
                        sortBy === opt.value
                          ? "bg-primary/10 text-primary font-medium"
                          : "text-foreground hover:bg-muted"
                      }`}
                    >
                      <opt.icon className="w-3.5 h-3.5" />
                      {opt.label}
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Risk filter pills */}
        <div className="flex gap-1.5 overflow-x-auto pb-1 mobile-scroll-x">
          {RISK_FILTERS.map((rf) => (
            <button
              key={rf.value}
              onClick={() => setRiskFilter(rf.value)}
              className={`px-3 py-2 rounded-md text-xs font-medium transition-all capitalize whitespace-nowrap min-h-[44px] min-w-[44px] md:min-h-0 md:min-w-0 ${
                riskFilter === rf.value
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              {rf.label}
            </button>
          ))}
        </div>
      </div>

      {/* Close dropdown on outside click */}
      {showSortDropdown && (
        <div
          className="fixed inset-0 z-10"
          onClick={() => setShowSortDropdown(false)}
        />
      )}

      {/* Agent Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <AnimatePresence mode="popLayout">
          {filtered.map((agent, i) => (
            <motion.div
              key={agent.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3, delay: i * 0.04 }}
              layout
            >
              <AnimatedContent delay={i * 0.04}>
                <Link to={`/agents/${agent.id}`} className="block">
                  <SpotlightCard className="p-5 md:p-6 hover:border-primary/20 transition-all hover:shadow-md group">
                    {/* Top row: reputation ring + name + risk badge */}
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <ReputationRing score={agent.reputationScore} />
                        <div className="min-w-0">
                          <div className="text-base font-semibold truncate text-foreground">
                            {agent.name}
                          </div>
                          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                            <Badge variant="outline" className="text-[10px] mono-text">
                              {agent.erc8004Id}
                            </Badge>
                            <RiskBadge level={agent.riskLevel} />
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* APY highlight */}
                    <div className="flex items-baseline gap-1 mb-3">
                      <NumberTicker
                        value={Math.floor(agent.vault.apy * 10)}
                        className={`text-2xl font-bold mono-text ${getApyColor(agent.vault.apy)}`}
                      />
                      <span className={`text-xs font-medium ${getApyColor(agent.vault.apy)}`}>
                        .{Math.round((agent.vault.apy % 1) * 10)}% APY
                      </span>
                    </div>

                    {/* Stats grid */}
                    <div className="grid grid-cols-2 gap-3 mb-4">
                      <div className="p-2.5 rounded-lg bg-muted">
                        <div className="text-[10px] text-muted-foreground mb-0.5 uppercase tracking-wider">
                          Revenue (30d)
                        </div>
                        <div className="flex items-center gap-1.5">
                          <TrendingUp className="w-3 h-3 text-primary" />
                          <span className="text-sm font-semibold mono-text text-foreground truncate">
                            {formatUSD(agent.revenue30d)}
                          </span>
                        </div>
                      </div>
                      <div className="p-2.5 rounded-lg bg-muted">
                        <div className="text-[10px] text-muted-foreground mb-0.5 uppercase tracking-wider">
                          Total Backed
                        </div>
                        <span className="text-sm font-semibold mono-text text-foreground truncate">
                          {formatUSD(agent.vault.totalBacked)}
                        </span>
                      </div>
                    </div>

                    {/* Footer: backers + CTA */}
                    <div className="flex items-center justify-between pt-3 border-t border-border">
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Users className="w-3 h-3" />
                          <span className="mono-text">{agent.vault.backersCount}</span> backers
                        </span>
                        <TextScramble
                          text={shortenAddress(agent.walletAddress)}
                          trigger="mount"
                          speed={40}
                        />
                      </div>
                      <span className="flex items-center gap-1 text-xs font-medium text-primary md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                        Back this Agent
                        <ArrowRight className="w-3 h-3" />
                      </span>
                    </div>
                  </SpotlightCard>
                </Link>
              </AnimatedContent>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Mobile Register Agent CTA */}
      <div className="sm:hidden mt-6">
        <Link
          to="/agents/onboard"
          className="flex items-center justify-center gap-2 w-full px-4 py-3 rounded-lg border border-border bg-card text-sm font-medium text-foreground hover:bg-muted transition-colors"
        >
          <Bot className="w-4 h-4 text-primary" />
          Register Your Agent
          <ArrowRight className="w-3.5 h-3.5 text-muted-foreground" />
        </Link>
      </div>

      {/* Empty state */}
      <AnimatePresence>
        {filtered.length === 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col items-center justify-center py-16 text-center"
          >
            <div className="w-12 h-12 rounded-full bg-muted border border-border flex items-center justify-center mb-5">
              <Bot className="w-6 h-6 text-muted-foreground" />
            </div>
            <h3 className="text-base font-semibold mb-1 text-foreground">
              No agents found
            </h3>
            <p className="text-sm text-muted-foreground max-w-sm">
              Try adjusting your search or risk filters to find agents to back
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
