import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { StatusBadge } from "@/components/shared/StatusBadge"
import { ProgressBar } from "@/components/shared/ProgressBar"
import { MOCK_AGENTS } from "@/lib/constants"
import { formatUSD, shortenAddress, formatDate } from "@/lib/utils"
import { Bot, Search, Plus, TrendingUp } from "lucide-react"
import { Link } from "react-router-dom"
import { motion, AnimatePresence } from "framer-motion"
import type { AgentStatus } from "@/lib/types"

function ReputationScore({ score }: { score: number }) {
  const getColor = (s: number) => {
    if (s >= 90) return "text-emerald-600 dark:text-emerald-400"
    if (s >= 70) return "text-foreground"
    if (s >= 50) return "text-amber-600 dark:text-amber-400"
    return "text-red-500"
  }

  return (
    <div className={`w-10 h-10 rounded-full border-2 border-current flex items-center justify-center flex-shrink-0 ${getColor(score)}`}>
      <span className="text-xs font-bold mono-text">{score}</span>
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
      transition={{ duration: 0.3 }}
      className="max-w-6xl mx-auto px-6 py-8 md:py-12"
    >
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8 md:mb-10">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight mb-1">Agent Registry</h1>
          <p className="text-muted-foreground text-sm">
            Browse registered AI agents with on-chain identity and credit history
          </p>
        </div>
        <Button asChild className="w-full md:w-auto">
          <Link to="/agents/onboard" className="flex items-center justify-center gap-2">
            <Plus className="w-4 h-4" />
            Register Agent
          </Link>
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-8 p-4 rounded-xl border border-border">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search by name or ERC-8004 ID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <div className="flex gap-1.5 overflow-x-auto pb-1 mobile-scroll-x">
          {(["all", "active", "delinquent", "default"] as const).map((status) => (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              className={`px-3 py-2 rounded-md text-xs font-medium transition-all capitalize whitespace-nowrap min-h-[44px] md:min-h-0 ${
                statusFilter === status
                  ? "bg-foreground text-background"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              {status}
            </button>
          ))}
        </div>
      </div>

      {/* Agent Grid -- intentionally varied layout */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <AnimatePresence mode="popLayout">
          {filtered.map((agent, i) => (
            <motion.div
              key={agent.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3, delay: i * 0.03 }}
              layout
              className="border border-border rounded-xl p-5 md:p-6 hover:border-muted-foreground/30 transition-colors"
            >
              {/* Header row */}
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3 min-w-0">
                  <ReputationScore score={agent.reputationScore} />
                  <div className="min-w-0">
                    <div className="text-base font-semibold truncate">{agent.name}</div>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <Badge variant="outline" className="text-[10px] mono-text">{agent.erc8004Id}</Badge>
                      <StatusBadge status={agent.status} />
                    </div>
                  </div>
                </div>
              </div>

              <p className="text-xs text-muted-foreground mb-4 line-clamp-2">{agent.description}</p>

              {/* Metrics */}
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="p-2.5 rounded-lg bg-muted/50">
                  <div className="text-xs text-muted-foreground mb-0.5">Revenue (30d)</div>
                  <div className="flex items-center gap-1.5">
                    <TrendingUp className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                    <span className="text-sm font-semibold mono-text">{formatUSD(agent.revenue30d)}</span>
                  </div>
                </div>
                <div className="p-2.5 rounded-lg bg-muted/50">
                  <div className="text-xs text-muted-foreground mb-0.5">Credit Line</div>
                  <span className="text-sm font-semibold mono-text">{formatUSD(agent.creditLine)}</span>
                </div>
              </div>

              {/* Utilization bar */}
              <div className="mb-4">
                <div className="flex justify-between text-xs mb-1.5">
                  <span className="text-muted-foreground">Credit Utilization</span>
                  <span className="font-medium mono-text">{agent.utilization}%</span>
                </div>
                <ProgressBar value={agent.utilization} />
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between text-xs text-muted-foreground pt-3 border-t border-border">
                <span className="mono-text">{shortenAddress(agent.walletAddress)}</span>
                <span>Since {formatDate(agent.registeredAt)}</span>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {filtered.length === 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col items-center justify-center py-16 text-center"
          >
            <Bot className="w-10 h-10 text-muted-foreground/30 mb-4" />
            <h3 className="text-base font-medium mb-1">No agents found</h3>
            <p className="text-sm text-muted-foreground">Try adjusting your search or filters</p>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
