import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useWDK } from "@/providers/WDKProvider"
import { shortenAddress } from "@/lib/utils"
import {
  Wallet, Copy, Check, RefreshCw, LogOut, Eye, EyeOff,
  KeyRound, Plus, ArrowLeft, AlertCircle, CircleDollarSign, ShieldCheck,
} from "lucide-react"
import { WDKBadge } from "./WDKBadge"

type View = "idle" | "choose" | "creating" | "restoring"

interface WDKWalletButtonProps { compact?: boolean }

export function WDKWalletButton({ compact }: WDKWalletButtonProps = {}) {
  const {
    isConnected, isPendingBackup, isLoading,
    address, seedPhrase, usdcDisplay, ethDisplay,
    createWallet, restoreWallet, confirmBackup, disconnect,
    refreshBalances, error, clearError,
  } = useWDK()

  const [view, setView] = useState<View>("idle")
  const [restoreSeed, setRestoreSeed] = useState("")
  const [restoreError, setRestoreError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [seedVisible, setSeedVisible] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [backupChecked, setBackupChecked] = useState(false)

  const handleCopySeed = async () => {
    if (!seedPhrase) return
    await navigator.clipboard.writeText(seedPhrase)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleCreate = async () => {
    setView("creating")
    clearError()
    setBackupChecked(false)
    setSeedVisible(false)
    await createWallet()
    // After create, provider sets isPendingBackup=true
    // The backup panel will render automatically
    setView("idle")
  }

  const handleConfirmBackup = () => {
    confirmBackup()
    setBackupChecked(false)
    setSeedVisible(false)
  }

  const handleRestore = async () => {
    setRestoreError(null)
    const trimmed = restoreSeed.trim()
    if (!trimmed) { setRestoreError("Enter a seed phrase"); return }
    const words = trimmed.split(/\s+/)
    if (words.length !== 12 && words.length !== 24) {
      setRestoreError("Must be 12 or 24 words"); return
    }
    clearError()
    try {
      await restoreWallet(trimmed)
      setRestoreSeed("")
      setView("idle")
    } catch (err) {
      setRestoreError(err instanceof Error ? err.message : "Restore failed")
    }
  }

  const handleDisconnect = () => {
    disconnect()
    setView("idle")
  }

  const handleRefresh = async () => {
    setRefreshing(true)
    await refreshBalances()
    setRefreshing(false)
  }

  // ── Loading ──────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="p-4 rounded-lg border border-border bg-muted/50 flex items-center gap-3">
        <span className="h-4 w-4 rounded-full border-2 border-primary border-t-transparent animate-spin" />
        <span className="text-sm text-muted-foreground">Connecting...</span>
      </div>
    )
  }

  // ── Backup pending (shown as forced modal after creation) ────────────
  if (isPendingBackup && seedPhrase && address) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
        <div className="relative z-10 w-full max-w-sm rounded-2xl border border-border bg-background shadow-2xl p-6 space-y-4">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
              <ShieldCheck className="w-5 h-5 text-amber-500" />
            </div>
            <div>
              <div className="text-base font-semibold text-foreground">Save Your Seed Phrase</div>
              <div className="text-xs text-muted-foreground">This is the only way to recover your wallet.</div>
            </div>
          </div>

          <div className="text-xs text-muted-foreground">
            Address: <span className="mono-text text-foreground">{shortenAddress(address, 8)}</span>
          </div>

          <div className="p-4 rounded-xl bg-amber-500/[0.06] border border-amber-500/20">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10px] text-amber-600 dark:text-amber-400 uppercase tracking-wider font-medium">
                Seed phrase
              </span>
              <div className="flex items-center gap-1">
                <button onClick={() => setSeedVisible(!seedVisible)}
                  className="p-1 rounded text-amber-600 dark:text-amber-400 hover:bg-amber-500/10 cursor-pointer">
                  {seedVisible ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                </button>
                <button onClick={handleCopySeed}
                  className="p-1 rounded text-amber-600 dark:text-amber-400 hover:bg-amber-500/10 cursor-pointer">
                  {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>
            <p className={`text-sm leading-relaxed mono-text break-all transition-all ${
              seedVisible ? "text-foreground" : "text-transparent select-none blur-sm"
            }`}>
              {seedPhrase}
            </p>
          </div>

          <label className="flex items-start gap-2 cursor-pointer">
            <input type="checkbox" checked={backupChecked} onChange={e => setBackupChecked(e.target.checked)}
              className="mt-1 accent-teal-500 cursor-pointer" />
            <span className="text-sm text-muted-foreground">
              I saved my seed phrase. I understand I cannot recover my wallet without it.
            </span>
          </label>

          <Button onClick={handleConfirmBackup} disabled={!backupChecked}
            className="w-full h-12 text-base font-semibold bg-teal-600 hover:bg-teal-700 text-white cursor-pointer disabled:opacity-40">
            <ShieldCheck className="w-5 h-5 mr-2" />
            Continue to Wallet
          </Button>
        </div>
      </div>
    )
  }

  // ── Connected ────────────────────────────────────────────────────────
  if (isConnected && address) {
    return (
      <div className="space-y-3">
        <div className="p-4 rounded-lg border border-teal-500/30 bg-teal-500/[0.06]">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-teal-500/15 flex items-center justify-center">
                <Wallet className="w-4 h-4 text-teal-500" />
              </div>
              <div>
                <div className="text-sm font-medium text-foreground flex items-center gap-1.5">
                  WDK Wallet <span className="w-1.5 h-1.5 rounded-full bg-teal-500 inline-block" />
                </div>
                <div className="text-xs text-muted-foreground mono-text">{shortenAddress(address, 6)}</div>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={handleRefresh} disabled={refreshing}
                className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer">
                <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
              </button>
              <button onClick={handleDisconnect}
                className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors cursor-pointer">
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="p-2.5 rounded-md bg-background/60 border border-border/50">
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">USDC</div>
              <div className="text-sm font-semibold text-foreground flex items-center gap-1">
                <CircleDollarSign className="w-3.5 h-3.5 text-teal-500" />{usdcDisplay}
              </div>
            </div>
            <div className="p-2.5 rounded-md bg-background/60 border border-border/50">
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">ETH</div>
              <div className="text-sm font-semibold text-foreground">{ethDisplay}</div>
            </div>
          </div>
        </div>
        <WDKBadge />
      </div>
    )
  }

  // ── Modal panels (choose / creating / restoring / error) ─────────────

  const errorPanel = error ? (
    <div className="space-y-4">
      <div className="p-5 rounded-xl border border-destructive/30 bg-destructive/[0.06]">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
          <div>
            <div className="text-base font-medium text-foreground mb-1">Connection failed</div>
            <div className="text-sm text-muted-foreground break-all">{error}</div>
          </div>
        </div>
      </div>
      <Button variant="outline" onClick={() => { clearError(); setView("choose") }}
        className="w-full h-12 text-base font-semibold cursor-pointer">
        <ArrowLeft className="w-5 h-5 mr-2" /> Try Again
      </Button>
    </div>
  ) : null

  const choosePanel = (
    <div className="space-y-4">
      <div className="flex items-center gap-2.5 mb-2">
        <button onClick={() => setView("idle")}
          className="p-1.5 rounded text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <span className="text-base font-medium text-foreground">Tether WDK Wallet</span>
      </div>
      <button onClick={handleCreate}
        className="w-full text-left p-5 rounded-xl border-2 border-border hover:border-teal-500/40 hover:bg-teal-500/[0.04] transition-all group cursor-pointer">
        <div className="flex items-center gap-4">
          <div className="w-11 h-11 rounded-xl bg-teal-500/10 flex items-center justify-center group-hover:bg-teal-500/15">
            <Plus className="w-6 h-6 text-teal-500" />
          </div>
          <div>
            <div className="text-base font-semibold text-foreground">Create New Wallet</div>
            <div className="text-sm text-muted-foreground">Generate a fresh BIP39 seed phrase</div>
          </div>
        </div>
      </button>
      <button onClick={() => setView("restoring")}
        className="w-full text-left p-5 rounded-xl border-2 border-border hover:border-teal-500/40 hover:bg-teal-500/[0.04] transition-all group cursor-pointer">
        <div className="flex items-center gap-4">
          <div className="w-11 h-11 rounded-xl bg-teal-500/10 flex items-center justify-center group-hover:bg-teal-500/15">
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
      <span className="text-base text-muted-foreground">Creating wallet...</span>
    </div>
  )

  const restoringPanel = (
    <div className="space-y-4">
      <div className="flex items-center gap-2.5 mb-2">
        <button onClick={() => { setView("choose"); setRestoreError(null); setRestoreSeed("") }}
          className="p-1.5 rounded text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <span className="text-base font-medium text-foreground">Restore Wallet</span>
      </div>
      <div>
        <label className="text-xs text-muted-foreground uppercase tracking-wider mb-2 block">
          Seed Phrase (12 or 24 words)
        </label>
        <Input placeholder="word1 word2 word3 ..." value={restoreSeed}
          onChange={e => { setRestoreSeed(e.target.value); setRestoreError(null) }}
          className="h-12 mono-text text-sm" />
        {restoreError && (
          <div className="flex items-center gap-2 mt-2.5 text-destructive">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span className="text-sm">{restoreError}</span>
          </div>
        )}
      </div>
      <Button onClick={handleRestore} disabled={!restoreSeed.trim()}
        className="w-full font-semibold h-12 text-base cursor-pointer">
        <KeyRound className="w-5 h-5 mr-2" /> Restore Wallet
      </Button>
      <WDKBadge />
    </div>
  )

  // Pick which panel to show
  const activePanel = errorPanel
    ? errorPanel
    : view === "choose" ? choosePanel
    : view === "creating" ? creatingPanel
    : view === "restoring" ? restoringPanel
    : null

  const modal = activePanel ? (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={view !== "creating" ? () => { setView("idle"); clearError(); setRestoreError(null); setRestoreSeed("") } : undefined} />
      <div className="relative z-10 w-full max-w-sm rounded-2xl border border-border bg-background shadow-2xl p-6">
        {activePanel}
      </div>
    </div>
  ) : null

  // ── Render button + modal ──────────────────────────────────────────
  const connectBtn = compact ? (
    <Button size="sm" onClick={() => setView("choose")}
      className="text-xs font-semibold h-8 bg-teal-600 hover:bg-teal-700 text-white cursor-pointer">
      <Wallet className="w-3.5 h-3.5 mr-1.5" /> Connect
    </Button>
  ) : (
    <Button variant="outline" onClick={() => setView("choose")}
      className="w-full md:w-auto h-11 font-semibold border-teal-500/30 text-teal-600 dark:text-teal-400 hover:bg-teal-500/[0.06] hover:border-teal-500/50 cursor-pointer">
      <Wallet className="w-4 h-4 mr-2" /> Connect with WDK
    </Button>
  )

  return <>{connectBtn}{modal}</>
}
