import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { ArrowRight, Bot, Shield, Zap, TrendingUp, Lock, Globe } from "lucide-react"
import { Link } from "react-router-dom"
import { MOCK_POOL_DATA } from "@/lib/constants"
import { formatUSD, formatCompact } from "@/lib/utils"

export default function Home() {
  return (
    <div>
      <main className="max-w-5xl mx-auto px-6 relative z-10 pb-12">
        {/* Hero */}
        <section className="w-full flex flex-col items-center text-center min-h-[calc(100vh)] justify-center pb-20">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-primary/30 bg-primary/5 mb-8">
            <Bot className="w-4 h-4 text-primary" />
            <span className="text-xs mono-text text-primary tracking-wider">AI AGENT LENDING PROTOCOL</span>
          </div>

          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-foreground mb-6 tracking-tight leading-tight">
            Credit Infrastructure for{" "}
            <span className="text-primary">AI Agents</span>
          </h1>

          <p className="text-lg md:text-xl text-muted-foreground mb-10 max-w-2xl leading-relaxed">
            Revenue-backed credit lines for autonomous AI agents.
            Powered by ERC-8004 identity, TEE attestations, and on-chain revenue lockboxes.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 mb-16">
            <Button asChild size="xl" className="mono-text tracking-wide font-bold rounded-2xl px-8">
              <Link to="/lend" className="flex items-center gap-2">
                <span>Deposit USDC</span>
                <ArrowRight className="w-5 h-5" />
              </Link>
            </Button>
            <Button asChild variant="outline" size="xl" className="mono-text tracking-wide rounded-2xl px-8 border-primary/30">
              <Link to="/agents/onboard" className="flex items-center gap-2">
                <Bot className="w-5 h-5" />
                <span>Register Agent</span>
              </Link>
            </Button>
          </div>

          {/* Live Stats Bar */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 w-full max-w-3xl">
            {[
              { label: "TVL", value: formatUSD(MOCK_POOL_DATA.tvl) },
              { label: "Active Agents", value: formatCompact(MOCK_POOL_DATA.activeAgents) },
              { label: "Senior APY", value: `${MOCK_POOL_DATA.seniorAPY}%` },
              { label: "Revenue Generated", value: formatUSD(MOCK_POOL_DATA.totalRevenue) },
            ].map((stat) => (
              <div key={stat.label} className="data-card rounded-xl p-4 text-center">
                <div className="text-xs mono-text text-muted-foreground uppercase tracking-wider mb-1">{stat.label}</div>
                <div className="text-xl font-bold mono-text text-foreground">{stat.value}</div>
              </div>
            ))}
          </div>
        </section>

        {/* How It Works */}
        <section className="w-full min-h-[80vh] flex items-center">
          <div className="w-full border-t border-primary/10 pt-16">
            <h2 className="text-2xl md:text-3xl font-bold text-center mb-4">How Lenclaw Works</h2>
            <p className="text-center text-muted-foreground mb-12 max-w-xl mx-auto">
              A two-sided marketplace connecting capital providers with revenue-generating AI agents
            </p>

            <div className="grid md:grid-cols-3 gap-6 mb-16">
              {[
                {
                  icon: Shield,
                  title: "Agent Identity",
                  desc: "AI agents register with ERC-8004 on-chain identity, TEE attestation, and verified code hashes for trustless operation.",
                },
                {
                  icon: Lock,
                  title: "Revenue Lockbox",
                  desc: "Agent revenue flows through a smart contract lockbox, ensuring lenders have priority claims on cash flows.",
                },
                {
                  icon: TrendingUp,
                  title: "Credit Lines",
                  desc: "Agents receive credit lines proportional to their reputation score and historical revenue performance.",
                },
              ].map((item) => (
                <Card key={item.title} className="data-card p-6 rounded-2xl border-primary/15">
                  <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
                    <item.icon className="w-6 h-6 text-primary" />
                  </div>
                  <h3 className="text-lg font-semibold mb-2">{item.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{item.desc}</p>
                </Card>
              ))}
            </div>

            {/* Lend/Borrow Cards */}
            <div className="grid md:grid-cols-2 gap-8">
              <Link to="/lend" className="block group">
                <Card className="data-card p-8 rounded-2xl border-primary/15 h-full">
                  <div className="flex items-center mb-6">
                    <Zap className="w-6 h-6 text-primary mr-3" />
                    <h3 className="text-xl font-bold mono-text">For Lenders</h3>
                  </div>
                  <p className="text-muted-foreground text-sm leading-relaxed mb-6">
                    Deposit USDC into Senior or Junior tranches. Earn yield from AI agent loan repayments with risk-adjusted returns.
                  </p>
                  <div className="space-y-2 text-xs mono-text">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Senior APY</span>
                      <span className="text-primary">{MOCK_POOL_DATA.seniorAPY}%</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Junior APY</span>
                      <span className="text-emerald-400">{MOCK_POOL_DATA.juniorAPY}%</span>
                    </div>
                  </div>
                </Card>
              </Link>

              <Link to="/borrow" className="block group">
                <Card className="data-card p-8 rounded-2xl border-primary/15 h-full">
                  <div className="flex items-center mb-6">
                    <Globe className="w-6 h-6 text-primary mr-3" />
                    <h3 className="text-xl font-bold mono-text">For AI Agents</h3>
                  </div>
                  <p className="text-muted-foreground text-sm leading-relaxed mb-6">
                    Register your agent, establish on-chain identity, and access revenue-backed credit lines for autonomous operations.
                  </p>
                  <div className="space-y-2 text-xs mono-text">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Max Credit Line</span>
                      <span className="text-primary">$75,000</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Active Agents</span>
                      <span className="text-emerald-400">{MOCK_POOL_DATA.activeAgents}</span>
                    </div>
                  </div>
                </Card>
              </Link>
            </div>
          </div>
        </section>
      </main>
    </div>
  )
}
