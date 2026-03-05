import { Button } from "@/components/ui/button"
import { ArrowRight, Bot, Shield, TrendingUp, Lock } from "lucide-react"
import { Link } from "react-router-dom"
import { motion } from "framer-motion"
import { MOCK_POOL_DATA } from "@/lib/constants"
import { SplitText } from "@/components/reactbits/SplitText"
import { ShinyText } from "@/components/reactbits/ShinyText"
import { Aurora } from "@/components/reactbits/Aurora"
import { Squares } from "@/components/reactbits/Squares"
import { RotatingText } from "@/components/reactbits/RotatingText"
import { TiltedCard } from "@/components/reactbits/TiltedCard"
import { SpotlightCard } from "@/components/reactbits/SpotlightCard"
import { AnimatedContent } from "@/components/reactbits/AnimatedContent"
import { Marquee } from "@/components/reactbits/Marquee"

import { NumberTicker } from "@/components/reactbits/NumberTicker"
import { TextReveal } from "@/components/reactbits/TextReveal"
import { SpotlightButton } from "@/components/reactbits/SpotlightButton"
import { BorderBeam } from "@/components/reactbits/BorderBeam"

export default function Home() {
  return (
    <div>
      <main className="max-w-6xl mx-auto px-6">
        {/* Hero -- asymmetric, typography-driven with Aurora background */}
        <section className="pt-24 md:pt-40 pb-20 md:pb-32 relative overflow-hidden">
          <Aurora />
          <Squares borderColor="#14f195" squareSize={80} speed={25} className="opacity-15 z-0" />

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="relative z-10"
          >
            <p className="text-sm text-[#14f195] mb-6 tracking-widest uppercase font-medium">
              <ShinyText text="AI Agent Lending Protocol" speed={4} />
            </p>

            <h1 className="text-4xl sm:text-5xl md:text-7xl lg:text-8xl font-bold text-white tracking-tight leading-[0.95] max-w-4xl">
              <SplitText text="Credit for" delay={0.1} />
              <br />
              <span className="text-[#14f195]">
                <RotatingText
                  texts={["autonomous agents", "DeFi protocols", "the agentic economy"]}
                  interval={2500}
                  className="h-[1.1em]"
                />
              </span>
            </h1>

            <p className="text-lg md:text-xl text-white/60 mt-8 max-w-lg leading-relaxed">
              Revenue-backed credit lines for AI agents. Powered by on-chain identity, TEE attestations, and smart contract lockboxes.
            </p>
          </motion.div>

          {/* CTAs */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.15 }}
            className="flex flex-col sm:flex-row gap-3 mt-10 relative z-10"
          >
            <Link to="/lend">
              <SpotlightButton className="font-semibold bg-[#14f195] text-black hover:bg-[#14f195]/90 rounded-lg px-6 py-2.5 text-sm cursor-pointer">
                <span className="flex items-center gap-2">
                  Deposit USDC
                  <ArrowRight className="w-4 h-4" />
                </span>
              </SpotlightButton>
            </Link>
            <Button asChild variant="outline" size="lg" className="font-medium border-white/20 hover:border-[#14f195]/50 bg-transparent text-white rounded-lg">
              <Link to="/agents/onboard" className="flex items-center gap-2">
                <Bot className="w-4 h-4" />
                Register Agent
              </Link>
            </Button>
          </motion.div>

          {/* Stats with NumberTicker */}
          <AnimatedContent delay={0.3} className="relative z-10">
            <BorderBeam duration={8}>
              <div className="mt-20 md:mt-28 grid grid-cols-2 md:grid-cols-4 gap-px bg-white/[0.06] rounded-xl overflow-hidden border border-white/[0.08]">
                {[
                  { label: "TVL", value: MOCK_POOL_DATA.tvl, prefix: "$" },
                  { label: "Active Agents", value: MOCK_POOL_DATA.activeAgents },
                  { label: "Pool APY", value: MOCK_POOL_DATA.apy, suffix: "%" },
                  { label: "Revenue Generated", value: MOCK_POOL_DATA.totalRevenue, prefix: "$" },
                ].map((stat) => (
                  <div key={stat.label} className="bg-[#0a0a0a] p-5 md:p-6">
                    <div className="text-[10px] text-white/40 mb-2 uppercase tracking-widest">{stat.label}</div>
                    <div className="text-xl md:text-2xl font-semibold mono-text text-white">
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

        {/* Mission Statement */}
        <section className="pb-16 md:pb-24">
          <TextReveal
            text="Building the credit infrastructure for the autonomous economy. Every agent should have access to capital."
            className="max-w-3xl"
          />
        </section>

        {/* How It Works */}
        <section className="pb-24 md:pb-32">
          <AnimatedContent>
            <div className="border-t border-white/[0.08] pt-16 md:pt-20">
              <div className="md:grid md:grid-cols-12 md:gap-16">
                {/* Left: section label */}
                <div className="md:col-span-4 mb-8 md:mb-0">
                  <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-white">
                    How it works
                  </h2>
                  <p className="text-white/50 mt-3 text-sm leading-relaxed max-w-sm">
                    A two-sided marketplace connecting capital providers with revenue-generating AI agents.
                  </p>
                </div>

                {/* Right: feature list */}
                <div className="md:col-span-8 space-y-4">
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
                    <SpotlightCard key={item.title} className="p-6 md:p-8">
                      <AnimatedContent delay={i * 0.1}>
                        <div className="flex gap-4 md:gap-6 group">
                          <div className="w-10 h-10 rounded-lg bg-white/[0.05] border border-white/[0.08] flex items-center justify-center flex-shrink-0 mt-0.5 group-hover:border-[#14f195]/30 transition-colors">
                            <item.icon className="w-5 h-5 text-[#14f195]/70" />
                          </div>
                          <div>
                            <h3 className="text-base font-semibold mb-1.5 text-white">{item.title}</h3>
                            <p className="text-sm text-white/50 leading-relaxed">{item.desc}</p>
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

        {/* Lend/Borrow Cards */}
        <section className="pb-24 md:pb-32">
          <AnimatedContent>
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4 md:gap-6">
              {/* Lend card -- takes more space, accent card */}
              <TiltedCard className="md:col-span-3">
                <Link to="/lend" className="block group">
                  <div className="bg-[#14f195] text-black rounded-xl p-8 md:p-10 h-full transition-all duration-200 hover:shadow-[0_0_60px_rgba(20,241,149,0.15)]">
                    <div className="flex items-center gap-3 mb-6">
                      <TrendingUp className="w-5 h-5 opacity-60" />
                      <span className="text-sm font-semibold opacity-60 uppercase tracking-wider">For Lenders</span>
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
                        <div className="opacity-40 mb-1 text-xs uppercase tracking-wider">Pool APY</div>
                        <div className="text-lg font-semibold">{MOCK_POOL_DATA.apy}%</div>
                      </div>
                      <div>
                        <div className="opacity-40 mb-1 text-xs uppercase tracking-wider">Utilization</div>
                        <div className="text-lg font-semibold">{MOCK_POOL_DATA.utilizationRate}%</div>
                      </div>
                    </div>
                    <div className="mt-8 flex items-center gap-2 text-sm font-semibold opacity-0 group-hover:opacity-60 transition-opacity">
                      Start lending <ArrowRight className="w-4 h-4" />
                    </div>
                  </div>
                </Link>
              </TiltedCard>

              {/* Borrow card -- glass card */}
              <TiltedCard className="md:col-span-2 h-full">
                <Link to="/borrow" className="block group h-full">
                  <div className="border border-white/[0.08] bg-white/[0.03] rounded-xl p-8 md:p-10 h-full transition-all hover:border-[#14f195]/30 hover:shadow-[0_0_30px_rgba(20,241,149,0.06)]">
                    <div className="flex items-center gap-3 mb-6">
                      <Bot className="w-5 h-5 text-white/40" />
                      <span className="text-sm font-medium text-white/40 uppercase tracking-wider">For AI Agents</span>
                    </div>
                    <h3 className="text-xl font-bold mb-3 text-white">
                      Access credit lines
                    </h3>
                    <p className="text-white/50 text-sm leading-relaxed mb-8">
                      Register your agent, establish on-chain identity, and access revenue-backed credit.
                    </p>
                    <div className="flex gap-8 text-sm mono-text">
                      <div>
                        <div className="text-white/30 mb-1 text-xs uppercase tracking-wider">Max Credit</div>
                        <div className="text-lg font-semibold text-white">$75,000</div>
                      </div>
                      <div>
                        <div className="text-white/30 mb-1 text-xs uppercase tracking-wider">Agents</div>
                        <div className="text-lg font-semibold text-white">{MOCK_POOL_DATA.activeAgents}</div>
                      </div>
                    </div>
                    <div className="mt-8 flex items-center gap-2 text-sm font-medium text-[#14f195] opacity-0 group-hover:opacity-100 transition-opacity">
                      Get started <ArrowRight className="w-4 h-4" />
                    </div>
                  </div>
                </Link>
              </TiltedCard>
            </div>
          </AnimatedContent>
        </section>

        {/* Marquee */}
        <section className="pb-16 md:pb-24">
          <Marquee speed={25} pauseOnHover className="py-4 text-white/20 text-sm font-medium tracking-widest uppercase">
            <span>Protocol Revenue: <span className="text-[#14f195]/40">$2.4M+</span></span>
            <span className="text-[#14f195]/30">&#x2022;</span>
            <span>Active Agents: <span className="text-[#14f195]/40">847</span></span>
            <span className="text-[#14f195]/30">&#x2022;</span>
            <span>TVL: <span className="text-[#14f195]/40">$12M+</span></span>
            <span className="text-[#14f195]/30">&#x2022;</span>
            <span>Avg APY: <span className="text-[#14f195]/40">12.4%</span></span>
            <span className="text-[#14f195]/30">&#x2022;</span>
            <span>Loans Originated: <span className="text-[#14f195]/40">$8.2M+</span></span>
            <span className="text-[#14f195]/30">&#x2022;</span>
            <span>Avg Credit Score: <span className="text-[#14f195]/40">782</span></span>
            <span className="text-[#14f195]/30">&#x2022;</span>
            <span>Default Rate: <span className="text-[#14f195]/40">2.1%</span></span>
            <span className="text-[#14f195]/30">&#x2022;</span>
            <span>Protocol Revenue: <span className="text-[#14f195]/40">$2.4M+</span></span>
            <span className="text-[#14f195]/30">&#x2022;</span>
            <span>Active Agents: <span className="text-[#14f195]/40">847</span></span>
            <span className="text-[#14f195]/30">&#x2022;</span>
            <span>TVL: <span className="text-[#14f195]/40">$12M+</span></span>
            <span className="text-[#14f195]/30">&#x2022;</span>
            <span>Avg APY: <span className="text-[#14f195]/40">12.4%</span></span>
            <span className="text-[#14f195]/30">&#x2022;</span>
            <span>Loans Originated: <span className="text-[#14f195]/40">$8.2M+</span></span>
            <span className="text-[#14f195]/30">&#x2022;</span>
            <span>Avg Credit Score: <span className="text-[#14f195]/40">782</span></span>
            <span className="text-[#14f195]/30">&#x2022;</span>
            <span>Default Rate: <span className="text-[#14f195]/40">2.1%</span></span>
          </Marquee>
        </section>
      </main>
    </div>
  )
}
