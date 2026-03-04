import { useState, useCallback, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { X, Loader2, DollarSign, ArrowRightLeft, ExternalLink } from "lucide-react"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type RampMode = "buy" | "sell"

interface FiatRampWidgetProps {
  /** Whether the modal is open */
  open: boolean
  /** Callback to close the modal */
  onClose: () => void
  /** Connected wallet address */
  walletAddress: string
  /** Pre-selected mode */
  defaultMode?: RampMode
  /** Pre-filled fiat amount */
  defaultAmount?: number
}

interface RampSessionResponse {
  session_id: string
  widget_url: string
  transaction_id: string
  provider: string
  expires_in: number
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000"

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function FiatRampWidget({
  open,
  onClose,
  walletAddress,
  defaultMode = "buy",
  defaultAmount = 100,
}: FiatRampWidgetProps) {
  const [mode, setMode] = useState<RampMode>(defaultMode)
  const [fiatCurrency, setFiatCurrency] = useState<"USD" | "EUR">("USD")
  const [amount, setAmount] = useState<string>(String(defaultAmount))
  const [widgetUrl, setWidgetUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const backdropRef = useRef<HTMLDivElement>(null)

  // Reset state when modal opens
  useEffect(() => {
    if (open) {
      setWidgetUrl(null)
      setError(null)
      setMode(defaultMode)
      setAmount(String(defaultAmount))
    }
  }, [open, defaultMode, defaultAmount])

  // Close on Escape
  useEffect(() => {
    if (!open) return

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", handleKey)
    return () => window.removeEventListener("keydown", handleKey)
  }, [open, onClose])

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden"
    } else {
      document.body.style.overflow = ""
    }
    return () => {
      document.body.style.overflow = ""
    }
  }, [open])

  const createSession = useCallback(async () => {
    setLoading(true)
    setError(null)

    const parsedAmount = parseFloat(amount)
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      setError("Please enter a valid amount.")
      setLoading(false)
      return
    }

    const endpoint =
      mode === "buy"
        ? `${API_BASE}/api/v1/fiat/onramp/session`
        : `${API_BASE}/api/v1/fiat/offramp/session`

    try {
      const token = localStorage.getItem("lenclaw_token") || ""
      const resp = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          fiat_currency: fiatCurrency,
          fiat_amount: parsedAmount,
          crypto_currency: "USDC",
          wallet_address: walletAddress,
          network: "base",
        }),
      })

      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}))
        throw new Error(body.detail || `Request failed (${resp.status})`)
      }

      const data: RampSessionResponse = await resp.json()
      setWidgetUrl(data.widget_url)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.")
    } finally {
      setLoading(false)
    }
  }, [mode, amount, fiatCurrency, walletAddress])

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === backdropRef.current) onClose()
    },
    [onClose],
  )

  if (!open) return null

  return (
    <div
      ref={backdropRef}
      onClick={handleBackdropClick}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
    >
      <div className="relative w-full max-w-lg mx-4 bg-background border border-primary/15 rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-primary/10">
          <div className="flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-semibold mono-text">
              {mode === "buy" ? "Buy USDC" : "Sell USDC"}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-muted transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6">
          {widgetUrl ? (
            /* Transak iframe */
            <div className="space-y-4">
              <div className="rounded-xl overflow-hidden border border-primary/10">
                <iframe
                  src={widgetUrl}
                  title="Transak Widget"
                  allow="camera;microphone;payment"
                  className="w-full border-0"
                  style={{ height: "520px" }}
                />
              </div>
              <div className="flex items-center justify-between">
                <button
                  onClick={() => setWidgetUrl(null)}
                  className="text-sm text-muted-foreground hover:text-foreground mono-text transition-colors"
                >
                  Back
                </button>
                <a
                  href={widgetUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-sm text-primary hover:underline mono-text"
                >
                  Open in new tab
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            </div>
          ) : (
            /* Configuration form */
            <div className="space-y-5">
              {/* Mode toggle */}
              <div className="flex gap-2">
                <button
                  onClick={() => setMode("buy")}
                  className={`flex-1 py-2.5 rounded-lg text-sm mono-text font-medium transition-colors ${
                    mode === "buy"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Buy USDC
                </button>
                <button
                  onClick={() => setMode("sell")}
                  className={`flex-1 py-2.5 rounded-lg text-sm mono-text font-medium transition-colors ${
                    mode === "sell"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Sell USDC
                </button>
              </div>

              {/* Currency selector */}
              <div>
                <label className="text-xs mono-text text-muted-foreground mb-1.5 block">
                  Fiat Currency
                </label>
                <div className="flex gap-2">
                  {(["USD", "EUR"] as const).map((cur) => (
                    <button
                      key={cur}
                      onClick={() => setFiatCurrency(cur)}
                      className={`flex-1 py-2 rounded-lg text-sm mono-text font-medium border transition-colors ${
                        fiatCurrency === cur
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-primary/10 text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {cur}
                    </button>
                  ))}
                </div>
              </div>

              {/* Amount input */}
              <div>
                <label className="text-xs mono-text text-muted-foreground mb-1.5 block">
                  Amount ({fiatCurrency})
                </label>
                <div className="relative">
                  <input
                    type="number"
                    min="1"
                    max="50000"
                    step="1"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="100.00"
                    className="w-full h-12 rounded-lg border border-primary/15 bg-background px-4 mono-text text-lg focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 flex gap-1">
                    {[100, 500, 1000].map((preset) => (
                      <button
                        key={preset}
                        onClick={() => setAmount(String(preset))}
                        className="text-xs px-2 py-1 rounded bg-muted text-muted-foreground hover:text-foreground mono-text transition-colors"
                      >
                        {preset}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Summary */}
              <div className="space-y-2 text-xs mono-text border-t border-primary/10 pt-4">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Provider</span>
                  <span className="text-foreground">Transak</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Network</span>
                  <span className="text-foreground">Base</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Wallet</span>
                  <span className="text-foreground">
                    {walletAddress.slice(0, 6)}...{walletAddress.slice(-4)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Est. receive</span>
                  <span className="text-primary font-semibold">
                    ~{(parseFloat(amount || "0") * 0.985).toFixed(2)} USDC
                  </span>
                </div>
              </div>

              {/* Error */}
              {error && (
                <div className="text-sm text-red-400 bg-red-400/10 rounded-lg px-4 py-2.5 mono-text">
                  {error}
                </div>
              )}

              {/* Submit */}
              <Button
                onClick={createSession}
                disabled={loading}
                className="w-full mono-text font-semibold h-11"
                size="lg"
              >
                {loading ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Creating session...
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <ArrowRightLeft className="w-4 h-4" />
                    {mode === "buy" ? "Buy USDC" : "Sell USDC"}
                  </span>
                )}
              </Button>

              <p className="text-[11px] text-muted-foreground text-center">
                Powered by Transak. KYC may be required for first-time users.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
