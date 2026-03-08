import { MOCK_LEADERBOARD } from "@/lib/constants"
import { formatUSD, formatPercent, formatCompact } from "@/lib/utils"
import type { LeaderboardEntry, AgentBadge, RiskLevel } from "@/lib/types"
import {
  Trophy,
  TrendingUp,
  TrendingDown,
  Minus,
  Wallet,
  Flame,
  Skull,
  Bot,
  Medal,
  Star,
  AlertTriangle,
  Zap,
  ShieldCheck,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { useState } from "react"
import { motion } from "framer-motion"
import { SpotlightCard } from "@/components/reactbits/SpotlightCard"
import { AnimatedContent } from "@/components/reactbits/AnimatedContent"
import { BorderBeam } from "@/components/reactbits/BorderBeam"
import { TextScramble } from "@/components/reactbits/TextScramble"

type TabKey = "earners" | "apy" | "backed" | "hot"

const tabs: { key: TabKey; label: string }[] = [
  { key: "earners", label: "Top Earners" },
  { key: "apy", label: "Highest APY" },
  { key: "backed", label: "Most Backed" },
  { key: "hot", label: "Hot Streak" },
]

const badgeConfig: Record<AgentBadge, { label: string; icon: typeof Flame }> = {
  hot_streak: { label: "Hot Streak", icon: Flame },
  at_risk: { label: "At Risk", icon: AlertTriangle },
  defaulted: { label: "Defaulted", icon: Skull },
  top_earner: { label: "Top Earner", icon: Trophy },
  newcomer: { label: "Newcomer", icon: Zap },
  consistent: { label: "Consistent", icon: Star },
  whale_backed: { label: "Whale Backed", icon: Wallet },
  smart_wallet: { label: "Smart Wallet", icon: ShieldCheck },
}

const riskColors: Record<RiskLevel, string> = {
  safe: "text-success",
  moderate: "text-warning",
  risky: "text-orange-500",
  degen: "text-destructive",
}

function RankDisplay({ rank }: { rank: number }) {
  if (rank === 1) return <Medal className="w-5 h-5 text-yellow-500" />
  if (rank === 2) return <Medal className="w-5 h-5 text-gray-400" />
  if (rank === 3) return <Medal className="w-5 h-5 text-amber-700" />
  return <span className="text-sm font-bold mono-text text-muted-foreground w-5 text-center">{rank}</span>
}

function TrendDisplay({ trend, delta }: { trend: "up" | "down" | "stable"; delta: number }) {
  if (trend === "up") {
    return (
      <span className="flex items-center gap-0.5 text-xs text-success mono-text">
        <TrendingUp className="w-3 h-3" />+{delta}%
      </span>
    )
  }
  if (trend === "down") {
    return (
      <span className="flex items-center gap-0.5 text-xs text-destructive mono-text">
        <TrendingDown className="w-3 h-3" />{delta}%
      </span>
    )
  }
  return (
    <span className="flex items-center gap-0.5 text-xs text-muted-foreground mono-text">
      <Minus className="w-3 h-3" />0%
    </span>
  )
}

function AgentBadges({ badges }: { badges: AgentBadge[] }) {
  return (
    <div className="flex flex-wrap gap-1">
      {badges.map((badge) => {
        const config = badgeConfig[badge]
        const Icon = config.icon
        const variant = badge === "defaulted" ? "danger" as const :
                        badge === "at_risk" ? "warning" as const :
                        badge === "hot_streak" || badge === "top_earner" ? "default" as const :
                        "secondary" as const
        return (
          <Badge key={badge} variant={variant} className="text-[10px] gap-0.5 py-0 px-1.5">
            <Icon className="w-2.5 h-2.5" />
            {config.label}
          </Badge>
        )
      })}
    </div>
  )
}

function LeaderboardRow({ entry, index }: { entry: LeaderboardEntry; index: number }) {
  const isTop3 = entry.rank <= 3
  const isDefaulted = entry.badges.includes("defaulted")

  const content = (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: index * 0.05 }}
    >
      <SpotlightCard className={`p-4 ${isDefaulted ? "opacity-60" : ""}`}>
        <div className="flex items-center gap-3 md:gap-4">
          {/* Rank */}
          <div className="flex-shrink-0 w-6 flex justify-center">
            <RankDisplay rank={entry.rank} />
          </div>

          {/* Agent Info */}
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className={`w-9 h-9 rounded-full border flex items-center justify-center flex-shrink-0 ${
              isDefaulted ? "bg-destructive/10 border-destructive/30" : "bg-muted border-border"
            }`}>
              {isDefaulted ? (
                <Skull className="w-4 h-4 text-destructive" />
              ) : (
                <Bot className="w-4 h-4 text-primary/50" />
              )}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-foreground truncate">{entry.agentName}</span>
                <TrendDisplay trend={entry.trend} delta={entry.trendDelta} />
              </div>
              <div className="mt-0.5">
                <AgentBadges badges={entry.badges} />
              </div>
            </div>
          </div>

          {/* Stats - Desktop */}
          <div className="hidden md:flex items-center gap-6 flex-shrink-0">
            <div className="text-right w-16">
              <span className="text-[10px] text-muted-foreground block uppercase tracking-wider">APY</span>
              <span className={`text-sm font-semibold mono-text ${riskColors[entry.riskLevel]}`}>
                {formatPercent(entry.apy)}
              </span>
            </div>
            <div className="text-right w-20">
              <span className="text-[10px] text-muted-foreground block uppercase tracking-wider">Revenue</span>
              <span className="text-sm font-semibold mono-text text-foreground">{formatUSD(entry.revenue30d)}</span>
            </div>
            <div className="text-right w-16">
              <span className="text-[10px] text-muted-foreground block uppercase tracking-wider">Backers</span>
              <span className="text-sm font-semibold mono-text text-foreground">{entry.backersCount}</span>
            </div>
            <div className="text-right w-20">
              <span className="text-[10px] text-muted-foreground block uppercase tracking-wider">Backed</span>
              <span className="text-sm font-semibold mono-text text-foreground">{formatCompact(entry.totalBacked)}</span>
            </div>
          </div>

          {/* Stats - Mobile */}
          <div className="flex md:hidden flex-col items-end flex-shrink-0">
            <div className="text-right">
              <span className="text-[10px] text-muted-foreground block uppercase tracking-wider">APY</span>
              <span className={`text-sm font-semibold mono-text ${riskColors[entry.riskLevel]}`}>
                {formatPercent(entry.apy)}
              </span>
            </div>
            <span className="text-[10px] text-muted-foreground mono-text mt-0.5">{formatUSD(entry.revenue30d)}</span>
          </div>
        </div>
      </SpotlightCard>
    </motion.div>
  )

  if (isTop3 && !isDefaulted) {
    return <BorderBeam duration={8 + index * 2}>{content}</BorderBeam>
  }
  return content
}

function sortEntries(entries: LeaderboardEntry[], tab: TabKey): LeaderboardEntry[] {
  const sorted = [...entries]
  switch (tab) {
    case "earners":
      sorted.sort((a, b) => b.revenue30d - a.revenue30d)
      break
    case "apy":
      sorted.sort((a, b) => b.apy - a.apy)
      break
    case "backed":
      sorted.sort((a, b) => b.totalBacked - a.totalBacked)
      break
    case "hot":
      sorted.sort((a, b) => b.trendDelta - a.trendDelta)
      break
  }
  return sorted.map((e, i) => ({ ...e, rank: i + 1 }))
}

export default function Leaderboard() {
  const [activeTab, setActiveTab] = useState<TabKey>("earners")

  const activeEntries = sortEntries(
    MOCK_LEADERBOARD.filter((e) => !e.badges.includes("defaulted")),
    activeTab
  )
  const defaultedEntries = MOCK_LEADERBOARD.filter((e) => e.badges.includes("defaulted"))

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="max-w-6xl mx-auto px-4 sm:px-6 py-8 md:py-12"
    >
      {/* Header */}
      <div className="mb-8 md:mb-10">
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight mb-1 text-foreground">Leaderboard</h1>
        <p className="text-muted-foreground text-sm">Top performing agents by revenue, APY, and backing</p>
      </div>

      {/* Tabs */}
      <AnimatedContent>
        <div className="flex gap-1 p-1 rounded-lg bg-muted mb-8 md:mb-10 overflow-x-auto">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex-1 min-w-0 px-3 py-2 rounded-md text-xs font-medium transition-all whitespace-nowrap ${
                activeTab === tab.key
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </AnimatedContent>

      {/* Top 3 Summary Cards */}
      <AnimatedContent delay={0.05}>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4 mb-8 md:mb-10">
          {activeEntries.slice(0, 3).map((entry, i) => {
            const medalColors = ["text-yellow-500", "text-gray-400", "text-amber-700"]
            return (
              <BorderBeam key={entry.agentId} duration={6 + i * 2}>
                <SpotlightCard className="p-5 text-center">
                  <Medal className={`w-6 h-6 mx-auto mb-2 ${medalColors[i]}`} />
                  <div className="text-base font-bold text-foreground mb-0.5">
                    <TextScramble text={entry.agentName} trigger="mount" speed={40} />
                  </div>
                  <div className="flex items-center justify-center gap-3 mb-3">
                    <span className={`text-lg font-bold mono-text ${riskColors[entry.riskLevel]}`}>
                      {formatPercent(entry.apy)}
                    </span>
                    <TrendDisplay trend={entry.trend} delta={entry.trendDelta} />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="p-2 rounded-lg bg-muted">
                      <span className="text-[10px] text-muted-foreground block uppercase tracking-wider">Revenue</span>
                      <span className="text-sm font-semibold mono-text text-foreground">{formatUSD(entry.revenue30d)}</span>
                    </div>
                    <div className="p-2 rounded-lg bg-muted">
                      <span className="text-[10px] text-muted-foreground block uppercase tracking-wider">Backers</span>
                      <span className="text-sm font-semibold mono-text text-foreground">{entry.backersCount}</span>
                    </div>
                  </div>
                  <div className="mt-3">
                    <AgentBadges badges={entry.badges} />
                  </div>
                </SpotlightCard>
              </BorderBeam>
            )
          })}
        </div>
      </AnimatedContent>

      {/* Full Rankings */}
      <AnimatedContent delay={0.15}>
        <div className="flex items-center gap-2 mb-4">
          <Trophy className="w-4 h-4 text-primary/50" />
          <h2 className="text-sm font-medium text-foreground">Full Rankings</h2>
        </div>
        <div className="space-y-2">
          {activeEntries.map((entry, i) => (
            <LeaderboardRow key={entry.agentId} entry={entry} index={i} />
          ))}
        </div>
      </AnimatedContent>

      {/* Hall of Shame */}
      {defaultedEntries.length > 0 && (
        <AnimatedContent delay={0.25}>
          <div className="mt-10 md:mt-12">
            <div className="flex items-center gap-2 mb-4">
              <Skull className="w-4 h-4 text-destructive/50" />
              <h2 className="text-sm font-medium text-foreground">Hall of Shame</h2>
            </div>
            <div className="space-y-2">
              {defaultedEntries.map((entry, i) => (
                <LeaderboardRow key={entry.agentId} entry={{ ...entry, rank: i + 1 }} index={i} />
              ))}
            </div>
          </div>
        </AnimatedContent>
      )}
    </motion.div>
  )
}
