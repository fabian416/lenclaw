import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { StatCard } from "@/components/shared/StatCard"
import { MOCK_POOL_DATA } from "@/lib/constants"
import { formatUSD, formatPercent } from "@/lib/utils"
import { DollarSign, TrendingUp, Shield, Zap, ArrowDownToLine, ArrowUpFromLine } from "lucide-react"
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
    <button
      onClick={onSelect}
      className={`data-card rounded-2xl p-6 text-left transition-all w-full ${
        selected ? "glow-border" : "border-primary/10"
      }`}
    >
      <div className="flex items-center gap-3 mb-4">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
          isSenior ? "bg-blue-500/10" : "bg-purple-500/10"
        }`}>
          {isSenior ? (
            <Shield className="w-5 h-5 text-blue-400" />
          ) : (
            <Zap className="w-5 h-5 text-purple-400" />
          )}
        </div>
        <div>
          <h3 className="font-semibold mono-text capitalize">{type} Tranche</h3>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <div className="text-xs text-muted-foreground mono-text mb-1">APY</div>
          <div className={`text-xl font-bold mono-text ${isSenior ? "text-blue-400" : "text-purple-400"}`}>
            {formatPercent(apy)}
          </div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground mono-text mb-1">TVL</div>
          <div className="text-xl font-bold mono-text text-foreground">{formatUSD(tvl)}</div>
        </div>
      </div>
    </button>
  )
}

export default function LendPage() {
  const [selectedTranche, setSelectedTranche] = useState<TrancheType>("senior")
  const [amount, setAmount] = useState("")
  const [action, setAction] = useState<"deposit" | "withdraw">("deposit")

  const pool = MOCK_POOL_DATA
  const currentAPY = selectedTranche === "senior" ? pool.seniorAPY : pool.juniorAPY

  // Mock user position (lcUSDC shares per ERC-4626)
  const userPosition = {
    senior: { shares: 12_500, value: 13_200, earned: 700 },
    junior: { shares: 5_000, value: 5_800, earned: 800 },
  }

  const pos = userPosition[selectedTranche]

  return (
    <div className="max-w-4xl mx-auto px-4 md:px-6 py-8">
      <div className="mb-8">
        <h1 className="text-2xl md:text-3xl font-bold mono-text mb-2">Lend</h1>
        <p className="text-muted-foreground text-sm">Deposit USDC into tranches to earn yield from AI agent repayments</p>
      </div>

      {/* Overview Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <StatCard label="Total TVL" value={formatUSD(pool.tvl)} icon={DollarSign} />
        <StatCard label="Senior APY" value={formatPercent(pool.seniorAPY)} icon={TrendingUp} sublabel="Low risk" />
        <StatCard label="Junior APY" value={formatPercent(pool.juniorAPY)} icon={TrendingUp} sublabel="Higher risk" />
        <StatCard label="Utilization" value={formatPercent(pool.utilizationRate)} icon={DollarSign} />
      </div>

      <div className="grid md:grid-cols-5 gap-6">
        {/* Left: Tranche Selection + Position */}
        <div className="md:col-span-3 space-y-6">
          {/* Tranche Selection */}
          <div className="grid grid-cols-2 gap-4">
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
          <Card className="data-card rounded-2xl border-primary/15">
            <CardHeader>
              <CardTitle className="mono-text text-sm">
                Your {selectedTranche === "senior" ? "Senior" : "Junior"} Position
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <div className="text-xs text-muted-foreground mono-text mb-1">lcUSDC Shares</div>
                  <div className="text-lg font-bold mono-text">{formatUSD(pos.shares)}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground mono-text mb-1">Current Value</div>
                  <div className="text-lg font-bold mono-text">{formatUSD(pos.value)}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground mono-text mb-1">Earned</div>
                  <div className="text-lg font-bold mono-text text-emerald-400">+{formatUSD(pos.earned)}</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right: Deposit/Withdraw Form */}
        <div className="md:col-span-2">
          <Card className="data-card rounded-2xl border-primary/15 sticky top-24">
            <CardHeader>
              <div className="flex gap-2 w-full">
                <button
                  onClick={() => setAction("deposit")}
                  className={`flex-1 py-2 rounded-lg text-sm mono-text font-medium transition-colors ${
                    action === "deposit"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Deposit
                </button>
                <button
                  onClick={() => setAction("withdraw")}
                  className={`flex-1 py-2 rounded-lg text-sm mono-text font-medium transition-colors ${
                    action === "withdraw"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:text-foreground"
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
                    className="mono-text pr-16 text-lg h-12"
                  />
                  <button
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-primary mono-text font-semibold hover:underline"
                    onClick={() => setAmount(action === "deposit" ? "10000" : String(pos.shares))}
                  >
                    MAX
                  </button>
                </div>
              </div>

              <div className="space-y-2 text-xs mono-text">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Tranche</span>
                  <span className="text-foreground capitalize">{selectedTranche}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Current APY</span>
                  <span className="text-primary">{formatPercent(currentAPY)}</span>
                </div>
                {action === "deposit" && amount && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Est. Annual Yield</span>
                    <span className="text-emerald-400">
                      +{formatUSD(parseFloat(amount || "0") * (currentAPY / 100))}
                    </span>
                  </div>
                )}
              </div>

              <Button className="w-full mono-text font-semibold h-11" size="lg">
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
        </div>
      </div>
    </div>
  )
}
