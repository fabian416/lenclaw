import { useState, useEffect, useCallback } from "react"
import { Link } from "react-router-dom"
import { motion, AnimatePresence } from "framer-motion"
import { AnimatedContent } from "@/components/reactbits/AnimatedContent"
import { SpotlightCard } from "@/components/reactbits/SpotlightCard"
import { MOCK_ACTIVITY_FEED } from "@/lib/constants"
import { formatUSD, timeAgo } from "@/lib/utils"
import type { ActivityEvent, ActivityEventType } from "@/lib/types"
import {
  DollarSign,
  ArrowUpRight,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Star,
  Bot,
  Wallet,
  Radio,
} from "lucide-react"

// ── Event config ──────────────────────────────────────────────────────────────

const EVENT_CONFIG: Record<
  ActivityEventType,
  { Icon: typeof DollarSign; color: string; bg: string }
> = {
  revenue: { Icon: DollarSign, color: "text-success", bg: "bg-success/10" },
  backing: { Icon: ArrowUpRight, color: "text-primary", bg: "bg-primary/10" },
  repayment: { Icon: CheckCircle2, color: "text-success", bg: "bg-success/10" },
  late_payment: { Icon: AlertTriangle, color: "text-warning", bg: "bg-warning/10" },
  default: { Icon: XCircle, color: "text-destructive", bg: "bg-destructive/10" },
  milestone: { Icon: Star, color: "text-primary", bg: "bg-primary/10" },
  new_agent: { Icon: Bot, color: "text-primary", bg: "bg-primary/10" },
  withdrawal: { Icon: Wallet, color: "text-muted-foreground", bg: "bg-muted" },
}

// ── Filter tabs ──────────────────────────────────────────────────────────────

type FilterTab = "all" | "revenue" | "backings" | "repayments" | "withdrawals" | "alerts" | "defaults" | "activity"

const FILTER_TABS: { key: FilterTab; label: string }[] = [
  { key: "all", label: "All" },
  { key: "revenue", label: "Revenue" },
  { key: "backings", label: "Backings" },
  { key: "repayments", label: "Repayments" },
  { key: "withdrawals", label: "Withdrawals" },
  { key: "alerts", label: "Alerts" },
  { key: "defaults", label: "Defaults" },
  { key: "activity", label: "Activity" },
]

const FILTER_MAP: Record<FilterTab, ActivityEventType[]> = {
  all: [],
  revenue: ["revenue"],
  backings: ["backing"],
  repayments: ["repayment"],
  withdrawals: ["withdrawal"],
  alerts: ["late_payment"],
  defaults: ["default"],
  activity: ["milestone", "new_agent"],
}

// ── Simulated new events pool ────────────────────────────────────────────────

const SIMULATED_EVENTS: Omit<ActivityEvent, "id" | "timestamp">[] = [
  { type: "revenue", agentId: 1, agentName: "AutoTrader-v3", amount: 840, message: "AutoTrader-v3 earned $840 from ETH/USDT arb" },
  { type: "backing", agentId: 8, agentName: "StableYield-Pro", amount: 15_000, message: "0xCA35...733c backed StableYield-Pro with $15,000" },
  { type: "repayment", agentId: 3, agentName: "DataOracle-Prime", amount: 3_200, message: "DataOracle-Prime repaid $3,200 on schedule" },
  { type: "revenue", agentId: 4, agentName: "NFT-Curator-X", amount: 920, message: "NFT-Curator-X earned $920 from OpenSea flip" },
  { type: "revenue", agentId: 6, agentName: "SniperBot-X", amount: 1_100, message: "SniperBot-X earned $1,100 from token launch" },
  { type: "backing", agentId: 1, agentName: "AutoTrader-v3", amount: 7_500, message: "0x7E5F...5Bdf backed AutoTrader-v3 with $7,500" },
  { type: "repayment", agentId: 2, agentName: "ContentGen-AI", amount: 1_800, message: "ContentGen-AI repaid $1,800 ahead of schedule" },
  { type: "revenue", agentId: 8, agentName: "StableYield-Pro", amount: 220, message: "StableYield-Pro earned $220 from Compound yield" },
]

// ── Event card ────────────────────────────────────────────────────────────────

function EventCard({ event, index }: { event: ActivityEvent; index: number }) {
  const config = EVENT_CONFIG[event.type]
  const Icon = config.Icon

  return (
    <motion.div
      initial={{ opacity: 0, y: 16, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, height: 0, marginBottom: 0 }}
      transition={{ duration: 0.35, delay: index * 0.03 }}
      layout
    >
      <SpotlightCard className="p-4 md:p-5">
        <div className="flex items-start gap-3">
          {/* Icon */}
          <div className={`w-9 h-9 rounded-full ${config.bg} flex items-center justify-center flex-shrink-0 mt-0.5`}>
            <Icon className={`w-4 h-4 ${config.color}`} />
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <Link
                  to={`/agents/${event.agentId}`}
                  className="text-sm font-semibold text-foreground hover:text-primary transition-colors"
                >
                  {event.agentName}
                </Link>
                <p className="text-sm text-muted-foreground mt-0.5 leading-snug line-clamp-2">
                  {event.message}
                </p>
              </div>
              {event.amount != null && event.amount > 0 && (
                <span className="text-sm font-semibold mono-text text-foreground flex-shrink-0">
                  {formatUSD(event.amount)}
                </span>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground mt-1.5">{timeAgo(event.timestamp)}</p>
          </div>
        </div>
      </SpotlightCard>
    </motion.div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function Feed() {
  const [activeFilter, setActiveFilter] = useState<FilterTab>("all")
  const [events, setEvents] = useState<ActivityEvent[]>(() =>
    [...MOCK_ACTIVITY_FEED].sort((a, b) => b.timestamp - a.timestamp)
  )

  // Simulate new events appearing
  const addSimulatedEvent = useCallback(() => {
    const template = SIMULATED_EVENTS[Math.floor(Math.random() * SIMULATED_EVENTS.length)]
    const newEvent: ActivityEvent = {
      ...template,
      id: `sim-${Date.now()}`,
      timestamp: Date.now() / 1000,
    }
    setEvents((prev) => [newEvent, ...prev].slice(0, 50))
  }, [])

  useEffect(() => {
    const interval = setInterval(addSimulatedEvent, 8000)
    return () => clearInterval(interval)
  }, [addSimulatedEvent])

  // Filter events
  const filteredEvents = activeFilter === "all"
    ? events
    : events.filter((e) => FILTER_MAP[activeFilter].includes(e.type))

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="max-w-3xl mx-auto px-4 sm:px-6 py-8 md:py-12"
    >
      {/* Header */}
      <AnimatedContent>
        <div className="mb-8 md:mb-10">
          <div className="flex items-center gap-2 mb-1">
            <Radio className="w-5 h-5 text-primary" />
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">
              Live Feed
            </h1>
          </div>
          <p className="text-muted-foreground text-sm">Real-time protocol activity</p>
        </div>
      </AnimatedContent>

      {/* Filter Tabs */}
      <AnimatedContent delay={0.05}>
        <div className="flex gap-1 p-1 rounded-lg bg-muted mb-6 md:mb-8 overflow-x-auto mobile-scroll-x">
          {FILTER_TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveFilter(tab.key)}
              className={`flex-shrink-0 min-w-[44px] px-3 py-2 rounded-md text-xs font-medium transition-all whitespace-nowrap ${
                activeFilter === tab.key
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </AnimatedContent>

      {/* Events Timeline */}
      <div className="space-y-2">
        <AnimatePresence mode="popLayout">
          {filteredEvents.map((event, i) => (
            <EventCard key={event.id} event={event} index={i} />
          ))}
        </AnimatePresence>
      </div>

      {/* Empty filter state */}
      <AnimatePresence>
        {filteredEvents.length === 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col items-center justify-center py-16 text-center"
          >
            <div className="w-12 h-12 rounded-full bg-muted border border-border flex items-center justify-center mb-5">
              <Radio className="w-6 h-6 text-muted-foreground" />
            </div>
            <h3 className="text-base font-semibold mb-1 text-foreground">
              No events yet
            </h3>
            <p className="text-sm text-muted-foreground max-w-sm">
              No activity matching this filter. Check back soon or try a different filter.
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
