import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { StatusBadge } from "@/components/shared/StatusBadge"
import { ProgressBar } from "@/components/shared/ProgressBar"
import { MOCK_AGENTS } from "@/lib/constants"
import { formatUSD, shortenAddress, formatDate } from "@/lib/utils"
import { Bot, Search, Plus, ArrowUpRight, TrendingUp } from "lucide-react"
import { Link } from "react-router-dom"
import { motion, AnimatePresence } from "framer-motion"
import type { AgentStatus } from "@/lib/types"

// Reputation ring badge
function ReputationBadge({ score }: { score: number }) {
  const size = 40
  const strokeWidth = 3
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const percent = Math.min(Math.max(score, 0), 100)

  const getColor = (s: number) => {
    if (s >= 90) return "#10b981"
    if (s >= 70) return "#8b5cf6"
    if (s >= 50) return "#f59e0b"
    return "#ef4444"
  }

  const color = getColor(score)

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgba(139,92,246,0.08)"
          strokeWidth={strokeWidth}
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: circumference - (percent / 100) * circumference }}
          transition={{ duration: 1, ease: "easeOut" }}
          style={{ filter: `drop-shadow(0 0 4px ${color}40)` }}
        />
      </svg>
      <span className="absolute text-[10px] font-bold mono-text" style={{ color }}>{score}</span>
    </div>
  )
}

export default function AgentRegistry() {
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<AgentStatus | "all">("all")

  const filtered = MOCK_AGENTS.filter((agent) => {
    const matchSearch =
      agent.name.toLowerCase().includes(search.toLowerCase()) ||
      agent.erc8004Id.toLowerCase().includes(search.toLowerCase())
    const matchStatus = statusFilter === "all" || agent.status === statusFilter
    return matchSearch && matchStatus
  })

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
        className="flex flex-col md:flex-row md:items-center justify-between gap-3 md:gap-4 mb-6 md:mb-8"
      >
        <div>
          <h1 className="text-xl sm:text-2xl md:text-3xl font-bold mono-text mb-1.5 md:mb-2">Agent Registry</h1>
          <p className="text-muted-foreground text-xs md:text-sm">
            Browse registered AI agents with on-chain identity and credit history
          </p>
        </div>
        <Button asChild className="mono-text w-full md:w-auto min-h-[44px] bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 shadow-[0_0_15px_rgba(139,92,246,0.15)]">
          <Link to="/agents/onboard" className="flex items-center justify-center gap-2">
            <Plus className="w-4 h-4" />
            Register Agent
          </Link>
        </Button>
      </motion.div>

      {/* Filters with backdrop blur */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.1 }}
        className="flex flex-col sm:flex-row gap-3 mb-6 p-3 rounded-xl frosted-panel"
      >
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search by name or ERC-8004 ID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 mono-text border-primary/10 focus:border-primary/30 bg-background/50"
          />
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1 mobile-scroll-x">
          {(["all", "active", "delinquent", "default"] as const).map((status) => (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              className={`px-3 py-2.5 md:py-2 rounded-lg text-xs mono-text font-medium transition-all capitalize whitespace-nowrap min-h-[44px] md:min-h-0 ${
                statusFilter === status
                  ? "bg-gradient-to-r from-violet-600 to-purple-600 text-white shadow-[0_0_10px_rgba(139,92,246,0.2)]"
                  : "bg-muted/50 text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
            >
              {status}
            </button>
          ))}
        </div>
      </motion.div>

      {/* Agent Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <AnimatePresence mode="popLayout">
          {filtered.map((agent, i) => (
            <motion.div
              key={agent.id}
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.4, delay: i * 0.05 }}
              layout
            >
              <Card className="data-card rounded-2xl border-primary/15 group h-full">
                <CardHeader>
                  <div className="flex items-start justify-between w-full">
                    <div className="flex items-center gap-3 min-w-0">
                      <ReputationBadge score={agent.reputationScore} />
                      <div className="min-w-0">
                        <CardTitle className="mono-text text-base flex items-center gap-2">
                          <span className="truncate">{agent.name}</span>
                          <motion.div
                            className="opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                            whileHover={{ x: 2 }}
                          >
                            <ArrowUpRight className="w-3.5 h-3.5 text-primary" />
                          </motion.div>
                        </CardTitle>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          <Badge variant="outline" className="mono-text text-[10px] border-primary/20">{agent.erc8004Id}</Badge>
                          <StatusBadge status={agent.status} />
                        </div>
                      </div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-xs text-muted-foreground mb-4 line-clamp-2">{agent.description}</p>

                  <div className="grid grid-cols-2 gap-3 mb-4">
                    <div className="p-2 rounded-lg bg-muted/20 border border-border/30">
                      <div className="text-[10px] md:text-xs text-muted-foreground mono-text mb-0.5">Revenue (30d)</div>
                      <div className="flex items-center gap-1.5">
                        <TrendingUp className="w-3 h-3 text-emerald-400" />
                        <span className="text-sm font-semibold mono-text">{formatUSD(agent.revenue30d)}</span>
                      </div>
                    </div>
                    <div className="p-2 rounded-lg bg-muted/20 border border-border/30">
                      <div className="text-[10px] md:text-xs text-muted-foreground mono-text mb-0.5">Credit Line</div>
                      <span className="text-sm font-semibold mono-text">{formatUSD(agent.creditLine)}</span>
                    </div>
                  </div>

                  <div className="mb-3">
                    <div className="flex justify-between text-xs mono-text mb-1">
                      <span className="text-muted-foreground">Credit Utilization</span>
                      <span className="text-foreground">{agent.utilization}%</span>
                    </div>
                    <ProgressBar value={agent.utilization} />
                  </div>

                  <div className="flex items-center justify-between text-[10px] md:text-xs mono-text pt-3 border-t border-border/50">
                    <span className="text-muted-foreground">{shortenAddress(agent.walletAddress)}</span>
                    <span className="text-muted-foreground">Since {formatDate(agent.registeredAt)}</span>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {filtered.length === 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="flex flex-col items-center justify-center py-12 md:py-16 text-center"
          >
            <motion.div
              animate={{ y: [0, -5, 0] }}
              transition={{ duration: 3, repeat: Infinity }}
            >
              <Bot className="w-12 h-12 text-muted-foreground/30 mb-4" />
            </motion.div>
            <h3 className="text-lg font-semibold mb-2">No agents found</h3>
            <p className="text-sm text-muted-foreground">Try adjusting your search or filters</p>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
