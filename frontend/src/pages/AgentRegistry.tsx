import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { StatusBadge } from "@/components/shared/StatusBadge"
import { ProgressBar } from "@/components/shared/ProgressBar"
import { MOCK_AGENTS } from "@/lib/constants"
import { formatUSD, shortenAddress, formatDate } from "@/lib/utils"
import { Bot, Search, Plus, ArrowUpRight, Shield, TrendingUp } from "lucide-react"
import { Link } from "react-router-dom"
import type { AgentStatus } from "@/lib/types"

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
    <div className="max-w-5xl mx-auto px-4 md:px-6 py-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold mono-text mb-2">Agent Registry</h1>
          <p className="text-muted-foreground text-sm">
            Browse registered AI agents with on-chain identity and credit history
          </p>
        </div>
        <Button asChild className="mono-text">
          <Link to="/agents/onboard" className="flex items-center gap-2">
            <Plus className="w-4 h-4" />
            Register Agent
          </Link>
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search by name or ERC-8004 ID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 mono-text"
          />
        </div>
        <div className="flex gap-2">
          {(["all", "active", "delinquent", "default"] as const).map((status) => (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              className={`px-3 py-2 rounded-lg text-xs mono-text font-medium transition-colors capitalize ${
                statusFilter === status
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              {status}
            </button>
          ))}
        </div>
      </div>

      {/* Agent Grid */}
      <div className="grid md:grid-cols-2 gap-4">
        {filtered.map((agent) => (
          <Card key={agent.id} className="data-card rounded-2xl border-primary/15 group">
            <CardHeader>
              <div className="flex items-start justify-between w-full">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                    <Bot className="w-5 h-5 text-primary/70" />
                  </div>
                  <div>
                    <CardTitle className="mono-text text-base flex items-center gap-2">
                      {agent.name}
                      <ArrowUpRight className="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                    </CardTitle>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant="outline" className="mono-text text-[10px]">{agent.erc8004Id}</Badge>
                      <StatusBadge status={agent.status} />
                    </div>
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground mb-4 line-clamp-2">{agent.description}</p>

              <div className="grid grid-cols-2 gap-3 mb-4">
                <div>
                  <div className="text-xs text-muted-foreground mono-text mb-0.5">Reputation</div>
                  <div className="flex items-center gap-2">
                    <Shield className="w-3.5 h-3.5 text-primary/60" />
                    <span className="text-sm font-semibold mono-text">{agent.reputationScore}/100</span>
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground mono-text mb-0.5">Revenue (30d)</div>
                  <div className="flex items-center gap-2">
                    <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="text-sm font-semibold mono-text">{formatUSD(agent.revenue30d)}</span>
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground mono-text mb-0.5">Credit Line</div>
                  <span className="text-sm font-semibold mono-text">{formatUSD(agent.creditLine)}</span>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground mono-text mb-0.5">Utilization</div>
                  <span className="text-sm font-semibold mono-text">{agent.utilization}%</span>
                </div>
              </div>

              <div className="mb-3">
                <div className="flex justify-between text-xs mono-text mb-1">
                  <span className="text-muted-foreground">Credit Utilization</span>
                  <span className="text-foreground">{agent.utilization}%</span>
                </div>
                <ProgressBar value={agent.utilization} />
              </div>

              <div className="flex items-center justify-between text-xs mono-text pt-3 border-t border-border/50">
                <span className="text-muted-foreground">{shortenAddress(agent.walletAddress)}</span>
                <span className="text-muted-foreground">Since {formatDate(agent.registeredAt)}</span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Bot className="w-12 h-12 text-muted-foreground/30 mb-4" />
          <h3 className="text-lg font-semibold mb-2">No agents found</h3>
          <p className="text-sm text-muted-foreground">Try adjusting your search or filters</p>
        </div>
      )}
    </div>
  )
}
