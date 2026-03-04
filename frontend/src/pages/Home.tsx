import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { ArrowRight, Bot, Shield, Zap, TrendingUp, Lock, Globe } from "lucide-react"
import { Link } from "react-router-dom"
import { motion } from "framer-motion"
import { MOCK_POOL_DATA } from "@/lib/constants"
import { formatUSD, formatCompact } from "@/lib/utils"

const fadeUp = {
  initial: { opacity: 0, y: 30 },
  animate: { opacity: 1, y: 0 },
}

const staggerContainer = {
  animate: {
    transition: {
      staggerChildren: 0.1,
    },
  },
}

export default function Home() {
  return (
    <div>
      <main className="max-w-5xl mx-auto px-4 md:px-6 relative z-10 pb-12">
        {/* Hero */}
        <section className="w-full flex flex-col items-center text-center min-h-[calc(100vh-4rem)] md:min-h-[calc(100vh)] justify-center pb-12 md:pb-20 hero-glow">
          {/* Floating orbs background */}
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            <motion.div
              className="absolute top-1/4 left-1/4 w-64 h-64 rounded-full bg-violet-600/5 blur-3xl"
              animate={{ x: [0, 30, 0], y: [0, -20, 0] }}
              transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
            />
            <motion.div
              className="absolute bottom-1/3 right-1/4 w-80 h-80 rounded-full bg-purple-500/5 blur-3xl"
              animate={{ x: [0, -20, 0], y: [0, 30, 0] }}
              transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
            />
          </div>

          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6 }}
            className="inline-flex items-center gap-2 px-3 md:px-4 py-1.5 rounded-full border border-primary/30 bg-primary/5 mb-6 md:mb-8 relative z-10"
          >
            <motion.div
              animate={{ rotate: [0, 360] }}
              transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
            >
              <Bot className="w-3.5 h-3.5 md:w-4 md:h-4 text-primary" />
            </motion.div>
            <span className="text-[10px] md:text-xs mono-text text-primary tracking-wider">AI AGENT LENDING PROTOCOL</span>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.1 }}
            className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-extrabold text-foreground mb-4 md:mb-6 tracking-tight leading-tight px-2 relative z-10"
            style={{ letterSpacing: "-0.02em" }}
          >
            Credit Infrastructure for{" "}
            <span className="gradient-text">AI Agents</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.2 }}
            className="text-base md:text-lg lg:text-xl text-muted-foreground mb-8 md:mb-10 max-w-2xl leading-relaxed px-2 relative z-10"
          >
            Revenue-backed credit lines for autonomous AI agents.
            Powered by ERC-8004 identity, TEE attestations, and on-chain revenue lockboxes.
          </motion.p>

          {/* CTAs */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.3 }}
            className="flex flex-col sm:flex-row gap-3 sm:gap-4 mb-12 md:mb-16 w-full sm:w-auto px-2 sm:px-0 relative z-10"
          >
            <Button asChild size="xl" className="mono-text tracking-wide font-bold rounded-2xl px-8 w-full sm:w-auto min-h-[52px] bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 shadow-[0_0_20px_rgba(139,92,246,0.3)] hover:shadow-[0_0_30px_rgba(139,92,246,0.4)] transition-all duration-300">
              <Link to="/lend" className="flex items-center justify-center gap-2">
                <span>Deposit USDC</span>
                <motion.div
                  animate={{ x: [0, 4, 0] }}
                  transition={{ duration: 1.5, repeat: Infinity }}
                >
                  <ArrowRight className="w-5 h-5" />
                </motion.div>
              </Link>
            </Button>
            <Button asChild variant="outline" size="xl" className="mono-text tracking-wide rounded-2xl px-8 border-primary/30 hover:border-primary/60 hover:bg-primary/5 w-full sm:w-auto min-h-[52px] transition-all duration-300">
              <Link to="/agents/onboard" className="flex items-center justify-center gap-2">
                <Bot className="w-5 h-5" />
                <span>Register Agent</span>
              </Link>
            </Button>
          </motion.div>

          {/* Live Stats Bar */}
          <motion.div
            variants={staggerContainer}
            initial="initial"
            animate="animate"
            className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 w-full max-w-3xl relative z-10"
          >
            {[
              { label: "TVL", value: formatUSD(MOCK_POOL_DATA.tvl) },
              { label: "Active Agents", value: formatCompact(MOCK_POOL_DATA.activeAgents) },
              { label: "Senior APY", value: `${MOCK_POOL_DATA.seniorAPY}%` },
              { label: "Revenue Generated", value: formatUSD(MOCK_POOL_DATA.totalRevenue) },
            ].map((stat, i) => (
              <motion.div
                key={stat.label}
                variants={fadeUp}
                transition={{ duration: 0.5, delay: 0.4 + i * 0.1 }}
                whileHover={{ y: -4, transition: { duration: 0.2 } }}
                className="data-card rounded-xl p-3 md:p-4 text-center cursor-default"
              >
                <div className="text-[10px] md:text-xs mono-text text-muted-foreground uppercase tracking-wider mb-1">{stat.label}</div>
                <div className="text-lg md:text-xl font-bold mono-text text-foreground">{stat.value}</div>
              </motion.div>
            ))}
          </motion.div>
        </section>

        {/* How It Works */}
        <section className="w-full min-h-[60vh] md:min-h-[80vh] flex items-center">
          <div className="w-full border-t border-primary/10 pt-12 md:pt-16">
            <motion.h2
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-100px" }}
              transition={{ duration: 0.6 }}
              className="text-xl sm:text-2xl md:text-3xl font-bold text-center mb-3 md:mb-4"
            >
              How Lenclaw Works
            </motion.h2>
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-100px" }}
              transition={{ duration: 0.6, delay: 0.1 }}
              className="text-center text-muted-foreground mb-8 md:mb-12 max-w-xl mx-auto text-sm md:text-base px-2"
            >
              A two-sided marketplace connecting capital providers with revenue-generating AI agents
            </motion.p>

            {/* Feature cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6 mb-12 md:mb-16">
              {[
                {
                  icon: Shield,
                  title: "Agent Identity",
                  desc: "AI agents register with ERC-8004 on-chain identity, TEE attestation, and verified code hashes for trustless operation.",
                  gradient: "from-blue-500/20 to-violet-500/10",
                },
                {
                  icon: Lock,
                  title: "Revenue Lockbox",
                  desc: "Agent revenue flows through a smart contract lockbox, ensuring lenders have priority claims on cash flows.",
                  gradient: "from-violet-500/20 to-purple-500/10",
                },
                {
                  icon: TrendingUp,
                  title: "Credit Lines",
                  desc: "Agents receive credit lines proportional to their reputation score and historical revenue performance.",
                  gradient: "from-purple-500/20 to-pink-500/10",
                },
              ].map((item, i) => (
                <motion.div
                  key={item.title}
                  initial={{ opacity: 0, y: 30 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-50px" }}
                  transition={{ duration: 0.5, delay: i * 0.15 }}
                >
                  <Card className="data-card p-5 md:p-6 rounded-2xl border-primary/15 h-full card-shine">
                    <div className="flex items-start gap-4 md:block">
                      <motion.div
                        className={`w-11 h-11 md:w-12 md:h-12 rounded-xl bg-gradient-to-br ${item.gradient} flex items-center justify-center flex-shrink-0 md:mb-4`}
                        whileHover={{ scale: 1.1, rotate: 5 }}
                        transition={{ type: "spring", stiffness: 300 }}
                      >
                        <item.icon className="w-5 h-5 md:w-6 md:h-6 text-primary" />
                      </motion.div>
                      <div>
                        <h3 className="text-base md:text-lg font-semibold mb-1.5 md:mb-2">{item.title}</h3>
                        <p className="text-sm text-muted-foreground leading-relaxed">{item.desc}</p>
                      </div>
                    </div>
                  </Card>
                </motion.div>
              ))}
            </div>

            {/* Lend/Borrow Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-8">
              <motion.div
                initial={{ opacity: 0, x: -30 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true, margin: "-50px" }}
                transition={{ duration: 0.6 }}
              >
                <Link to="/lend" className="block group">
                  <Card className="data-card p-6 md:p-8 rounded-2xl border-primary/15 h-full relative overflow-hidden">
                    <div className="absolute inset-0 bg-gradient-to-br from-violet-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                    <div className="relative z-10">
                      <div className="flex items-center mb-4 md:mb-6">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500/20 to-purple-600/10 flex items-center justify-center mr-3">
                          <Zap className="w-5 h-5 text-primary" />
                        </div>
                        <h3 className="text-lg md:text-xl font-bold mono-text">For Lenders</h3>
                        <motion.div
                          className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity"
                          animate={{ x: [0, 4, 0] }}
                          transition={{ duration: 1.5, repeat: Infinity }}
                        >
                          <ArrowRight className="w-5 h-5 text-primary" />
                        </motion.div>
                      </div>
                      <p className="text-muted-foreground text-sm leading-relaxed mb-4 md:mb-6">
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
                    </div>
                  </Card>
                </Link>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, x: 30 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true, margin: "-50px" }}
                transition={{ duration: 0.6 }}
              >
                <Link to="/borrow" className="block group">
                  <Card className="data-card p-6 md:p-8 rounded-2xl border-primary/15 h-full relative overflow-hidden">
                    <div className="absolute inset-0 bg-gradient-to-br from-purple-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                    <div className="relative z-10">
                      <div className="flex items-center mb-4 md:mb-6">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500/20 to-pink-600/10 flex items-center justify-center mr-3">
                          <Globe className="w-5 h-5 text-primary" />
                        </div>
                        <h3 className="text-lg md:text-xl font-bold mono-text">For AI Agents</h3>
                        <motion.div
                          className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity"
                          animate={{ x: [0, 4, 0] }}
                          transition={{ duration: 1.5, repeat: Infinity }}
                        >
                          <ArrowRight className="w-5 h-5 text-primary" />
                        </motion.div>
                      </div>
                      <p className="text-muted-foreground text-sm leading-relaxed mb-4 md:mb-6">
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
                    </div>
                  </Card>
                </Link>
              </motion.div>
            </div>
          </div>
        </section>
      </main>
    </div>
  )
}
