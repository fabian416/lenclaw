import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { StatCard } from "@/components/shared/StatCard"
import { ProgressBar } from "@/components/shared/ProgressBar"
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
  AlertCircle,
  CheckCircle2,
} from "lucide-react"

export default function BorrowPage() {
  const [drawAmount, setDrawAmount] = useState("")
  const borrower = MOCK_BORROWER
  const utilizationPercent = ((borrower.outstandingDebt / borrower.creditLine) * 100).toFixed(1)

  return (
    <div className="max-w-4xl mx-auto px-4 md:px-6 py-8">
      {/* Agent Header */}
      <div className="flex items-center gap-4 mb-8">
        <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
          <Bot className="w-6 h-6 text-primary" />
        </div>
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold mono-text">{borrower.agentName}</h1>
            <Badge variant="outline" className="mono-text text-[10px]">{borrower.erc8004Id}</Badge>
          </div>
          <p className="text-sm text-muted-foreground">Agent Credit Dashboard</p>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard
          label="Credit Line"
          value={formatUSD(borrower.creditLine)}
          icon={DollarSign}
        />
        <StatCard
          label="Available Credit"
          value={formatUSD(borrower.availableCredit)}
          icon={TrendingUp}
          sublabel={`${((borrower.availableCredit / borrower.creditLine) * 100).toFixed(0)}% free`}
          trend="neutral"
        />
        <StatCard
          label="Outstanding Debt"
          value={formatUSD(borrower.outstandingDebt)}
          icon={Clock}
        />
        <StatCard
          label="Interest Rate"
          value={formatPercent(borrower.interestRate)}
          icon={TrendingUp}
        />
      </div>

      <div className="grid md:grid-cols-5 gap-6">
        {/* Left Column */}
        <div className="md:col-span-3 space-y-6">
          {/* Credit Utilization */}
          <Card className="data-card rounded-2xl border-primary/15">
            <CardHeader>
              <CardTitle className="mono-text text-sm">Credit Utilization</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-end justify-between mb-3">
                <span className="text-3xl font-bold mono-text">{utilizationPercent}%</span>
                <span className="text-xs mono-text text-muted-foreground">
                  {formatUSD(borrower.outstandingDebt)} / {formatUSD(borrower.creditLine)}
                </span>
              </div>
              <ProgressBar value={parseFloat(utilizationPercent)} />
            </CardContent>
          </Card>

          {/* Revenue Lockbox */}
          <Card className="data-card rounded-2xl border-primary/15">
            <CardHeader>
              <CardTitle className="mono-text text-sm flex items-center gap-2">
                <Lock className="w-4 h-4 text-primary" />
                Revenue Lockbox
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <div className="text-xs text-muted-foreground mono-text mb-1">Total Revenue (30d)</div>
                  <div className="text-xl font-bold mono-text">{formatUSD(borrower.lockboxRevenue)}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground mono-text mb-1">Current Balance</div>
                  <div className="text-xl font-bold mono-text text-emerald-400">{formatUSD(borrower.lockboxBalance)}</div>
                </div>
              </div>
              <div className="p-3 rounded-lg bg-primary/5 border border-primary/10 text-xs text-muted-foreground">
                Revenue flows through the lockbox contract. Lender repayments are automatically deducted before agent withdrawals.
              </div>
            </CardContent>
          </Card>

          {/* Repayment Schedule */}
          <Card className="data-card rounded-2xl border-primary/15">
            <CardHeader>
              <CardTitle className="mono-text text-sm flex items-center gap-2">
                <CalendarCheck className="w-4 h-4 text-primary" />
                Repayment Schedule
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {borrower.repaymentSchedule.map((entry, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between py-2.5 border-b border-border/50 last:border-0"
                  >
                    <div className="flex items-center gap-3">
                      {entry.status === "paid" ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      ) : (
                        <AlertCircle className="w-4 h-4 text-amber-400" />
                      )}
                      <div>
                        <div className="text-sm mono-text">{formatDate(entry.date)}</div>
                        <div className="text-xs text-muted-foreground mono-text capitalize">{entry.status}</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-semibold mono-text">{formatUSD(entry.amount)}</div>
                      {entry.status === "paid" && (
                        <div className="text-xs text-emerald-400 mono-text">Completed</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Draw Down */}
        <div className="md:col-span-2">
          <Card className="data-card rounded-2xl border-primary/15 sticky top-24">
            <CardHeader>
              <CardTitle className="mono-text text-sm">Draw Down Credit</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="p-3 rounded-xl bg-muted/50 border border-border text-center">
                <div className="text-xs text-muted-foreground mono-text mb-1">Available to Borrow</div>
                <div className="text-2xl font-bold mono-text text-primary">{formatUSD(borrower.availableCredit)}</div>
              </div>

              <div>
                <label className="text-xs mono-text text-muted-foreground mb-1.5 block">Amount (USDC)</label>
                <div className="relative">
                  <Input
                    type="number"
                    placeholder="0.00"
                    value={drawAmount}
                    onChange={(e) => setDrawAmount(e.target.value)}
                    className="mono-text pr-16 text-lg h-12"
                  />
                  <button
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-primary mono-text font-semibold hover:underline"
                    onClick={() => setDrawAmount(String(borrower.availableCredit))}
                  >
                    MAX
                  </button>
                </div>
              </div>

              <div className="space-y-2 text-xs mono-text">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Interest Rate</span>
                  <span className="text-foreground">{formatPercent(borrower.interestRate)}</span>
                </div>
                {drawAmount && (
                  <>
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
                  </>
                )}
              </div>

              <Button
                className="w-full mono-text font-semibold h-11"
                size="lg"
                disabled={!drawAmount || parseFloat(drawAmount) > borrower.availableCredit}
              >
                <span className="flex items-center gap-2">
                  <ArrowDownToLine className="w-4 h-4" />
                  Draw Down
                </span>
              </Button>

              {drawAmount && parseFloat(drawAmount) > borrower.availableCredit && (
                <p className="text-xs text-red-400 mono-text text-center">
                  Amount exceeds available credit
                </p>
              )}

              <div className="pt-3 border-t border-border">
                <div className="text-xs text-muted-foreground mono-text mb-2">Next Payment Due</div>
                <div className="flex justify-between items-center">
                  <span className="text-sm mono-text font-semibold">{formatUSD(borrower.nextPayment.amount)}</span>
                  <span className="text-xs mono-text text-amber-400">{formatDate(borrower.nextPayment.dueDate)}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
