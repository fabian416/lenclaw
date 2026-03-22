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
  AlertTriangle,
  CircleDollarSign,
} from "lucide-react"
import { WDKBadge } from "./WDKBadge"

type View = "idle" | "choose" | "creating" | "created" | "restoring"

interface WDKWalletButtonProps {
  compact?: boolean
}

export function WDKWalletButton({ compact }: WDKWalletButtonProps = {}) {
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
    // If createWallet failed, error will be set in provider — show choose view with error
    // If succeeded, isConnected will be true and the connected UI renders instead
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

  // ── Error state after failed create/restore ────────────────────────────
  if (error && (view === "created" || view === "creating")) {
    const errorContent = (
      <div className="space-y-4">
        <div className="p-5 rounded-xl border border-destructive/30 bg-destructive/[0.06]">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
            <div>
              <div className="text-base font-medium text-foreground mb-1">Wallet creation failed</div>
              <div className="text-sm text-muted-foreground break-all">{error}</div>
            </div>
          </div>
        </div>
        <Button
          variant="outline"
          onClick={() => { setView("choose"); clearError() }}
          className="w-full h-12 text-base font-semibold cursor-pointer"
        >
          <ArrowLeft className="w-5 h-5 mr-2" />
          Try Again
        </Button>
      </div>
    )

    return compact ? (
      <>
        <Button size="sm" className="text-xs font-semibold h-8 bg-teal-600 hover:bg-teal-700 text-white cursor-pointer">
          <Wallet className="w-3.5 h-3.5 mr-1.5" /> Connect
        </Button>
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm cursor-default" onClick={() => { setView("idle"); clearError() }} />
          <div className="relative z-10 w-full max-w-sm rounded-2xl border border-border bg-background shadow-2xl p-6">
            {errorContent}
          </div>
        </div>
      </>
    ) : errorContent
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
                className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
                title="Refresh balances"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
              </button>
              <button
                onClick={handleDisconnect}
                className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors cursor-pointer"
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

          {/* Demo mode security warning */}
          <div className="mt-2 flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-amber-500/[0.08] border border-amber-500/20">
            <AlertTriangle className="w-3 h-3 text-amber-500 flex-shrink-0" />
            <span className="text-[10px] text-amber-600 dark:text-amber-400">
              Demo mode: seed stored in browser. Not for production use.
            </span>
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
                    className="p-1 rounded text-amber-600 dark:text-amber-400 hover:bg-amber-500/10 transition-colors cursor-pointer"
                    title={seedVisible ? "Hide seed" : "Show seed"}
                  >
                    {seedVisible ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                  <button
                    onClick={handleCopySeed}
                    className="p-1 rounded text-amber-600 dark:text-amber-400 hover:bg-amber-500/10 transition-colors cursor-pointer"
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

  // ── Dropdown panel content (shared between compact and full) ───────────
  const choosePanel = (
    <div className="space-y-4">
      <div className="flex items-center gap-2.5 mb-2">
        <button
          onClick={() => setView("idle")}
          className="p-1.5 rounded text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <span className="text-base font-medium text-foreground">Tether WDK Wallet</span>
      </div>

      <button
        onClick={handleCreate}
        className="w-full text-left p-5 rounded-xl border-2 border-border hover:border-teal-500/40 hover:bg-teal-500/[0.04] transition-all group cursor-pointer"
      >
        <div className="flex items-center gap-4">
          <div className="w-11 h-11 rounded-xl bg-teal-500/10 flex items-center justify-center group-hover:bg-teal-500/15 transition-colors">
            <Plus className="w-6 h-6 text-teal-500" />
          </div>
          <div>
            <div className="text-base font-semibold text-foreground">Create New Wallet</div>
            <div className="text-sm text-muted-foreground">Generate a fresh BIP39 seed phrase</div>
          </div>
        </div>
      </button>

      <button
        onClick={() => setView("restoring")}
        className="w-full text-left p-5 rounded-xl border-2 border-border hover:border-teal-500/40 hover:bg-teal-500/[0.04] transition-all group cursor-pointer"
      >
        <div className="flex items-center gap-4">
          <div className="w-11 h-11 rounded-xl bg-teal-500/10 flex items-center justify-center group-hover:bg-teal-500/15 transition-colors">
            <KeyRound className="w-6 h-6 text-teal-500" />
          </div>
          <div>
            <div className="text-base font-semibold text-foreground">Restore Existing</div>
            <div className="text-sm text-muted-foreground">Import from a seed phrase</div>
          </div>
        </div>
      </button>

      <WDKBadge />
    </div>
  )

  const creatingPanel = (
    <div className="p-8 rounded-xl border border-border bg-muted/50 flex flex-col items-center gap-4">
      <span className="h-6 w-6 rounded-full border-2 border-teal-500 border-t-transparent animate-spin" />
      <span className="text-base text-muted-foreground">Creating WDK wallet...</span>
    </div>
  )

  const restoringPanel = (
    <div className="space-y-4">
      <div className="flex items-center gap-2.5 mb-2">
        <button
          onClick={() => { setView("choose"); setRestoreError(null); setRestoreSeed("") }}
          className="p-1.5 rounded text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <span className="text-base font-medium text-foreground">Restore WDK Wallet</span>
      </div>

      <div>
        <label className="text-xs text-muted-foreground uppercase tracking-wider mb-2 block">
          Seed Phrase (12 or 24 words)
        </label>
        <Input
          placeholder="Enter your BIP39 seed phrase..."
          value={restoreSeed}
          onChange={(e) => { setRestoreSeed(e.target.value); setRestoreError(null) }}
          className="h-12 mono-text text-sm"
        />
        {(restoreError || error) && (
          <div className="flex items-center gap-2 mt-2.5 text-destructive">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span className="text-sm">{restoreError || error}</span>
          </div>
        )}
      </div>

      <Button
        onClick={handleRestore}
        className="w-full font-semibold h-12 text-base"
        disabled={!restoreSeed.trim()}
      >
        <KeyRound className="w-5 h-5 mr-2" />
        Restore Wallet
      </Button>

      <WDKBadge />
    </div>
  )

  // ── Active panel (choose / creating / restoring) ─────────────────────
  const activePanel = view === "choose" ? choosePanel
    : view === "creating" ? creatingPanel
    : view === "restoring" ? restoringPanel
    : null

  // ── Modal overlay (shared for both compact and full mode) ──────────
  const modal = activePanel ? (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm cursor-default"
        onClick={() => { setView("idle"); setRestoreError(null); setRestoreSeed("") }}
      />
      {/* Modal card */}
      <div className="relative z-10 w-full max-w-sm rounded-2xl border border-border bg-background shadow-2xl p-6">
        {activePanel}
      </div>
    </div>
  ) : null

  // ── Compact mode (header) ──────────────────────────────────────────
  if (compact) {
    return (
      <>
        <Button
          size="sm"
          onClick={() => setView("choose")}
          className="text-xs font-semibold h-8 bg-teal-600 hover:bg-teal-700 text-white cursor-pointer"
        >
          <Wallet className="w-3.5 h-3.5 mr-1.5" />
          Connect
        </Button>
        {modal}
      </>
    )
  }

  // ── Full mode (pages) ──────────────────────────────────────────────
  return (
    <>
      <Button
        variant="outline"
        onClick={() => setView("choose")}
        className="w-full md:w-auto h-11 font-semibold border-teal-500/30 text-teal-600 dark:text-teal-400 hover:bg-teal-500/[0.06] hover:border-teal-500/50 cursor-pointer"
      >
        <Wallet className="w-4 h-4 mr-2" />
        Connect with WDK
      </Button>
      {modal}
    </>
  )
}
