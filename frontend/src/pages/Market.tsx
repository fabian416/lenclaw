import { useState, useMemo } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { StatCard } from "@/components/shared/StatCard"
import { formatUSD, formatPercent, shortenAddress } from "@/lib/utils"
import type { TrancheType } from "@/lib/types"
import {
  DollarSign,
  TrendingUp,
  ShoppingCart,
  Tag,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Shield,
  Zap,
  X,
  Store,
} from "lucide-react"

// ----------------------------------------------------------------
// Mock data -- will be replaced by on-chain / API reads
// ----------------------------------------------------------------

interface MarketListing {
  id: number
  seller: string
  tranche: TrancheType
  shares: number
  pricePerShare: number
  totalPrice: number
  impliedYield: number
  createdAt: number
}

const MOCK_LISTINGS: MarketListing[] = [
  {
    id: 1,
    seller: "0x742d35Cc6634C0532925a3b844Bc9e7595f2bD1e",
    tranche: "senior",
    shares: 5_000,
    pricePerShare: 1.04,
    totalPrice: 5_200,
    impliedYield: 7.8,
    createdAt: 1709251200,
  },
  {
    id: 2,
    seller: "0x8Ba1f109551bD432803012645Ac136ddd64DBA72",
    tranche: "junior",
    shares: 2_500,
    pricePerShare: 1.12,
    totalPrice: 2_800,
    impliedYield: 13.5,
    createdAt: 1709337600,
  },
  {
    id: 3,
    seller: "0xdD870fA1b7C4700F2BD7f44238821C26f7392148",
    tranche: "senior",
    shares: 10_000,
    pricePerShare: 1.03,
    totalPrice: 10_300,
    impliedYield: 8.1,
    createdAt: 1709424000,
  },
  {
    id: 4,
    seller: "0x583031D1113aD414F02576BD6afaBfb302140225",
    tranche: "junior",
    shares: 7_500,
    pricePerShare: 1.08,
    totalPrice: 8_100,
    impliedYield: 14.9,
    createdAt: 1709510400,
  },
  {
    id: 5,
    seller: "0x4B0897b0513fdC7C541B6d9D7E929C4e5364D2dB",
    tranche: "senior",
    shares: 3_000,
    pricePerShare: 1.05,
    totalPrice: 3_150,
    impliedYield: 7.5,
    createdAt: 1709596800,
  },
  {
    id: 6,
    seller: "0x1aE0EA34a72D944a8C7603FfB3eC30a6669E454C",
    tranche: "junior",
    shares: 1_200,
    pricePerShare: 1.15,
    totalPrice: 1_380,
    impliedYield: 12.8,
    createdAt: 1709683200,
  },
]

const MOCK_USER_LISTINGS: MarketListing[] = [
  {
    id: 7,
    seller: "0xYourWallet...",
    tranche: "senior",
    shares: 2_000,
    pricePerShare: 1.06,
    totalPrice: 2_120,
    impliedYield: 7.2,
    createdAt: 1709769600,
  },
]

const MOCK_MARKET_STATS = {
  totalListings: 6,
  totalVolume: 84_500,
  avgSeniorPrice: 1.04,
  avgJuniorPrice: 1.117,
}

// ----------------------------------------------------------------
// Sort helpers
// ----------------------------------------------------------------

type SortField = "pricePerShare" | "impliedYield" | "shares" | "totalPrice" | "createdAt"
type SortDir = "asc" | "desc"

function sortListings(items: MarketListing[], field: SortField, dir: SortDir) {
  return [...items].sort((a, b) => {
    const va = a[field]
    const vb = b[field]
    return dir === "asc" ? va - vb : vb - va
  })
}

// ----------------------------------------------------------------
// Sub-components
// ----------------------------------------------------------------

function SortButton({
  label,
  field,
  current,
  dir,
  onSort,
}: {
  label: string
  field: SortField
  current: SortField
  dir: SortDir
  onSort: (f: SortField) => void
}) {
  const isActive = current === field
  return (
    <button
      onClick={() => onSort(field)}
      className="flex items-center gap-1 text-xs mono-text text-muted-foreground hover:text-foreground transition-colors"
    >
      {label}
      {isActive ? (
        dir === "asc" ? (
          <ArrowUp className="w-3 h-3 text-primary" />
        ) : (
          <ArrowDown className="w-3 h-3 text-primary" />
        )
      ) : (
        <ArrowUpDown className="w-3 h-3 opacity-40" />
      )}
    </button>
  )
}

function TrancheBadge({ tranche }: { tranche: TrancheType }) {
  const isSenior = tranche === "senior"
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs mono-text font-medium ${
        isSenior
          ? "bg-blue-500/10 text-blue-400"
          : "bg-purple-500/10 text-purple-400"
      }`}
    >
      {isSenior ? <Shield className="w-3 h-3" /> : <Zap className="w-3 h-3" />}
      {isSenior ? "Senior" : "Junior"}
    </span>
  )
}

// ----------------------------------------------------------------
// Page
// ----------------------------------------------------------------

export default function MarketPage() {
  // Filters
  const [trancheFilter, setTrancheFilter] = useState<"all" | TrancheType>("all")
  const [sortField, setSortField] = useState<SortField>("createdAt")
  const [sortDir, setSortDir] = useState<SortDir>("desc")

  // Buy modal state
  const [selectedListing, setSelectedListing] = useState<MarketListing | null>(null)

  // Sell form state
  const [sellTranche, setSellTranche] = useState<TrancheType>("senior")
  const [sellShares, setSellShares] = useState("")
  const [sellPrice, setSellPrice] = useState("")

  // Tab
  const [tab, setTab] = useState<"browse" | "sell" | "my">("browse")

  const handleSort = (field: SortField) => {
    if (field === sortField) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"))
    } else {
      setSortField(field)
      setSortDir("desc")
    }
  }

  const filteredListings = useMemo(() => {
    let items = MOCK_LISTINGS
    if (trancheFilter !== "all") {
      items = items.filter((l) => l.tranche === trancheFilter)
    }
    return sortListings(items, sortField, sortDir)
  }, [trancheFilter, sortField, sortDir])

  const stats = MOCK_MARKET_STATS

  return (
    <div className="max-w-6xl mx-auto px-4 md:px-6 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl md:text-3xl font-bold mono-text mb-2">Market</h1>
        <p className="text-muted-foreground text-sm">
          Trade tranche positions on the secondary market -- exit early or buy discounted yield
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <StatCard label="Active Listings" value={String(stats.totalListings)} icon={Tag} />
        <StatCard
          label="Total Volume"
          value={formatUSD(stats.totalVolume)}
          icon={DollarSign}
        />
        <StatCard
          label="Avg Senior Price"
          value={`$${stats.avgSeniorPrice.toFixed(3)}`}
          icon={TrendingUp}
          sublabel="per sUSDC"
        />
        <StatCard
          label="Avg Junior Price"
          value={`$${stats.avgJuniorPrice.toFixed(3)}`}
          icon={TrendingUp}
          sublabel="per jUSDC"
        />
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        {(
          [
            { key: "browse", label: "Browse Listings", icon: Store },
            { key: "sell", label: "Sell Position", icon: Tag },
            { key: "my", label: "My Listings", icon: ShoppingCart },
          ] as const
        ).map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm mono-text font-medium transition-colors ${
              tab === t.key
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:text-foreground"
            }`}
          >
            <t.icon className="w-4 h-4" />
            {t.label}
          </button>
        ))}
      </div>

      {/* ============= Browse Tab ============= */}
      {tab === "browse" && (
        <div className="space-y-4">
          {/* Tranche filter */}
          <div className="flex gap-2">
            {(["all", "senior", "junior"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setTrancheFilter(f)}
                className={`px-3 py-1.5 rounded-lg text-xs mono-text font-medium transition-colors ${
                  trancheFilter === f
                    ? "bg-primary/20 text-primary border border-primary/30"
                    : "bg-muted text-muted-foreground hover:text-foreground border border-transparent"
                }`}
              >
                {f === "all" ? "All Tranches" : f === "senior" ? "Senior (sUSDC)" : "Junior (jUSDC)"}
              </button>
            ))}
          </div>

          {/* Listings table */}
          <Card className="data-card rounded-2xl border-primary/15 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left px-6 py-3 text-xs mono-text text-muted-foreground font-medium">
                      Tranche
                    </th>
                    <th className="text-left px-4 py-3">
                      <SortButton
                        label="Shares"
                        field="shares"
                        current={sortField}
                        dir={sortDir}
                        onSort={handleSort}
                      />
                    </th>
                    <th className="text-left px-4 py-3">
                      <SortButton
                        label="Price/Share"
                        field="pricePerShare"
                        current={sortField}
                        dir={sortDir}
                        onSort={handleSort}
                      />
                    </th>
                    <th className="text-left px-4 py-3">
                      <SortButton
                        label="Total"
                        field="totalPrice"
                        current={sortField}
                        dir={sortDir}
                        onSort={handleSort}
                      />
                    </th>
                    <th className="text-left px-4 py-3">
                      <SortButton
                        label="Implied Yield"
                        field="impliedYield"
                        current={sortField}
                        dir={sortDir}
                        onSort={handleSort}
                      />
                    </th>
                    <th className="text-left px-4 py-3 text-xs mono-text text-muted-foreground font-medium">
                      Seller
                    </th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {filteredListings.map((listing) => (
                    <tr
                      key={listing.id}
                      className="border-b border-border/50 hover:bg-muted/30 transition-colors"
                    >
                      <td className="px-6 py-4">
                        <TrancheBadge tranche={listing.tranche} />
                      </td>
                      <td className="px-4 py-4 mono-text text-sm text-foreground">
                        {listing.shares.toLocaleString()}
                      </td>
                      <td className="px-4 py-4 mono-text text-sm text-foreground">
                        ${listing.pricePerShare.toFixed(4)}
                      </td>
                      <td className="px-4 py-4 mono-text text-sm text-foreground">
                        {formatUSD(listing.totalPrice)}
                      </td>
                      <td className="px-4 py-4 mono-text text-sm text-emerald-400">
                        {formatPercent(listing.impliedYield)}
                      </td>
                      <td className="px-4 py-4 mono-text text-xs text-muted-foreground">
                        {shortenAddress(listing.seller)}
                      </td>
                      <td className="px-4 py-4">
                        <Button
                          size="sm"
                          className="mono-text text-xs"
                          onClick={() => setSelectedListing(listing)}
                        >
                          <ShoppingCart className="w-3 h-3" />
                          Buy
                        </Button>
                      </td>
                    </tr>
                  ))}
                  {filteredListings.length === 0 && (
                    <tr>
                      <td colSpan={7} className="text-center py-12 text-muted-foreground mono-text text-sm">
                        No active listings found
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Buy confirmation modal */}
          {selectedListing && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
              <Card className="data-card rounded-2xl border-primary/15 w-full max-w-md mx-4">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="mono-text text-base">Confirm Purchase</CardTitle>
                    <button
                      onClick={() => setSelectedListing(null)}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-3 text-sm mono-text">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Listing</span>
                      <span className="text-foreground">#{selectedListing.id}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Tranche</span>
                      <TrancheBadge tranche={selectedListing.tranche} />
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Shares</span>
                      <span className="text-foreground">
                        {selectedListing.shares.toLocaleString()}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Price/Share</span>
                      <span className="text-foreground">
                        ${selectedListing.pricePerShare.toFixed(4)}
                      </span>
                    </div>
                    <div className="border-t border-border pt-3 flex justify-between">
                      <span className="text-muted-foreground font-semibold">Total Cost</span>
                      <span className="text-foreground font-bold">
                        {formatUSD(selectedListing.totalPrice)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Implied Yield</span>
                      <span className="text-emerald-400">
                        {formatPercent(selectedListing.impliedYield)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Protocol Fee (1%)</span>
                      <span className="text-foreground">
                        {formatUSD(selectedListing.totalPrice * 0.01)}
                      </span>
                    </div>
                  </div>

                  <div className="flex gap-3 pt-2">
                    <Button
                      variant="outline"
                      className="flex-1 mono-text"
                      onClick={() => setSelectedListing(null)}
                    >
                      Cancel
                    </Button>
                    <Button className="flex-1 mono-text font-semibold">
                      <ShoppingCart className="w-4 h-4" />
                      Confirm Buy
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      )}

      {/* ============= Sell Tab ============= */}
      {tab === "sell" && (
        <div className="grid md:grid-cols-2 gap-6">
          <Card className="data-card rounded-2xl border-primary/15">
            <CardHeader>
              <CardTitle className="mono-text text-sm">List Shares for Sale</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              {/* Tranche select */}
              <div>
                <label className="text-xs mono-text text-muted-foreground mb-1.5 block">
                  Tranche
                </label>
                <div className="flex gap-2">
                  {(["senior", "junior"] as const).map((t) => (
                    <button
                      key={t}
                      onClick={() => setSellTranche(t)}
                      className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm mono-text font-medium transition-colors ${
                        sellTranche === t
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {t === "senior" ? (
                        <Shield className="w-4 h-4" />
                      ) : (
                        <Zap className="w-4 h-4" />
                      )}
                      {t === "senior" ? "Senior (sUSDC)" : "Junior (jUSDC)"}
                    </button>
                  ))}
                </div>
              </div>

              {/* Shares input */}
              <div>
                <label className="text-xs mono-text text-muted-foreground mb-1.5 block">
                  Shares to Sell
                </label>
                <div className="relative">
                  <Input
                    type="number"
                    placeholder="0"
                    value={sellShares}
                    onChange={(e) => setSellShares(e.target.value)}
                    className="mono-text pr-16 text-lg h-12"
                  />
                  <button
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-primary mono-text font-semibold hover:underline"
                    onClick={() =>
                      setSellShares(sellTranche === "senior" ? "12500" : "5000")
                    }
                  >
                    MAX
                  </button>
                </div>
              </div>

              {/* Price per share */}
              <div>
                <label className="text-xs mono-text text-muted-foreground mb-1.5 block">
                  Price per Share (USDC)
                </label>
                <Input
                  type="number"
                  placeholder="1.00"
                  step="0.001"
                  value={sellPrice}
                  onChange={(e) => setSellPrice(e.target.value)}
                  className="mono-text text-lg h-12"
                />
              </div>

              {/* Summary */}
              {sellShares && sellPrice && (
                <div className="space-y-2 text-xs mono-text pt-2 border-t border-border">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Total Proceeds</span>
                    <span className="text-foreground font-bold">
                      {formatUSD(
                        parseFloat(sellShares || "0") * parseFloat(sellPrice || "0")
                      )}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Protocol Fee (1%)</span>
                    <span className="text-muted-foreground">
                      -
                      {formatUSD(
                        parseFloat(sellShares || "0") *
                          parseFloat(sellPrice || "0") *
                          0.01
                      )}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">You Receive</span>
                    <span className="text-emerald-400 font-bold">
                      {formatUSD(
                        parseFloat(sellShares || "0") *
                          parseFloat(sellPrice || "0") *
                          0.99
                      )}
                    </span>
                  </div>
                </div>
              )}

              <Button className="w-full mono-text font-semibold h-11" size="lg">
                <Tag className="w-4 h-4" />
                List for Sale
              </Button>
            </CardContent>
          </Card>

          {/* Info card */}
          <Card className="data-card rounded-2xl border-primary/15">
            <CardHeader>
              <CardTitle className="mono-text text-sm">How It Works</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm text-muted-foreground">
              <div className="space-y-3">
                <div className="flex gap-3">
                  <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center shrink-0 mt-0.5">
                    <span className="text-xs mono-text text-primary font-bold">1</span>
                  </div>
                  <p>
                    Choose a tranche (Senior or Junior) and the number of shares you
                    want to sell.
                  </p>
                </div>
                <div className="flex gap-3">
                  <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center shrink-0 mt-0.5">
                    <span className="text-xs mono-text text-primary font-bold">2</span>
                  </div>
                  <p>
                    Set your ask price per share. Shares are escrowed in the TrancheMarket
                    contract until sold or delisted.
                  </p>
                </div>
                <div className="flex gap-3">
                  <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center shrink-0 mt-0.5">
                    <span className="text-xs mono-text text-primary font-bold">3</span>
                  </div>
                  <p>
                    When a buyer purchases your listing, you receive USDC minus a 1%
                    protocol fee.
                  </p>
                </div>
                <div className="flex gap-3">
                  <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center shrink-0 mt-0.5">
                    <span className="text-xs mono-text text-primary font-bold">4</span>
                  </div>
                  <p>
                    You can cancel (delist) your listing any time to get your shares
                    back.
                  </p>
                </div>
              </div>

              <div className="border-t border-border pt-4">
                <p className="text-xs mono-text text-muted-foreground/70">
                  The secondary market lets LP depositors exit positions before maturity.
                  Pricing is set by sellers -- buyers can compare implied yields across
                  listings.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ============= My Listings Tab ============= */}
      {tab === "my" && (
        <div className="space-y-4">
          <Card className="data-card rounded-2xl border-primary/15 overflow-hidden">
            <CardHeader>
              <CardTitle className="mono-text text-sm">Your Active Listings</CardTitle>
            </CardHeader>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left px-6 py-3 text-xs mono-text text-muted-foreground font-medium">
                      ID
                    </th>
                    <th className="text-left px-4 py-3 text-xs mono-text text-muted-foreground font-medium">
                      Tranche
                    </th>
                    <th className="text-left px-4 py-3 text-xs mono-text text-muted-foreground font-medium">
                      Shares
                    </th>
                    <th className="text-left px-4 py-3 text-xs mono-text text-muted-foreground font-medium">
                      Price/Share
                    </th>
                    <th className="text-left px-4 py-3 text-xs mono-text text-muted-foreground font-medium">
                      Total Value
                    </th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {MOCK_USER_LISTINGS.map((listing) => (
                    <tr
                      key={listing.id}
                      className="border-b border-border/50 hover:bg-muted/30 transition-colors"
                    >
                      <td className="px-6 py-4 mono-text text-sm text-muted-foreground">
                        #{listing.id}
                      </td>
                      <td className="px-4 py-4">
                        <TrancheBadge tranche={listing.tranche} />
                      </td>
                      <td className="px-4 py-4 mono-text text-sm text-foreground">
                        {listing.shares.toLocaleString()}
                      </td>
                      <td className="px-4 py-4 mono-text text-sm text-foreground">
                        ${listing.pricePerShare.toFixed(4)}
                      </td>
                      <td className="px-4 py-4 mono-text text-sm text-foreground">
                        {formatUSD(listing.totalPrice)}
                      </td>
                      <td className="px-4 py-4">
                        <Button
                          variant="destructive"
                          size="sm"
                          className="mono-text text-xs"
                        >
                          <X className="w-3 h-3" />
                          Delist
                        </Button>
                      </td>
                    </tr>
                  ))}
                  {MOCK_USER_LISTINGS.length === 0 && (
                    <tr>
                      <td
                        colSpan={6}
                        className="text-center py-12 text-muted-foreground mono-text text-sm"
                      >
                        You have no active listings
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}
