import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { StatCard } from "@/components/shared/StatCard"
import { MOCK_POOL_DATA } from "@/lib/constants"
import { formatUSD, formatPercent } from "@/lib/utils"
import { DollarSign, TrendingUp, Shield, Zap, ArrowDownToLine, ArrowUpFromLine, X } from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import type { TrancheType } from "@/lib/types"

function TrancheCard({
  type,
  apy,
  tvl,
  description,
  selected,
  onSelect,
}: {
  type: TrancheType
  apy: number
  tvl: number
  description: string
  selected: boolean
  onSelect: () => void
}) {
  const isSenior = type === "senior"

  return (
    <motion.button
      onClick={onSelect}
      whileHover={{ y: -3 }}
      whileTap={{ scale: 0.98 }}
      transition={{ type: "spring", stiffness: 300 }}
      className={`data-card rounded-2xl p-4 md:p-6 text-left transition-all w-full min-h-[44px] relative ${
        selected ? "glow-border" : "border-primary/10"
      }`}
    >
      {/* Selection indicator */}
      {selected && (
        <motion.div
          layoutId="tranche-selector"
          className="absolute inset-0 rounded-2xl border-2 border-primary/40 pointer-events-none"
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
        />
      )}
      <div className="flex items-center gap-3 mb-3 md:mb-4">
        <div className={`w-9 h-9 md:w-10 md:h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
          isSenior
            ? "bg-gradient-to-br from-blue-500/20 to-blue-600/5"
            : "bg-gradient-to-br from-purple-500/20 to-purple-600/5"
        }`}>
          {isSenior ? (
            <Shield className="w-4 h-4 md:w-5 md:h-5 text-blue-400" />
          ) : (
            <Zap className="w-4 h-4 md:w-5 md:h-5 text-purple-400" />
          )}
        </div>
        <div className="min-w-0">
          <h3 className="font-semibold mono-text capitalize text-sm md:text-base">{type} Tranche</h3>
          <p className="text-[10px] md:text-xs text-muted-foreground truncate">{description}</p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 md:gap-4">
        <div>
          <div className="text-[10px] md:text-xs text-muted-foreground mono-text mb-0.5 md:mb-1">APY</div>
          <div className={`text-lg md:text-xl font-bold mono-text ${isSenior ? "text-blue-400" : "text-purple-400"}`}>
            {formatPercent(apy)}
          </div>
        </div>
        <div>
          <div className="text-[10px] md:text-xs text-muted-foreground mono-text mb-0.5 md:mb-1">TVL</div>
          <div className="text-lg md:text-xl font-bold mono-text text-foreground">{formatUSD(tvl)}</div>
        </div>
      </div>
    </motion.button>
  )
}

export default function LendPage() {
  const [selectedTranche, setSelectedTranche] = useState<TrancheType>("senior")
  const [amount, setAmount] = useState("")
  const [action, setAction] = useState<"deposit" | "withdraw">("deposit")
  const [mobileFormOpen, setMobileFormOpen] = useState(false)

  const pool = MOCK_POOL_DATA
  const currentAPY = selectedTranche === "senior" ? pool.seniorAPY : pool.juniorAPY

  const userPosition = {
    senior: { shares: 12_500, value: 13_200, earned: 700 },
    junior: { shares: 5_000, value: 5_800, earned: 800 },
  }

  const pos = userPosition[selectedTranche]

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
      className="max-w-4xl mx-auto px-4 md:px-6 py-6 md:py-8"
    >
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="mb-6 md:mb-8"
      >
        <h1 className="text-xl sm:text-2xl md:text-3xl font-bold mono-text mb-1.5 md:mb-2">Lend</h1>
        <p className="text-muted-foreground text-xs md:text-sm">Deposit USDC into tranches to earn yield from AI agent repayments</p>
      </motion.div>

      {/* Overview Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 mb-6 md:mb-8">
        <StatCard label="Total TVL" value={formatUSD(pool.tvl)} icon={DollarSign} delay={0} />
        <StatCard label="Senior APY" value={formatPercent(pool.seniorAPY)} icon={TrendingUp} sublabel="Low risk" delay={1} />
        <StatCard label="Junior APY" value={formatPercent(pool.juniorAPY)} icon={TrendingUp} sublabel="Higher risk" delay={2} />
        <StatCard label="Utilization" value={formatPercent(pool.utilizationRate)} icon={DollarSign} delay={3} />
      </div>

      <div className="grid md:grid-cols-5 gap-4 md:gap-6">
        {/* Left: Tranche Selection + Position */}
        <div className="md:col-span-3 space-y-4 md:space-y-6">
          {/* Tranche Selection */}
          <div className="grid grid-cols-2 gap-3 md:gap-4">
            <TrancheCard
              type="senior"
              apy={pool.seniorAPY}
              tvl={pool.tvl * 0.7}
              description="First-loss protection, stable returns"
              selected={selectedTranche === "senior"}
              onSelect={() => setSelectedTranche("senior")}
            />
            <TrancheCard
              type="junior"
              apy={pool.juniorAPY}
              tvl={pool.tvl * 0.3}
              description="Higher yield, absorbs first losses"
              selected={selectedTranche === "junior"}
              onSelect={() => setSelectedTranche("junior")}
            />
          </div>

          {/* Your Position */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
          >
            <Card className="data-card rounded-2xl border-primary/15">
              <CardHeader>
                <CardTitle className="mono-text text-sm">
                  Your {selectedTranche === "senior" ? "Senior" : "Junior"} Position
                </CardTitle>
              </CardHeader>
              <CardContent>
                <AnimatePresence mode="wait">
                  <motion.div
                    key={selectedTranche}
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -5 }}
                    transition={{ duration: 0.2 }}
                    className="grid grid-cols-3 gap-3 md:gap-4"
                  >
                    <div className="p-3 rounded-lg bg-muted/30 border border-border/50">
                      <div className="text-[10px] md:text-xs text-muted-foreground mono-text mb-1">lcUSDC Shares</div>
                      <div className="text-base md:text-lg font-bold mono-text">{formatUSD(pos.shares)}</div>
                    </div>
                    <div className="p-3 rounded-lg bg-muted/30 border border-border/50">
                      <div className="text-[10px] md:text-xs text-muted-foreground mono-text mb-1">Current Value</div>
                      <div className="text-base md:text-lg font-bold mono-text">{formatUSD(pos.value)}</div>
                    </div>
                    <div className="p-3 rounded-lg bg-emerald-500/5 border border-emerald-500/10">
                      <div className="text-[10px] md:text-xs text-muted-foreground mono-text mb-1">Earned</div>
                      <div className="text-base md:text-lg font-bold mono-text text-emerald-400">+{formatUSD(pos.earned)}</div>
                    </div>
                  </motion.div>
                </AnimatePresence>
              </CardContent>
            </Card>
          </motion.div>
        </div>

        {/* Right: Deposit/Withdraw Form - desktop */}
        <div className="hidden md:block md:col-span-2">
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
          >
            <Card className="data-card rounded-2xl border-primary/15 sticky top-24">
              <CardHeader>
                <div className="flex gap-2 w-full p-1 bg-muted/30 rounded-xl">
                  <button
                    onClick={() => setAction("deposit")}
                    className={`flex-1 py-2 rounded-lg text-sm mono-text font-medium transition-all duration-200 ${
                      action === "deposit"
                        ? "bg-gradient-to-r from-violet-600 to-purple-600 text-white shadow-[0_0_15px_rgba(139,92,246,0.2)]"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Deposit
                  </button>
                  <button
                    onClick={() => setAction("withdraw")}
                    className={`flex-1 py-2 rounded-lg text-sm mono-text font-medium transition-all duration-200 ${
                      action === "withdraw"
                        ? "bg-gradient-to-r from-violet-600 to-purple-600 text-white shadow-[0_0_15px_rgba(139,92,246,0.2)]"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Withdraw
                  </button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="text-xs mono-text text-muted-foreground mb-1.5 block">
                    {action === "deposit" ? "Amount (USDC)" : "Shares to withdraw"}
                  </label>
                  <div className="relative">
                    <Input
                      type="number"
                      placeholder="0.00"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      className="mono-text pr-16 text-lg h-12 border-primary/15 focus:border-primary/40 transition-colors"
                    />
                    <button
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-primary mono-text font-semibold hover:underline px-2 py-1 rounded-md hover:bg-primary/10 transition-colors"
                      onClick={() => setAmount(action === "deposit" ? "10000" : String(pos.shares))}
                    >
                      MAX
                    </button>
                  </div>
                </div>

                <div className="space-y-2 text-xs mono-text p-3 rounded-xl bg-muted/20 border border-border/30">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Tranche</span>
                    <span className="text-foreground capitalize">{selectedTranche}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Current APY</span>
                    <span className="text-primary">{formatPercent(currentAPY)}</span>
                  </div>
                  <AnimatePresence>
                    {action === "deposit" && amount && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        className="flex justify-between pt-2 border-t border-border/30"
                      >
                        <span className="text-muted-foreground">Est. Annual Yield</span>
                        <span className="text-emerald-400 font-semibold">
                          +{formatUSD(parseFloat(amount || "0") * (currentAPY / 100))}
                        </span>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                <Button className="w-full mono-text font-semibold h-11 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 shadow-[0_0_15px_rgba(139,92,246,0.15)] hover:shadow-[0_0_25px_rgba(139,92,246,0.25)] transition-all duration-300" size="lg">
                  {action === "deposit" ? (
                    <span className="flex items-center gap-2">
                      <ArrowDownToLine className="w-4 h-4" />
                      Deposit USDC
                    </span>
                  ) : (
                    <span className="flex items-center gap-2">
                      <ArrowUpFromLine className="w-4 h-4" />
                      Withdraw
                    </span>
                  )}
                </Button>
              </CardContent>
            </Card>
          </motion.div>
        </div>
      </div>

      {/* Mobile: Sticky bottom CTA to open deposit form */}
      <div className="md:hidden">
        {!mobileFormOpen && (
          <div className="fixed bottom-[calc(env(safe-area-inset-bottom,0px)+4.5rem)] left-0 right-0 z-30 px-4 pb-2">
            <div className="bg-background/80 backdrop-blur-md rounded-2xl p-1">
              <Button
                className="w-full mono-text font-semibold h-14 text-base rounded-xl bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 shadow-[0_0_20px_rgba(139,92,246,0.2)]"
                size="lg"
                onClick={() => setMobileFormOpen(true)}
              >
                <span className="flex items-center gap-2">
                  <ArrowDownToLine className="w-5 h-5" />
                  Deposit / Withdraw
                </span>
              </Button>
            </div>
          </div>
        )}

        {/* Mobile bottom sheet form */}
        <AnimatePresence>
          {mobileFormOpen && (
            <div className="fixed inset-0 z-50 md:hidden">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                onClick={() => setMobileFormOpen(false)}
              />

              <motion.div
                initial={{ y: "100%" }}
                animate={{ y: 0 }}
                exit={{ y: "100%" }}
                transition={{ type: "spring", damping: 30, stiffness: 300 }}
                className="absolute bottom-0 left-0 right-0 mobile-bottom-sheet bg-card border-t border-primary/15"
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
                  <div className="flex gap-2 w-full p-1 bg-muted/30 rounded-xl">
                    <button
                      onClick={() => setAction("deposit")}
                      className={`flex-1 py-3 rounded-xl text-sm mono-text font-medium transition-all min-h-[44px] ${
                        action === "deposit"
                          ? "bg-gradient-to-r from-violet-600 to-purple-600 text-white"
                          : "text-muted-foreground"
                      }`}
                    >
                      Deposit
                    </button>
                    <button
                      onClick={() => setAction("withdraw")}
                      className={`flex-1 py-3 rounded-xl text-sm mono-text font-medium transition-all min-h-[44px] ${
                        action === "withdraw"
                          ? "bg-gradient-to-r from-violet-600 to-purple-600 text-white"
                          : "text-muted-foreground"
                      }`}
                    >
                      Withdraw
                    </button>
                  </div>

                  <div>
                    <label className="text-xs mono-text text-muted-foreground mb-2 block">
                      {action === "deposit" ? "Amount (USDC)" : "Shares to withdraw"}
                    </label>
                    <div className="relative">
                      <Input
                        type="number"
                        placeholder="0.00"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        className="mono-text pr-16 text-2xl h-16 rounded-xl"
                        inputMode="decimal"
                      />
                      <button
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-primary mono-text font-semibold px-3 py-2 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg hover:bg-primary/10"
                        onClick={() => setAmount(action === "deposit" ? "10000" : String(pos.shares))}
                      >
                        MAX
                      </button>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={() => setSelectedTranche("senior")}
                      className={`flex-1 py-3 px-4 rounded-xl text-sm mono-text font-medium transition-all flex items-center justify-center gap-2 min-h-[44px] ${
                        selectedTranche === "senior"
                          ? "bg-blue-500/10 border border-blue-500/30 text-blue-400"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      <Shield className="w-4 h-4" />
                      Senior
                    </button>
                    <button
                      onClick={() => setSelectedTranche("junior")}
                      className={`flex-1 py-3 px-4 rounded-xl text-sm mono-text font-medium transition-all flex items-center justify-center gap-2 min-h-[44px] ${
                        selectedTranche === "junior"
                          ? "bg-purple-500/10 border border-purple-500/30 text-purple-400"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      <Zap className="w-4 h-4" />
                      Junior
                    </button>
                  </div>

                  <div className="space-y-2 text-xs mono-text p-3 rounded-xl bg-muted/50 border border-border">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Tranche</span>
                      <span className="text-foreground capitalize">{selectedTranche}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Current APY</span>
                      <span className="text-primary">{formatPercent(currentAPY)}</span>
                    </div>
                    {action === "deposit" && amount && (
                      <div className="flex justify-between pt-2 border-t border-border/30">
                        <span className="text-muted-foreground">Est. Annual Yield</span>
                        <span className="text-emerald-400 font-semibold">
                          +{formatUSD(parseFloat(amount || "0") * (currentAPY / 100))}
                        </span>
                      </div>
                    )}
                  </div>

                  <Button className="w-full mono-text font-semibold h-14 text-base rounded-xl bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500" size="lg">
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
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  )
}
