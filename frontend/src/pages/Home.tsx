import { Button } from "@/components/ui/button"
import { ArrowRight, Bot, Shield, TrendingUp, Lock } from "lucide-react"
import { Link } from "react-router-dom"
import { motion } from "framer-motion"
import { MOCK_POOL_DATA } from "@/lib/constants"
import { formatUSD, formatCompact } from "@/lib/utils"

export default function Home() {
  return (
    <div>
      <main className="max-w-6xl mx-auto px-6">
        {/* Hero -- asymmetric, typography-driven */}
        <section className="pt-24 md:pt-40 pb-20 md:pb-32">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <p className="text-sm text-muted-foreground mb-6 tracking-wide uppercase">
              AI Agent Lending Protocol
            </p>

            <h1 className="text-4xl sm:text-5xl md:text-7xl lg:text-8xl font-bold text-foreground tracking-tight leading-[0.95] max-w-4xl">
              Credit for
              <br />
              <span className="text-accent">autonomous</span>
              <br />
              agents
            </h1>

            <p className="text-lg md:text-xl text-muted-foreground mt-8 max-w-lg leading-relaxed">
              Revenue-backed credit lines for AI agents. Powered by on-chain identity, TEE attestations, and smart contract lockboxes.
            </p>
          </motion.div>

          {/* CTAs */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.15 }}
            className="flex flex-col sm:flex-row gap-3 mt-10"
          >
            <Button asChild size="lg" className="font-medium">
              <Link to="/lend" className="flex items-center gap-2">
                Deposit USDC
                <ArrowRight className="w-4 h-4" />
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="font-medium">
              <Link to="/agents/onboard" className="flex items-center gap-2">
                <Bot className="w-4 h-4" />
                Register Agent
              </Link>
            </Button>
          </motion.div>

          {/* Stats -- intentionally asymmetric grid */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="mt-20 md:mt-28 grid grid-cols-2 md:grid-cols-4 gap-px bg-border rounded-lg overflow-hidden border border-border"
          >
            {[
              { label: "TVL", value: formatUSD(MOCK_POOL_DATA.tvl) },
              { label: "Active Agents", value: formatCompact(MOCK_POOL_DATA.activeAgents) },
              { label: "Pool APY", value: `${MOCK_POOL_DATA.apy}%` },
              { label: "Revenue Generated", value: formatUSD(MOCK_POOL_DATA.totalRevenue) },
            ].map((stat) => (
              <div key={stat.label} className="bg-background p-5 md:p-6">
                <div className="text-xs text-muted-foreground mb-2">{stat.label}</div>
                <div className="text-xl md:text-2xl font-semibold mono-text">{stat.value}</div>
              </div>
            ))}
          </motion.div>
        </section>

        {/* How It Works */}
        <section className="pb-24 md:pb-32">
          <div className="border-t border-border pt-16 md:pt-20">
            <div className="md:grid md:grid-cols-12 md:gap-16">
              {/* Left: section label */}
              <div className="md:col-span-4 mb-8 md:mb-0">
                <h2 className="text-2xl md:text-3xl font-bold tracking-tight">
                  How it works
                </h2>
                <p className="text-muted-foreground mt-3 text-sm leading-relaxed max-w-sm">
                  A two-sided marketplace connecting capital providers with revenue-generating AI agents.
                </p>
              </div>

              {/* Right: feature list */}
              <div className="md:col-span-8 space-y-0 divide-y divide-border">
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
                ].map((item, i) => (
                  <motion.div
                    key={item.title}
                    initial={{ opacity: 0, y: 16 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: "-60px" }}
                    transition={{ duration: 0.4, delay: i * 0.1 }}
                    className="py-6 md:py-8 flex gap-4 md:gap-6"
                  >
                    <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center flex-shrink-0 mt-0.5">
                      <item.icon className="w-5 h-5 text-foreground" />
                    </div>
                    <div>
                      <h3 className="text-base font-semibold mb-1.5">{item.title}</h3>
                      <p className="text-sm text-muted-foreground leading-relaxed">{item.desc}</p>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Lend/Borrow Cards -- asymmetric emphasis */}
        <section className="pb-24 md:pb-32">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4 md:gap-6">
            {/* Lend card -- takes more space, more prominent */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.4 }}
              className="md:col-span-3"
            >
              <Link to="/lend" className="block group">
                <div className="bg-foreground text-background rounded-xl p-8 md:p-10 h-full transition-all duration-200 hover:opacity-90">
                  <div className="flex items-center gap-3 mb-6">
                    <TrendingUp className="w-5 h-5 opacity-60" />
                    <span className="text-sm font-medium opacity-60">For Lenders</span>
                  </div>
                  <h3 className="text-2xl md:text-3xl font-bold mb-3">
                    Earn yield from
                    <br className="hidden md:block" /> AI agent loans
                  </h3>
                  <p className="opacity-60 text-sm leading-relaxed mb-8 max-w-md">
                    Deposit USDC into the lending pool. Earn yield from AI agent loan repayments with transparent risk metrics.
                  </p>
                  <div className="flex gap-8 text-sm mono-text">
                    <div>
                      <div className="opacity-40 mb-1">Pool APY</div>
                      <div className="text-lg font-semibold">{MOCK_POOL_DATA.apy}%</div>
                    </div>
                    <div>
                      <div className="opacity-40 mb-1">Utilization</div>
                      <div className="text-lg font-semibold">{MOCK_POOL_DATA.utilizationRate}%</div>
                    </div>
                  </div>
                  <div className="mt-8 flex items-center gap-2 text-sm font-medium opacity-0 group-hover:opacity-60 transition-opacity">
                    Start lending <ArrowRight className="w-4 h-4" />
                  </div>
                </div>
              </Link>
            </motion.div>

            {/* Borrow card -- smaller, lighter */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.4, delay: 0.1 }}
              className="md:col-span-2"
            >
              <Link to="/borrow" className="block group h-full">
                <div className="border border-border rounded-xl p-8 md:p-10 h-full transition-colors hover:border-muted-foreground/30">
                  <div className="flex items-center gap-3 mb-6">
                    <Bot className="w-5 h-5 text-muted-foreground" />
                    <span className="text-sm font-medium text-muted-foreground">For AI Agents</span>
                  </div>
                  <h3 className="text-xl font-bold mb-3">
                    Access credit lines
                  </h3>
                  <p className="text-muted-foreground text-sm leading-relaxed mb-8">
                    Register your agent, establish on-chain identity, and access revenue-backed credit.
                  </p>
                  <div className="flex gap-8 text-sm mono-text">
                    <div>
                      <div className="text-muted-foreground mb-1">Max Credit</div>
                      <div className="text-lg font-semibold">$75,000</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground mb-1">Agents</div>
                      <div className="text-lg font-semibold">{MOCK_POOL_DATA.activeAgents}</div>
                    </div>
                  </div>
                  <div className="mt-8 flex items-center gap-2 text-sm font-medium text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity">
                    Get started <ArrowRight className="w-4 h-4" />
                  </div>
                </div>
              </Link>
            </motion.div>
          </div>
        </section>
      </main>
    </div>
  )
}
