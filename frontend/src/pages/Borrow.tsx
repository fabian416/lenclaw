import { useState } from "react"
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
import { SpotlightCard } from "@/components/reactbits/SpotlightCard"
import { Magnet } from "@/components/reactbits/Magnet"
import { ClickSpark } from "@/components/reactbits/ClickSpark"
import { SpotlightButton } from "@/components/reactbits/SpotlightButton"
import { BorderBeam } from "@/components/reactbits/BorderBeam"
import { TextScramble } from "@/components/reactbits/TextScramble"

function CreditRing({ value, size = 120, strokeWidth = 8 }: { value: number; size?: number; strokeWidth?: number }) {
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const percent = Math.min(Math.max(value, 0), 100)

  const getStrokeColor = (p: number) => {
    if (p > 90) return "var(--destructive)"
    if (p > 75) return "var(--warning)"
    return "var(--primary)"
  }

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="currentColor" className="text-border" strokeWidth={strokeWidth} />
        <motion.circle
          cx={size / 2} cy={size / 2} r={radius} fill="none"
          stroke={getStrokeColor(percent)}
          strokeWidth={strokeWidth} strokeLinecap="round" strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: circumference - (percent / 100) * circumference }}
          transition={{ duration: 1, ease: [0.4, 0, 0.2, 1] }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-bold mono-text text-foreground">{value.toFixed(1)}%</span>
        <span className="text-[10px] text-muted-foreground">utilized</span>
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
      transition={{ duration: 0.3 }}
      className="max-w-5xl mx-auto px-6 py-8 md:py-12"
    >
      {/* Agent Header */}
      <div className="flex items-center gap-3 mb-8 md:mb-10">
        <div className="w-10 h-10 rounded-full bg-muted border border-primary/20 flex items-center justify-center flex-shrink-0">
          <Bot className="w-5 h-5 text-primary/60" />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl md:text-2xl font-bold tracking-tight truncate text-foreground">{borrower.agentName}</h1>
            <Badge variant="outline" className="text-[10px] flex-shrink-0"><TextScramble text={borrower.erc8004Id} trigger="hover" speed={40} /></Badge>
          </div>
          <p className="text-sm text-muted-foreground">Agent Credit Dashboard</p>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 mb-8 md:mb-10">
        <StatCard label="Credit Line" value={formatUSD(borrower.creditLine)} icon={DollarSign} delay={0} />
        <StatCard label="Available Credit" value={formatUSD(borrower.availableCredit)} icon={TrendingUp} sublabel={`${((borrower.availableCredit / borrower.creditLine) * 100).toFixed(0)}% free`} trend="neutral" delay={1} />
        <StatCard label="Outstanding Debt" value={formatUSD(borrower.outstandingDebt)} icon={Clock} delay={2} />
        <StatCard label="Interest Rate" value={formatPercent(borrower.interestRate)} icon={TrendingUp} delay={3} />
      </div>

      <div className="grid md:grid-cols-5 gap-6">
        {/* Left Column */}
        <div className="md:col-span-3 space-y-6">
          {/* Credit Utilization */}
          <BorderBeam duration={8}>
            <div className="border border-border bg-card rounded-xl p-6">
              <h3 className="text-sm font-medium mb-5 text-foreground">Credit Utilization</h3>
              <div className="flex flex-col items-center">
                <CreditRing value={utilizationPercent} />
                <span className="text-xs mono-text text-muted-foreground mt-3">
                  {formatUSD(borrower.outstandingDebt)} / {formatUSD(borrower.creditLine)}
                </span>
              </div>
            </div>
          </BorderBeam>

          {/* Revenue Lockbox */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: 0.2 }}
            className="border border-border bg-card rounded-xl p-6"
          >
            <div className="flex items-center gap-2 mb-5">
              <Lock className="w-4 h-4 text-primary/50" />
              <h3 className="text-sm font-medium text-foreground">Revenue Lockbox</h3>
            </div>
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="p-3 rounded-lg bg-muted">
                <div className="text-[10px] text-muted-foreground mb-1 uppercase tracking-wider">Total Revenue (30d)</div>
                <div className="text-lg font-semibold mono-text text-foreground">{formatUSD(borrower.lockboxRevenue)}</div>
              </div>
              <div className="p-3 rounded-lg bg-primary/[0.06] border border-primary/10">
                <div className="text-[10px] text-muted-foreground mb-1 uppercase tracking-wider">Current Balance</div>
                <div className="text-lg font-semibold mono-text text-primary">{formatUSD(borrower.lockboxBalance)}</div>
              </div>
            </div>
            <p className="text-xs text-muted-foreground p-3 rounded-lg bg-muted border border-border">
              Revenue flows through the lockbox contract. Lender repayments are automatically deducted before agent withdrawals.
            </p>
          </motion.div>

          {/* Repayment Schedule */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: 0.25 }}
            className="border border-border bg-card rounded-xl p-6"
          >
            <div className="flex items-center gap-2 mb-5">
              <CalendarCheck className="w-4 h-4 text-primary/50" />
              <h3 className="text-sm font-medium text-foreground">Repayment Schedule</h3>
            </div>
            <div className="space-y-0 divide-y divide-border">
              {borrower.repaymentSchedule.map((entry, i) => (
                <div key={i} className="flex items-center justify-between py-3 hover:bg-muted -mx-2 px-2 rounded-lg transition-colors duration-200">
                  <div className="flex items-center gap-3">
                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                      entry.status === "paid" ? "bg-primary" : "bg-warning"
                    }`} />
                    <div>
                      <div className="text-sm text-foreground">{formatDate(entry.date)}</div>
                      <div className={`text-xs capitalize ${
                        entry.status === "paid" ? "text-primary" : "text-warning"
                      }`}>
                        {entry.status}
                      </div>
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0 ml-3">
                    <div className="text-sm font-medium mono-text text-foreground">{formatUSD(entry.amount)}</div>
                    {entry.status === "paid" && (
                      <div className="text-xs text-primary flex items-center gap-1 justify-end">
                        <CheckCircle2 className="w-3 h-3" />
                        Done
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        </div>

        {/* Right Column: Draw Down -- desktop */}
        <div className="hidden md:block md:col-span-2">
          <SpotlightCard className="p-6 sticky top-24">
            <h3 className="text-sm font-medium mb-5 text-foreground">Draw Down Credit</h3>
            <div className="space-y-4">
              <div className="p-4 rounded-lg bg-muted text-center">
                <div className="text-[10px] text-muted-foreground mb-1 uppercase tracking-wider">Available to Borrow</div>
                <div className="text-2xl font-bold mono-text text-foreground">{formatUSD(borrower.availableCredit)}</div>
              </div>

              <div>
                <label className="text-[10px] text-muted-foreground mb-1.5 block uppercase tracking-wider">Amount (USDC)</label>
                <div className="relative">
                  <Input
                    type="number"
                    placeholder="0.00"
                    value={drawAmount}
                    onChange={(e) => setDrawAmount(e.target.value)}
                    className="pr-16 text-lg h-12 mono-text"
                  />
                  <button
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-primary font-semibold px-2 py-1 hover:text-primary/70 transition-colors duration-200"
                    onClick={() => setDrawAmount(String(borrower.availableCredit))}
                  >
                    MAX
                  </button>
                </div>
              </div>

              <div className="space-y-2 text-sm p-3 rounded-lg bg-muted">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Interest Rate</span>
                  <span className="font-medium mono-text text-foreground">{formatPercent(borrower.interestRate)}</span>
                </div>
                <AnimatePresence>
                  {drawAmount && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="space-y-2 pt-2 border-t border-border"
                    >
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">New Outstanding Debt</span>
                        <span className="font-medium mono-text text-foreground">{formatUSD(borrower.outstandingDebt + parseFloat(drawAmount || "0"))}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Est. Monthly Payment</span>
                        <span className="font-medium mono-text text-foreground">{formatUSD((parseFloat(drawAmount || "0") * (1 + borrower.interestRate / 100)) / 12)}</span>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <Magnet strength={0.15}>
                <ClickSpark>
                  <SpotlightButton
                    className={`w-full font-semibold h-11 px-4 py-2.5 bg-primary text-primary-foreground hover:opacity-90 rounded-lg cursor-pointer text-sm ${
                      !drawAmount || parseFloat(drawAmount) > borrower.availableCredit ? "opacity-50 pointer-events-none" : ""
                    }`}
                  >
                    <span className="flex items-center justify-center gap-2">
                      <ArrowDownToLine className="w-4 h-4" />
                      Draw Down
                    </span>
                  </SpotlightButton>
                </ClickSpark>
              </Magnet>

              {drawAmount && parseFloat(drawAmount) > borrower.availableCredit && (
                <p className="text-xs text-destructive text-center">Amount exceeds available credit</p>
              )}

              <div className="pt-4 border-t border-border">
                <div className="text-[10px] text-muted-foreground mb-2 uppercase tracking-wider">Next Payment Due</div>
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium mono-text text-foreground">{formatUSD(borrower.nextPayment.amount)}</span>
                  <span className="text-xs text-warning">{formatDate(borrower.nextPayment.dueDate)}</span>
                </div>
              </div>
            </div>
          </SpotlightCard>
        </div>
      </div>

      {/* Mobile: Fixed bottom Draw Down */}
      <div className="md:hidden">
        {!mobileDrawOpen && (
          <div className="fixed bottom-[calc(env(safe-area-inset-bottom,0px)+4.5rem)] left-0 right-0 z-30 px-4 pb-2">
            <Button
              className="w-full font-semibold h-14 text-base rounded-xl"
              size="lg"
              onClick={() => setMobileDrawOpen(true)}
            >
              <span className="flex items-center gap-2">
                <ArrowDownToLine className="w-5 h-5" />
                Draw Down Credit
              </span>
            </Button>
          </div>
        )}

        <AnimatePresence>
          {mobileDrawOpen && (
            <div className="fixed inset-0 z-50 md:hidden">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 bg-foreground/20 dark:bg-black/60"
                onClick={() => setMobileDrawOpen(false)}
              />
              <motion.div
                initial={{ y: "100%" }}
                animate={{ y: 0 }}
                exit={{ y: "100%" }}
                transition={{ type: "spring", damping: 30, stiffness: 300 }}
                className="absolute bottom-0 left-0 right-0 mobile-bottom-sheet bg-background border-t border-border"
              >
                <div className="flex justify-between items-center px-5 pt-2">
                  <span className="text-sm font-medium text-foreground">Draw Down Credit</span>
                  <button
                    onClick={() => setMobileDrawOpen(false)}
                    className="p-2 text-muted-foreground hover:text-foreground min-h-[44px] min-w-[44px] flex items-center justify-center"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="px-5 pb-6 space-y-5">
                  <div className="p-4 rounded-lg bg-muted text-center">
                    <div className="text-[10px] text-muted-foreground mb-1 uppercase tracking-wider">Available to Borrow</div>
                    <div className="text-3xl font-bold mono-text text-foreground">{formatUSD(borrower.availableCredit)}</div>
                  </div>

                  <div>
                    <label className="text-[10px] text-muted-foreground mb-2 block uppercase tracking-wider">Amount (USDC)</label>
                    <div className="relative">
                      <Input
                        type="number"
                        placeholder="0.00"
                        value={drawAmount}
                        onChange={(e) => setDrawAmount(e.target.value)}
                        className="pr-16 text-2xl h-16 rounded-xl mono-text"
                        inputMode="decimal"
                      />
                      <button
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-primary font-semibold px-3 py-2 min-h-[44px] min-w-[44px] flex items-center justify-center hover:text-primary/70 transition-colors duration-200"
                        onClick={() => setDrawAmount(String(borrower.availableCredit))}
                      >
                        MAX
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2 text-sm p-3 rounded-lg bg-muted">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Interest Rate</span>
                      <span className="font-medium mono-text text-foreground">{formatPercent(borrower.interestRate)}</span>
                    </div>
                    {drawAmount && (
                      <>
                        <div className="flex justify-between pt-2 border-t border-border">
                          <span className="text-muted-foreground">New Outstanding Debt</span>
                          <span className="font-medium mono-text text-foreground">{formatUSD(borrower.outstandingDebt + parseFloat(drawAmount || "0"))}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Est. Monthly Payment</span>
                          <span className="font-medium mono-text text-foreground">{formatUSD((parseFloat(drawAmount || "0") * (1 + borrower.interestRate / 100)) / 12)}</span>
                        </div>
                      </>
                    )}
                  </div>

                  {drawAmount && parseFloat(drawAmount) > borrower.availableCredit && (
                    <p className="text-xs text-destructive text-center">Amount exceeds available credit</p>
                  )}

                  <ClickSpark>
                    <Button
                      className="w-full font-semibold h-14 text-base rounded-xl"
                      size="lg"
                      disabled={!drawAmount || parseFloat(drawAmount) > borrower.availableCredit}
                    >
                      <span className="flex items-center gap-2">
                        <ArrowDownToLine className="w-5 h-5" />
                        Draw Down
                      </span>
                    </Button>
                  </ClickSpark>

                  <div className="pt-3 border-t border-border">
                    <div className="text-[10px] text-muted-foreground mb-2 uppercase tracking-wider">Next Payment Due</div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium mono-text text-foreground">{formatUSD(borrower.nextPayment.amount)}</span>
                      <span className="text-xs text-warning">{formatDate(borrower.nextPayment.dueDate)}</span>
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
