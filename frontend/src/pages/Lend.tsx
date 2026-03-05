import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { StatCard } from "@/components/shared/StatCard"
import { MOCK_POOL_DATA } from "@/lib/constants"
import { formatUSD, formatPercent } from "@/lib/utils"
import { DollarSign, TrendingUp, ArrowDownToLine, ArrowUpFromLine, X } from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import { SpotlightCard } from "@/components/reactbits/SpotlightCard"
import { Magnet } from "@/components/reactbits/Magnet"
import { ClickSpark } from "@/components/reactbits/ClickSpark"
import { SpotlightButton } from "@/components/reactbits/SpotlightButton"
import { BorderBeam } from "@/components/reactbits/BorderBeam"

export default function LendPage() {
  const [amount, setAmount] = useState("")
  const [action, setAction] = useState<"deposit" | "withdraw">("deposit")
  const [mobileFormOpen, setMobileFormOpen] = useState(false)

  const pool = MOCK_POOL_DATA

  const userPosition = {
    shares: 17_500,
    value: 19_000,
    earned: 1_500,
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="max-w-5xl mx-auto px-6 py-8 md:py-12"
    >
      <div className="mb-8 md:mb-10">
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight mb-1 text-foreground">Lend</h1>
        <p className="text-muted-foreground text-sm">Deposit USDC into the lending pool to earn yield from AI agent repayments</p>
      </div>

      {/* Overview Stats */}
      <div className="grid grid-cols-3 gap-3 md:gap-4 mb-8 md:mb-10">
        <StatCard label="Total TVL" value={formatUSD(pool.tvl)} icon={DollarSign} delay={0} />
        <StatCard label="Pool APY" value={formatPercent(pool.apy)} icon={TrendingUp} delay={1} />
        <StatCard label="Utilization" value={formatPercent(pool.utilizationRate)} icon={DollarSign} delay={2} />
      </div>

      <div className="grid md:grid-cols-5 gap-6">
        {/* Left: Position */}
        <div className="md:col-span-3">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: 0.15 }}
            className="border border-border bg-card rounded-xl p-6"
          >
            <h3 className="text-sm font-medium mb-5 text-foreground">Your Position</h3>
            <div className="grid grid-cols-3 gap-3">
              <div className="p-3 rounded-lg bg-muted">
                <div className="text-[10px] text-muted-foreground mb-1 uppercase tracking-wider">lcUSDC Shares</div>
                <div className="text-lg font-semibold mono-text text-foreground">{formatUSD(userPosition.shares)}</div>
              </div>
              <div className="p-3 rounded-lg bg-muted">
                <div className="text-[10px] text-muted-foreground mb-1 uppercase tracking-wider">Current Value</div>
                <div className="text-lg font-semibold mono-text text-foreground">{formatUSD(userPosition.value)}</div>
              </div>
              <div className="p-3 rounded-lg bg-primary/[0.06] border border-primary/10">
                <div className="text-[10px] text-muted-foreground mb-1 uppercase tracking-wider">Earned</div>
                <div className="text-lg font-semibold mono-text text-primary">+{formatUSD(userPosition.earned)}</div>
              </div>
            </div>
          </motion.div>
        </div>

        {/* Right: Deposit/Withdraw Form -- desktop */}
        <div className="hidden md:block md:col-span-2">
          <BorderBeam duration={8}>
          <SpotlightCard className="p-6 sticky top-24">
            <div className="flex gap-1 w-full p-1 bg-muted rounded-lg mb-5">
              <button
                onClick={() => setAction("deposit")}
                className={`flex-1 py-2 rounded-md text-sm font-medium transition-all ${
                  action === "deposit"
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Deposit
              </button>
              <button
                onClick={() => setAction("withdraw")}
                className={`flex-1 py-2 rounded-md text-sm font-medium transition-all ${
                  action === "withdraw"
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Withdraw
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-[10px] text-muted-foreground mb-1.5 block uppercase tracking-wider">
                  {action === "deposit" ? "Amount (USDC)" : "Shares to withdraw"}
                </label>
                <div className="relative">
                  <Input
                    type="number"
                    placeholder="0.00"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="pr-16 text-lg h-12 mono-text"
                  />
                  <button
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-primary font-semibold hover:text-primary/70 px-2 py-1 transition-colors duration-200"
                    onClick={() => setAmount(action === "deposit" ? "10000" : String(userPosition.shares))}
                  >
                    MAX
                  </button>
                </div>
              </div>

              <div className="space-y-2 text-sm p-3 rounded-lg bg-muted">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Current APY</span>
                  <span className="font-medium mono-text text-foreground">{formatPercent(pool.apy)}</span>
                </div>
                <AnimatePresence>
                  {action === "deposit" && amount && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="flex justify-between pt-2 border-t border-border"
                    >
                      <span className="text-muted-foreground">Est. Annual Yield</span>
                      <span className="text-primary font-medium mono-text">
                        +{formatUSD(parseFloat(amount || "0") * (pool.apy / 100))}
                      </span>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <Magnet strength={0.15}>
                <ClickSpark>
                  <SpotlightButton className="w-full font-semibold h-11 px-4 py-2.5 bg-primary text-primary-foreground hover:opacity-90 rounded-lg cursor-pointer text-sm">
                    {action === "deposit" ? (
                      <span className="flex items-center justify-center gap-2">
                        <ArrowDownToLine className="w-4 h-4" />
                        Deposit USDC
                      </span>
                    ) : (
                      <span className="flex items-center justify-center gap-2">
                        <ArrowUpFromLine className="w-4 h-4" />
                        Withdraw
                      </span>
                    )}
                  </SpotlightButton>
                </ClickSpark>
              </Magnet>
            </div>
          </SpotlightCard>
          </BorderBeam>
        </div>
      </div>

      {/* Mobile: Sticky bottom CTA */}
      <div className="md:hidden">
        {!mobileFormOpen && (
          <div className="fixed bottom-[calc(env(safe-area-inset-bottom,0px)+4.5rem)] left-0 right-0 z-30 px-4 pb-2">
            <Button
              className="w-full font-semibold h-14 text-base rounded-xl"
              size="lg"
              onClick={() => setMobileFormOpen(true)}
            >
              <span className="flex items-center gap-2">
                <ArrowDownToLine className="w-5 h-5" />
                Deposit / Withdraw
              </span>
            </Button>
          </div>
        )}

        <AnimatePresence>
          {mobileFormOpen && (
            <div className="fixed inset-0 z-50 md:hidden">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 bg-foreground/20 dark:bg-black/60"
                onClick={() => setMobileFormOpen(false)}
              />
              <motion.div
                initial={{ y: "100%" }}
                animate={{ y: 0 }}
                exit={{ y: "100%" }}
                transition={{ type: "spring", damping: 30, stiffness: 300 }}
                className="absolute bottom-0 left-0 right-0 mobile-bottom-sheet bg-background border-t border-border"
              >
                <div className="flex justify-end px-4 pt-2">
                  <button
                    onClick={() => setMobileFormOpen(false)}
                    className="p-2 text-muted-foreground hover:text-foreground min-h-[44px] min-w-[44px] flex items-center justify-center"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="px-5 pb-6 space-y-5">
                  <div className="flex gap-1 w-full p-1 bg-muted rounded-lg">
                    <button
                      onClick={() => setAction("deposit")}
                      className={`flex-1 py-3 rounded-lg text-sm font-medium transition-all min-h-[44px] ${
                        action === "deposit"
                          ? "bg-primary text-primary-foreground shadow-sm"
                          : "text-muted-foreground"
                      }`}
                    >
                      Deposit
                    </button>
                    <button
                      onClick={() => setAction("withdraw")}
                      className={`flex-1 py-3 rounded-lg text-sm font-medium transition-all min-h-[44px] ${
                        action === "withdraw"
                          ? "bg-primary text-primary-foreground shadow-sm"
                          : "text-muted-foreground"
                      }`}
                    >
                      Withdraw
                    </button>
                  </div>

                  <div>
                    <label className="text-[10px] text-muted-foreground mb-2 block uppercase tracking-wider">
                      {action === "deposit" ? "Amount (USDC)" : "Shares to withdraw"}
                    </label>
                    <div className="relative">
                      <Input
                        type="number"
                        placeholder="0.00"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        className="pr-16 text-2xl h-16 rounded-xl mono-text"
                        inputMode="decimal"
                      />
                      <button
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-primary font-semibold px-3 py-2 min-h-[44px] min-w-[44px] flex items-center justify-center hover:text-primary/70 transition-colors duration-200"
                        onClick={() => setAmount(action === "deposit" ? "10000" : String(userPosition.shares))}
                      >
                        MAX
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2 text-sm p-3 rounded-lg bg-muted">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Current APY</span>
                      <span className="font-medium mono-text text-foreground">{formatPercent(pool.apy)}</span>
                    </div>
                    {action === "deposit" && amount && (
                      <div className="flex justify-between pt-2 border-t border-border">
                        <span className="text-muted-foreground">Est. Annual Yield</span>
                        <span className="text-primary font-medium mono-text">
                          +{formatUSD(parseFloat(amount || "0") * (pool.apy / 100))}
                        </span>
                      </div>
                    )}
                  </div>

                  <ClickSpark>
                    <Button className="w-full font-semibold h-14 text-base rounded-xl" size="lg">
                      {action === "deposit" ? (
                        <span className="flex items-center gap-2">
                          <ArrowDownToLine className="w-5 h-5" />
                          Deposit USDC
                        </span>
                      ) : (
                        <span className="flex items-center gap-2">
                          <ArrowUpFromLine className="w-5 h-5" />
                          Withdraw
                        </span>
                      )}
                    </Button>
                  </ClickSpark>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  )
}
