import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useWDK } from "@/providers/WDKProvider"
import { shortenAddress } from "@/lib/utils"
import { isValidSeedPhrase } from "@/lib/wdk"
import {
  Wallet,
  Copy,
  Check,
  RefreshCw,
  LogOut,
  Eye,
  EyeOff,
  KeyRound,
  Plus,
  ArrowLeft,
  AlertCircle,
  CircleDollarSign,
} from "lucide-react"
import { WDKBadge } from "./WDKBadge"

type View = "idle" | "choose" | "creating" | "created" | "restoring"

export function WDKWalletButton() {
  const {
    isConnected,
    isLoading,
    address,
    seedPhrase,
    usdcDisplay,
    ethDisplay,
    createWallet,
    restoreWallet,
    disconnect,
    refreshBalances,
    error,
    clearError,
  } = useWDK()

  const [view, setView] = useState<View>("idle")
  const [restoreSeed, setRestoreSeed] = useState("")
  const [restoreError, setRestoreError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [seedVisible, setSeedVisible] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  const handleCopySeed = async () => {
    if (!seedPhrase) return
    await navigator.clipboard.writeText(seedPhrase)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleCreate = async () => {
    setView("creating")
    clearError()
    await createWallet()
    setView("created")
  }

  const handleRestore = async () => {
    setRestoreError(null)
    const trimmed = restoreSeed.trim()
    if (!trimmed) {
      setRestoreError("Please enter a seed phrase")
      return
    }
    if (!isValidSeedPhrase(trimmed)) {
      setRestoreError("Invalid seed phrase. Must be a valid BIP39 mnemonic.")
      return
    }
    clearError()
    await restoreWallet(trimmed)
    if (!error) {
      setRestoreSeed("")
      setView("idle")
    }
  }

  const handleDisconnect = () => {
    disconnect()
    setView("idle")
    setSeedVisible(false)
    setCopied(false)
  }

  const handleRefresh = async () => {
    setRefreshing(true)
    await refreshBalances()
    setRefreshing(false)
  }

  // ── Loading state ──────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="p-4 rounded-lg border border-border bg-muted/50 flex items-center gap-3">
        <span className="h-4 w-4 rounded-full border-2 border-primary border-t-transparent animate-spin" />
        <span className="text-sm text-muted-foreground">Loading WDK wallet...</span>
      </div>
    )
  }

  // ── Connected state ────────────────────────────────────────────────────
  if (isConnected && address) {
    return (
      <div className="space-y-3">
        <div className="p-4 rounded-lg border border-teal-500/30 bg-teal-500/[0.06]">
          {/* Header row */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-teal-500/15 flex items-center justify-center">
                <Wallet className="w-4 h-4 text-teal-500" />
              </div>
              <div>
                <div className="text-sm font-medium text-foreground flex items-center gap-1.5">
                  WDK Wallet
                  <span className="w-1.5 h-1.5 rounded-full bg-teal-500 inline-block" />
                </div>
                <div className="text-xs text-muted-foreground mono-text">{shortenAddress(address, 6)}</div>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={handleRefresh}
                disabled={refreshing}
                className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                title="Refresh balances"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
              </button>
              <button
                onClick={handleDisconnect}
                className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                title="Disconnect WDK wallet"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Balances */}
          <div className="grid grid-cols-2 gap-2">
            <div className="p-2.5 rounded-md bg-background/60 border border-border/50">
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">USDC</div>
              <div className="text-sm font-semibold text-foreground flex items-center gap-1">
                <CircleDollarSign className="w-3.5 h-3.5 text-teal-500" />
                {usdcDisplay}
              </div>
            </div>
            <div className="p-2.5 rounded-md bg-background/60 border border-border/50">
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">ETH</div>
              <div className="text-sm font-semibold text-foreground">{ethDisplay}</div>
            </div>
          </div>

          {/* Seed phrase reveal (only shown right after creation) */}
          {seedPhrase && view === "created" && (
            <div className="mt-3 p-3 rounded-md bg-amber-500/[0.08] border border-amber-500/20">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] text-amber-600 dark:text-amber-400 uppercase tracking-wider font-medium">
                  Backup seed phrase
                </span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setSeedVisible(!seedVisible)}
                    className="p-1 rounded text-amber-600 dark:text-amber-400 hover:bg-amber-500/10 transition-colors"
                    title={seedVisible ? "Hide seed" : "Show seed"}
                  >
                    {seedVisible ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                  <button
                    onClick={handleCopySeed}
                    className="p-1 rounded text-amber-600 dark:text-amber-400 hover:bg-amber-500/10 transition-colors"
                    title="Copy seed phrase"
                  >
                    {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
              <p className={`text-xs leading-relaxed mono-text break-all ${
                seedVisible ? "text-foreground" : "text-transparent select-none blur-sm"
              }`}>
                {seedPhrase}
              </p>
              <p className="text-[10px] text-amber-600/70 dark:text-amber-400/70 mt-2">
                Save this somewhere safe. You will not be able to recover your wallet without it.
              </p>
            </div>
          )}
        </div>
        <WDKBadge />
      </div>
    )
  }

  // ── Choose: create or restore ──────────────────────────────────────────
  if (view === "choose") {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2 mb-1">
          <button
            onClick={() => setView("idle")}
            className="p-1 rounded text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <span className="text-sm font-medium text-foreground">Tether WDK Wallet</span>
        </div>

        <button
          onClick={handleCreate}
          className="w-full text-left p-4 rounded-lg border-2 border-border hover:border-teal-500/40 hover:bg-teal-500/[0.04] transition-all group"
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-teal-500/10 flex items-center justify-center group-hover:bg-teal-500/15 transition-colors">
              <Plus className="w-5 h-5 text-teal-500" />
            </div>
            <div>
              <div className="text-sm font-semibold text-foreground">Create New Wallet</div>
              <div className="text-xs text-muted-foreground">Generate a fresh BIP39 seed phrase</div>
            </div>
          </div>
        </button>

        <button
          onClick={() => setView("restoring")}
          className="w-full text-left p-4 rounded-lg border-2 border-border hover:border-teal-500/40 hover:bg-teal-500/[0.04] transition-all group"
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-teal-500/10 flex items-center justify-center group-hover:bg-teal-500/15 transition-colors">
              <KeyRound className="w-5 h-5 text-teal-500" />
            </div>
            <div>
              <div className="text-sm font-semibold text-foreground">Restore Existing</div>
              <div className="text-xs text-muted-foreground">Import from a seed phrase</div>
            </div>
          </div>
        </button>

        <WDKBadge />
      </div>
    )
  }

  // ── Creating state ─────────────────────────────────────────────────────
  if (view === "creating") {
    return (
      <div className="p-6 rounded-lg border border-border bg-muted/50 flex flex-col items-center gap-3">
        <span className="h-5 w-5 rounded-full border-2 border-teal-500 border-t-transparent animate-spin" />
        <span className="text-sm text-muted-foreground">Creating WDK wallet...</span>
      </div>
    )
  }

  // ── Restore from seed ──────────────────────────────────────────────────
  if (view === "restoring") {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2 mb-1">
          <button
            onClick={() => { setView("choose"); setRestoreError(null); setRestoreSeed("") }}
            className="p-1 rounded text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <span className="text-sm font-medium text-foreground">Restore WDK Wallet</span>
        </div>

        <div>
          <label className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1.5 block">
            Seed Phrase (12 or 24 words)
          </label>
          <Input
            placeholder="Enter your BIP39 seed phrase..."
            value={restoreSeed}
            onChange={(e) => { setRestoreSeed(e.target.value); setRestoreError(null) }}
            className="h-11 mono-text text-xs"
          />
          {(restoreError || error) && (
            <div className="flex items-center gap-1.5 mt-2 text-destructive">
              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
              <span className="text-xs">{restoreError || error}</span>
            </div>
          )}
        </div>

        <Button
          onClick={handleRestore}
          className="w-full font-semibold h-10"
          disabled={!restoreSeed.trim()}
        >
          <KeyRound className="w-4 h-4 mr-2" />
          Restore Wallet
        </Button>

        <WDKBadge />
      </div>
    )
  }

  // ── Default: idle / not connected ──────────────────────────────────────
  return (
    <div>
      <Button
        variant="outline"
        onClick={() => setView("choose")}
        className="w-full md:w-auto h-11 font-semibold border-teal-500/30 text-teal-600 dark:text-teal-400 hover:bg-teal-500/[0.06] hover:border-teal-500/50"
      >
        <Wallet className="w-4 h-4 mr-2" />
        Connect with WDK
      </Button>
    </div>
  )
}
