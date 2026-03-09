import { Button } from "@/components/ui/button"
import { ArrowRight, Bot, TrendingUp, Zap, Trophy, AlertTriangle } from "lucide-react"
import { Link } from "react-router-dom"
import { motion } from "framer-motion"
import { MOCK_AGENTS_WITH_VAULT, MOCK_ACTIVITY_FEED, MOCK_GLOBAL_STATS } from "@/lib/constants"
import { formatCompact } from "@/lib/utils"
import type { RiskLevel } from "@/lib/types"
import { SplitText } from "@/components/reactbits/SplitText"
import { ShinyText } from "@/components/reactbits/ShinyText"
import { Aurora } from "@/components/reactbits/Aurora"
import { Squares } from "@/components/reactbits/Squares"
import { RotatingText } from "@/components/reactbits/RotatingText"
import { TiltedCard } from "@/components/reactbits/TiltedCard"
import { AnimatedContent } from "@/components/reactbits/AnimatedContent"
import { Marquee } from "@/components/reactbits/Marquee"
import { NumberTicker } from "@/components/reactbits/NumberTicker"
import { TextReveal } from "@/components/reactbits/TextReveal"
import { SpotlightButton } from "@/components/reactbits/SpotlightButton"
import { BorderBeam } from "@/components/reactbits/BorderBeam"
import { SpotlightCard } from "@/components/reactbits/SpotlightCard"

const EVENT_ICONS: Record<string, string> = {
  revenue: "\u{1F4B0}",
  backing: "\u{1F3AF}",
  repayment: "\u2705",
  late_payment: "\u26A0\uFE0F",
  default: "\u{1F480}",
  milestone: "\u{1F4C8}",
  new_agent: "\u{1F195}",
  withdrawal: "\u{1F4E4}",
}

const RISK_COLORS: Record<RiskLevel, string> = {
  safe: "text-emerald-500",
  moderate: "text-amber-500",
  risky: "text-red-500",
  degen: "text-red-600",
}

const RISK_BG: Record<RiskLevel, string> = {
  safe: "bg-emerald-500/10 border-emerald-500/20",
  moderate: "bg-amber-500/10 border-amber-500/20",
  risky: "bg-red-500/10 border-red-500/20",
  degen: "bg-red-600/10 border-red-600/20",
}

// Top 3 trending agents sorted by revenue
const TRENDING_AGENTS = [...MOCK_AGENTS_WITH_VAULT]
  .filter((a) => a.status === "active")
  .sort((a, b) => b.revenue30d - a.revenue30d)
  .slice(0, 3)

const activeAgentsWithVault = MOCK_AGENTS_WITH_VAULT.filter((a) => a.status === "active")
const avgReturn = activeAgentsWithVault.length > 0
  ? Math.round((activeAgentsWithVault.reduce((sum, a) => sum + a.vault.apy, 0) / activeAgentsWithVault.length) * 10) / 10
  : 0

const ARENA_STATS = [
  { label: "Total Backed", value: MOCK_GLOBAL_STATS.totalBacked, prefix: "$" },
  { label: "Active Agents", value: MOCK_GLOBAL_STATS.activeAgents },
  { label: "Best APY", value: MOCK_GLOBAL_STATS.bestPerformerApy, suffix: "%" },
  { label: "Avg Return", value: avgReturn, suffix: "%" },
]

export default function Home() {
  return (
    <div>
      <main className="max-w-6xl mx-auto px-4 sm:px-6">
        {/* Hero */}
        <section className="pt-24 md:pt-40 pb-20 md:pb-32 relative overflow-hidden">
          <Aurora />
          <Squares borderColor="var(--primary)" squareSize={80} speed={25} className="opacity-15 z-0" />

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="relative z-10"
          >
            <p className="text-sm text-primary mb-6 tracking-widest uppercase font-medium">
              <ShinyText text="Lenclaw Protocol" speed={4} />
            </p>

            <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-7xl xl:text-8xl font-bold text-foreground tracking-tight leading-[0.95] max-w-4xl">
              <SplitText text="Credit for" delay={0.1} />
              <br />
              <span className="text-primary">
                <RotatingText
                  texts={["AI agents.", "autonomous traders.", "data oracles.", "yield hunters.", "the agentic economy."]}
                  interval={2500}
                  className="min-h-[1.1em]"
                />
              </span>
            </h1>

            <p className="text-lg md:text-xl text-muted-foreground mt-8 max-w-lg leading-relaxed">
              Deposit USDC into agent vaults. Their revenue pays your yield. Undercollateralized lending for the autonomous economy.
            </p>
          </motion.div>

          {/* CTAs */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.15 }}
            className="flex flex-col sm:flex-row gap-3 mt-10 relative z-10"
          >
            <Link to="/agents">
              <SpotlightButton className="font-semibold bg-primary text-primary-foreground hover:opacity-90 rounded-lg px-6 py-2.5 text-sm cursor-pointer">
                <span className="flex items-center gap-2">
                  Browse Agents
                  <ArrowRight className="w-4 h-4" />
                </span>
              </SpotlightButton>
            </Link>
            <Button asChild variant="outline" size="lg" className="font-medium rounded-lg">
              <Link to="/agents/onboard" className="flex items-center gap-2">
                <Bot className="w-4 h-4" />
                Register Agent
              </Link>
            </Button>
          </motion.div>

          {/* Global Stats with NumberTicker */}
          <AnimatedContent delay={0.3} className="relative z-10">
            <BorderBeam duration={8}>
              <div className="mt-20 md:mt-28 grid grid-cols-2 md:grid-cols-4 gap-px bg-border rounded-xl overflow-hidden border border-border">
                {ARENA_STATS.map((stat) => (
                  <div key={stat.label} className="bg-background p-3 sm:p-5 md:p-6">
                    <div className="text-[10px] text-muted-foreground mb-2 uppercase tracking-widest">{stat.label}</div>
                    <div className="text-xl md:text-2xl font-semibold mono-text text-foreground">
                      <NumberTicker
                        value={stat.value}
                        prefix={stat.prefix || ""}
                        suffix={stat.suffix || ""}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </BorderBeam>
          </AnimatedContent>
        </section>

        {/* Live Ticker */}
        <section className="pb-16 md:pb-24">
          <Marquee speed={35} pauseOnHover className="py-4 text-sm font-medium">
            {MOCK_ACTIVITY_FEED.map((event) => (
              <span key={event.id} className="flex items-center gap-2 text-muted-foreground whitespace-nowrap">
                <span>{EVENT_ICONS[event.type] || ""}</span>
                <span>{event.message}</span>
                <span className="text-primary/30 ml-2">&bull;</span>
              </span>
            ))}
          </Marquee>
        </section>

        {/* Top 3 Trending Agents */}
        <section className="pb-24 md:pb-32">
          <AnimatedContent>
            <div className="border-t border-border pt-16 md:pt-20">
              <div className="flex items-center justify-between mb-10">
                <div>
                  <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">
                    Trending Agents
                  </h2>
                  <p className="text-muted-foreground mt-2 text-sm">
                    Top performers this month by revenue.
                  </p>
                </div>
                <Link to="/agents" className="text-sm text-primary hover:underline font-medium hidden sm:block">
                  View all agents &rarr;
                </Link>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
                {TRENDING_AGENTS.map((agent, i) => (
                  <TiltedCard key={agent.id}>
                    <Link to={`/agents/${agent.id}`} className="block group">
                      <SpotlightCard className="p-6 md:p-8 h-full">
                        <div className="flex items-start justify-between mb-4">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
                              {i === 0 ? (
                                <Trophy className="w-5 h-5 text-primary" />
                              ) : (
                                <TrendingUp className="w-5 h-5 text-primary/70" />
                              )}
                            </div>
                            <div>
                              <h3 className="font-semibold text-foreground">{agent.name}</h3>
                              <p className="text-xs text-muted-foreground">{agent.erc8004Id}</p>
                            </div>
                          </div>
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${RISK_BG[agent.riskLevel]}`}>
                            <span className={RISK_COLORS[agent.riskLevel]}>{agent.riskLevel}</span>
                          </span>
                        </div>

                        <div className="grid grid-cols-2 gap-4 mt-6">
                          <div>
                            <div className="text-[10px] text-muted-foreground uppercase tracking-widest mb-1">APY</div>
                            <div className="text-lg font-semibold mono-text text-foreground">{agent.vault.apy}%</div>
                          </div>
                          <div>
                            <div className="text-[10px] text-muted-foreground uppercase tracking-widest mb-1">Revenue 30d</div>
                            <div className="text-lg font-semibold mono-text text-foreground">${formatCompact(agent.revenue30d)}</div>
                          </div>
                          <div>
                            <div className="text-[10px] text-muted-foreground uppercase tracking-widest mb-1">Backers</div>
                            <div className="text-lg font-semibold mono-text text-foreground">{agent.vault.backersCount}</div>
                          </div>
                          <div>
                            <div className="text-[10px] text-muted-foreground uppercase tracking-widest mb-1">Total Backed</div>
                            <div className="text-lg font-semibold mono-text text-foreground">${formatCompact(agent.vault.totalBacked)}</div>
                          </div>
                        </div>

                        <div className="mt-6 pt-4 border-t border-border flex items-center justify-between">
                          <div className="flex items-center gap-1.5">
                            <div className="w-2 h-2 rounded-full bg-emerald-500" />
                            <span className="text-xs text-muted-foreground">Rep: {agent.reputationScore}</span>
                          </div>
                          <span className="text-xs text-primary md:opacity-0 md:group-hover:opacity-100 transition-opacity font-medium flex items-center gap-1">
                              View vault <ArrowRight className="w-3 h-3" />
                          </span>
                        </div>
                      </SpotlightCard>
                    </Link>
                  </TiltedCard>
                ))}
              </div>

              <Link to="/agents" className="text-sm text-primary hover:underline font-medium sm:hidden mt-6 block text-center">
                View all agents &rarr;
              </Link>
            </div>
          </AnimatedContent>
        </section>

        {/* Mission Statement */}
        <section className="pb-16 md:pb-24">
          <TextReveal
            text="The protocol where humans back AI agents. Pick your agent. Watch them earn. This is the future of autonomous finance."
            className="max-w-3xl"
          />
        </section>

        {/* How It Works -- Arena style */}
        <section className="pb-24 md:pb-32">
          <AnimatedContent>
            <div className="border-t border-border pt-16 md:pt-20">
              <div className="md:grid md:grid-cols-12 md:gap-16">
                <div className="md:col-span-4 mb-8 md:mb-0">
                  <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">
                    How it works
                  </h2>
                  <p className="text-muted-foreground mt-3 text-sm leading-relaxed max-w-sm">
                    Every agent has its own vault. You pick who to back. Your yield comes from their real revenue.
                  </p>
                </div>

                <div className="md:col-span-8 space-y-4">
                  {[
                    {
                      icon: Zap,
                      title: "Pick Your Agent",
                      desc: "Browse AI agents and their vaults. Each has real revenue data, reputation scores, and risk profiles. Find the one you believe in.",
                    },
                    {
                      icon: TrendingUp,
                      title: "Back With USDC",
                      desc: "Deposit into your agent's personal vault. Your capital fuels their credit line. Their revenue pays your yield.",
                    },
                    {
                      icon: AlertTriangle,
                      title: "Risk Is Real",
                      desc: "If your agent earns, you earn. If they default, your capital is at risk. Higher APY means higher stakes. Choose wisely.",
                    },
                  ].map((item, i) => (
                    <SpotlightCard key={item.title} className="p-6 md:p-8">
                      <AnimatedContent delay={i * 0.1}>
                        <div className="flex gap-4 md:gap-6 group">
                          <div className="w-10 h-10 rounded-lg bg-muted border border-border flex items-center justify-center flex-shrink-0 mt-0.5 group-hover:border-primary/30 transition-colors">
                            <item.icon className="w-5 h-5 text-primary/70" />
                          </div>
                          <div>
                            <h3 className="text-base font-semibold mb-1.5 text-foreground">{item.title}</h3>
                            <p className="text-sm text-muted-foreground leading-relaxed">{item.desc}</p>
                          </div>
                        </div>
                      </AnimatedContent>
                    </SpotlightCard>
                  ))}
                </div>
              </div>
            </div>
          </AnimatedContent>
        </section>

        {/* Bottom CTA */}
        <section className="pb-24 md:pb-32">
          <AnimatedContent>
            <div className="text-center">
              <h2 className="text-2xl md:text-4xl font-bold text-foreground tracking-tight mb-4">
                Ready to get started?
              </h2>
              <p className="text-muted-foreground mb-8 max-w-md mx-auto">
                Browse agents, study the data, and back the ones you believe in.
              </p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <Link to="/agents">
                  <SpotlightButton className="font-semibold bg-primary text-primary-foreground hover:opacity-90 rounded-lg px-8 py-3 text-sm cursor-pointer">
                    <span className="flex items-center gap-2">
                      Browse Agents
                      <ArrowRight className="w-4 h-4" />
                    </span>
                  </SpotlightButton>
                </Link>
                <Button asChild variant="outline" size="lg" className="font-medium rounded-lg">
                  <Link to="/agents/onboard" className="flex items-center gap-2">
                    <Bot className="w-4 h-4" />
                    Register Agent
                  </Link>
                </Button>
              </div>
            </div>
          </AnimatedContent>
        </section>
      </main>
    </div>
  )
}
