import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { StatCard } from "@/components/shared/StatCard"
import { MOCK_BORROWER } from "@/lib/constants"
import { formatUSD, formatPercent, formatDate } from "@/lib/utils"
import {
  DollarSign,
  TrendingUp,
  Clock,
  ArrowDownToLine,
  Bot,
  Lock,
  CalendarCheck,
  CheckCircle2,
  X,
} from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"

// Animated credit utilization ring
function CreditRing({ value, size = 140, strokeWidth = 12 }: { value: number; size?: number; strokeWidth?: number }) {
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const percent = Math.min(Math.max(value, 0), 100)

  // Color shifts with utilization
  const getColor = (p: number) => {
    if (p > 90) return { gradient: "url(#ring-red)", glow: "rgba(239,68,68,0.3)" }
    if (p > 75) return { gradient: "url(#ring-amber)", glow: "rgba(245,158,11,0.3)" }
    return { gradient: "url(#ring-violet)", glow: "rgba(139,92,246,0.3)" }
  }

  const c = getColor(percent)

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <defs>
          <linearGradient id="ring-violet" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#8b5cf6" />
            <stop offset="100%" stopColor="#a78bfa" />
          </linearGradient>
          <linearGradient id="ring-amber" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#f59e0b" />
            <stop offset="100%" stopColor="#fbbf24" />
          </linearGradient>
          <linearGradient id="ring-red" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#ef4444" />
            <stop offset="100%" stopColor="#f87171" />
          </linearGradient>
        </defs>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgba(139,92,246,0.08)"
          strokeWidth={strokeWidth}
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={c.gradient}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: circumference - (percent / 100) * circumference }}
          transition={{ duration: 1.5, ease: [0.4, 0, 0.2, 1] }}
          style={{ filter: `drop-shadow(0 0 8px ${c.glow})` }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl md:text-3xl font-bold mono-text">{value.toFixed(1)}%</span>
        <span className="text-[10px] text-muted-foreground mono-text">utilized</span>
      </div>
    </div>
  )
}

export default function BorrowPage() {
  const [drawAmount, setDrawAmount] = useState("")
  const [mobileDrawOpen, setMobileDrawOpen] = useState(false)
  const borrower = MOCK_BORROWER
  const utilizationPercent = ((borrower.outstandingDebt / borrower.creditLine) * 100)

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
      className="max-w-4xl mx-auto px-4 md:px-6 py-6 md:py-8"
    >
      {/* Agent Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="flex items-center gap-3 md:gap-4 mb-6 md:mb-8"
      >
        <motion.div
          className="w-10 h-10 md:w-12 md:h-12 rounded-xl bg-gradient-to-br from-violet-500/20 to-purple-600/10 flex items-center justify-center flex-shrink-0"
          whileHover={{ scale: 1.05, rotate: 5 }}
          transition={{ type: "spring", stiffness: 300 }}
        >
          <Bot className="w-5 h-5 md:w-6 md:h-6 text-primary" />
        </motion.div>
        <div className="min-w-0">
          <div className="flex items-center gap-2 md:gap-3 flex-wrap">
            <h1 className="text-lg sm:text-xl md:text-2xl font-bold mono-text truncate">{borrower.agentName}</h1>
            <Badge variant="outline" className="mono-text text-[10px] flex-shrink-0 border-primary/30">{borrower.erc8004Id}</Badge>
          </div>
          <p className="text-xs md:text-sm text-muted-foreground">Agent Credit Dashboard</p>
        </div>
      </motion.div>

      {/* Key Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 mb-6 md:mb-8">
        <StatCard
          label="Credit Line"
          value={formatUSD(borrower.creditLine)}
          icon={DollarSign}
          delay={0}
        />
        <StatCard
          label="Available Credit"
          value={formatUSD(borrower.availableCredit)}
          icon={TrendingUp}
          sublabel={`${((borrower.availableCredit / borrower.creditLine) * 100).toFixed(0)}% free`}
          trend="neutral"
          delay={1}
        />
        <StatCard
          label="Outstanding Debt"
          value={formatUSD(borrower.outstandingDebt)}
          icon={Clock}
          delay={2}
        />
        <StatCard
          label="Interest Rate"
          value={formatPercent(borrower.interestRate)}
          icon={TrendingUp}
          delay={3}
        />
      </div>

      <div className="grid md:grid-cols-5 gap-4 md:gap-6">
        {/* Left Column */}
        <div className="md:col-span-3 space-y-4 md:space-y-6">
          {/* Credit Utilization with animated ring */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
          >
            <Card className="data-card rounded-2xl border-primary/15">
              <CardHeader>
                <CardTitle className="mono-text text-sm">Credit Utilization</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col items-center mb-4">
                  <CreditRing value={utilizationPercent} />
                  <span className="text-[10px] md:text-xs mono-text text-muted-foreground mt-2">
                    {formatUSD(borrower.outstandingDebt)} / {formatUSD(borrower.creditLine)}
                  </span>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* Revenue Lockbox */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.4 }}
          >
            <Card className="data-card rounded-2xl border-primary/15">
              <CardHeader>
                <CardTitle className="mono-text text-sm flex items-center gap-2">
                  <div className="w-6 h-6 rounded-md bg-gradient-to-br from-violet-500/20 to-purple-600/10 flex items-center justify-center">
                    <Lock className="w-3.5 h-3.5 text-primary" />
                  </div>
                  Revenue Lockbox
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-3 md:gap-4 mb-4">
                  <div className="p-3 rounded-lg bg-muted/30 border border-border/50">
                    <div className="text-[10px] md:text-xs text-muted-foreground mono-text mb-1">Total Revenue (30d)</div>
                    <div className="text-lg md:text-xl font-bold mono-text">{formatUSD(borrower.lockboxRevenue)}</div>
                  </div>
                  <div className="p-3 rounded-lg bg-emerald-500/5 border border-emerald-500/10">
                    <div className="text-[10px] md:text-xs text-muted-foreground mono-text mb-1">Current Balance</div>
                    <div className="text-lg md:text-xl font-bold mono-text text-emerald-400">{formatUSD(borrower.lockboxBalance)}</div>
                  </div>
                </div>
                <div className="p-3 rounded-lg bg-primary/5 border border-primary/10 text-xs text-muted-foreground">
                  Revenue flows through the lockbox contract. Lender repayments are automatically deducted before agent withdrawals.
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* Repayment Schedule with connected timeline */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.5 }}
          >
            <Card className="data-card rounded-2xl border-primary/15">
              <CardHeader>
                <CardTitle className="mono-text text-sm flex items-center gap-2">
                  <div className="w-6 h-6 rounded-md bg-gradient-to-br from-violet-500/20 to-purple-600/10 flex items-center justify-center">
                    <CalendarCheck className="w-3.5 h-3.5 text-primary" />
                  </div>
                  Repayment Schedule
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-0">
                  {borrower.repaymentSchedule.map((entry, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.6 + i * 0.08 }}
                      className="flex items-center gap-3 py-3 relative"
                    >
                      {/* Timeline connector */}
                      <div className="flex flex-col items-center flex-shrink-0">
                        <div className={`w-3 h-3 rounded-full border-2 z-10 ${
                          entry.status === "paid"
                            ? "border-emerald-400 bg-emerald-400/20"
                            : "border-amber-400 bg-amber-400/20"
                        }`}>
                          {entry.status === "paid" && (
                            <motion.div
                              className="w-full h-full rounded-full bg-emerald-400"
                              initial={{ scale: 0 }}
                              animate={{ scale: 1 }}
                              transition={{ delay: 0.8 + i * 0.1 }}
                            />
                          )}
                        </div>
                        {i < borrower.repaymentSchedule.length - 1 && (
                          <div className={`w-0.5 h-8 -mb-3 ${
                            entry.status === "paid" ? "bg-emerald-400/30" : "bg-border/50"
                          }`} />
                        )}
                      </div>

                      <div className="flex items-center justify-between flex-1 min-w-0">
                        <div>
                          <div className="text-sm mono-text">{formatDate(entry.date)}</div>
                          <div className={`text-[10px] md:text-xs mono-text capitalize ${
                            entry.status === "paid" ? "text-emerald-400" : "text-amber-400"
                          }`}>
                            {entry.status}
                          </div>
                        </div>
                        <div className="text-right flex-shrink-0 ml-2">
                          <div className="text-sm font-semibold mono-text">{formatUSD(entry.amount)}</div>
                          {entry.status === "paid" && (
                            <div className="text-[10px] md:text-xs text-emerald-400 mono-text flex items-center gap-1 justify-end">
                              <CheckCircle2 className="w-3 h-3" />
                              Done
                            </div>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </div>

        {/* Right Column: Draw Down - desktop only */}
        <div className="hidden md:block md:col-span-2">
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
          >
            <Card className="data-card rounded-2xl border-primary/15 sticky top-24">
              <CardHeader>
                <CardTitle className="mono-text text-sm">Draw Down Credit</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="p-4 rounded-xl bg-gradient-to-br from-violet-500/5 to-purple-500/5 border border-primary/15 text-center">
                  <div className="text-xs text-muted-foreground mono-text mb-1">Available to Borrow</div>
                  <div className="text-2xl font-bold mono-text gradient-text-static">{formatUSD(borrower.availableCredit)}</div>
                </div>

                <div>
                  <label className="text-xs mono-text text-muted-foreground mb-1.5 block">Amount (USDC)</label>
                  <div className="relative">
                    <Input
                      type="number"
                      placeholder="0.00"
                      value={drawAmount}
                      onChange={(e) => setDrawAmount(e.target.value)}
                      className="mono-text pr-16 text-lg h-12 border-primary/15 focus:border-primary/40 transition-colors"
                    />
                    <button
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-primary mono-text font-semibold px-2 py-1 rounded-md hover:bg-primary/10 transition-colors"
                      onClick={() => setDrawAmount(String(borrower.availableCredit))}
                    >
                      MAX
                    </button>
                  </div>
                </div>

                <div className="space-y-2 text-xs mono-text p-3 rounded-xl bg-muted/20 border border-border/30">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Interest Rate</span>
                    <span className="text-foreground">{formatPercent(borrower.interestRate)}</span>
                  </div>
                  <AnimatePresence>
                    {drawAmount && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        className="space-y-2 pt-2 border-t border-border/30"
                      >
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">New Outstanding Debt</span>
                          <span className="text-foreground">
                            {formatUSD(borrower.outstandingDebt + parseFloat(drawAmount || "0"))}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Est. Monthly Payment</span>
                          <span className="text-foreground">
                            {formatUSD((parseFloat(drawAmount || "0") * (1 + borrower.interestRate / 100)) / 12)}
                          </span>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                <Button
                  className="w-full mono-text font-semibold h-11 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 shadow-[0_0_15px_rgba(139,92,246,0.15)] hover:shadow-[0_0_25px_rgba(139,92,246,0.25)] transition-all duration-300"
                  size="lg"
                  disabled={!drawAmount || parseFloat(drawAmount) > borrower.availableCredit}
                >
                  <span className="flex items-center gap-2">
                    <ArrowDownToLine className="w-4 h-4" />
                    Draw Down
                  </span>
                </Button>

                <AnimatePresence>
                  {drawAmount && parseFloat(drawAmount) > borrower.availableCredit && (
                    <motion.p
                      initial={{ opacity: 0, y: -5 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -5 }}
                      className="text-xs text-red-400 mono-text text-center"
                    >
                      Amount exceeds available credit
                    </motion.p>
                  )}
                </AnimatePresence>

                <div className="pt-3 border-t border-border">
                  <div className="text-xs text-muted-foreground mono-text mb-2">Next Payment Due</div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm mono-text font-semibold">{formatUSD(borrower.nextPayment.amount)}</span>
                    <span className="text-xs mono-text text-amber-400 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block animate-pulse" />
                      {formatDate(borrower.nextPayment.dueDate)}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </div>
      </div>

      {/* Mobile: Fixed bottom Draw Down button */}
      <div className="md:hidden">
        {!mobileDrawOpen && (
          <div className="fixed bottom-[calc(env(safe-area-inset-bottom,0px)+4.5rem)] left-0 right-0 z-30 px-4 pb-2">
            <div className="bg-background/80 backdrop-blur-md rounded-2xl p-1">
              <Button
                className="w-full mono-text font-semibold h-14 text-base rounded-xl bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 shadow-[0_0_20px_rgba(139,92,246,0.2)]"
                size="lg"
                onClick={() => setMobileDrawOpen(true)}
              >
                <span className="flex items-center gap-2">
                  <ArrowDownToLine className="w-5 h-5" />
                  Draw Down Credit
                </span>
              </Button>
            </div>
          </div>
        )}

        <AnimatePresence>
          {mobileDrawOpen && (
            <div className="fixed inset-0 z-50 md:hidden">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                onClick={() => setMobileDrawOpen(false)}
              />

              <motion.div
                initial={{ y: "100%" }}
                animate={{ y: 0 }}
                exit={{ y: "100%" }}
                transition={{ type: "spring", damping: 30, stiffness: 300 }}
                className="absolute bottom-0 left-0 right-0 mobile-bottom-sheet bg-card border-t border-primary/15"
              >
                <div className="flex justify-between items-center px-5 pt-2">
                  <span className="text-sm font-semibold mono-text">Draw Down Credit</span>
                  <button
                    onClick={() => setMobileDrawOpen(false)}
                    className="p-2 text-muted-foreground hover:text-foreground min-h-[44px] min-w-[44px] flex items-center justify-center"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="px-5 pb-6 space-y-5">
                  <div className="p-4 rounded-xl bg-gradient-to-br from-violet-500/5 to-purple-500/5 border border-primary/15 text-center">
                    <div className="text-xs text-muted-foreground mono-text mb-1">Available to Borrow</div>
                    <div className="text-3xl font-bold mono-text gradient-text-static">{formatUSD(borrower.availableCredit)}</div>
                  </div>

                  <div>
                    <label className="text-xs mono-text text-muted-foreground mb-2 block">Amount (USDC)</label>
                    <div className="relative">
                      <Input
                        type="number"
                        placeholder="0.00"
                        value={drawAmount}
                        onChange={(e) => setDrawAmount(e.target.value)}
                        className="mono-text pr-16 text-2xl h-16 rounded-xl"
                        inputMode="decimal"
                      />
                      <button
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-primary mono-text font-semibold px-3 py-2 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg hover:bg-primary/10"
                        onClick={() => setDrawAmount(String(borrower.availableCredit))}
                      >
                        MAX
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2 text-xs mono-text p-3 rounded-xl bg-muted/50 border border-border">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Interest Rate</span>
                      <span className="text-foreground">{formatPercent(borrower.interestRate)}</span>
                    </div>
                    {drawAmount && (
                      <>
                        <div className="flex justify-between pt-2 border-t border-border/30">
                          <span className="text-muted-foreground">New Outstanding Debt</span>
                          <span className="text-foreground">
                            {formatUSD(borrower.outstandingDebt + parseFloat(drawAmount || "0"))}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Est. Monthly Payment</span>
                          <span className="text-foreground">
                            {formatUSD((parseFloat(drawAmount || "0") * (1 + borrower.interestRate / 100)) / 12)}
                          </span>
                        </div>
                      </>
                    )}
                  </div>

                  {drawAmount && parseFloat(drawAmount) > borrower.availableCredit && (
                    <p className="text-xs text-red-400 mono-text text-center">
                      Amount exceeds available credit
                    </p>
                  )}

                  <Button
                    className="w-full mono-text font-semibold h-14 text-base rounded-xl bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500"
                    size="lg"
                    disabled={!drawAmount || parseFloat(drawAmount) > borrower.availableCredit}
                  >
                    <span className="flex items-center gap-2">
                      <ArrowDownToLine className="w-5 h-5" />
                      Draw Down
                    </span>
                  </Button>

                  <div className="pt-3 border-t border-border">
                    <div className="text-xs text-muted-foreground mono-text mb-2">Next Payment Due</div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm mono-text font-semibold">{formatUSD(borrower.nextPayment.amount)}</span>
                      <span className="text-xs mono-text text-amber-400">{formatDate(borrower.nextPayment.dueDate)}</span>
                    </div>
                  </div>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  )
}
