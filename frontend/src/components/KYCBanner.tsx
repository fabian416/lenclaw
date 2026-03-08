import { AlertTriangle, ExternalLink, X } from "lucide-react"
import { useState } from "react"
import { Button } from "@/components/ui/button"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface KYCBannerProps {
  /** Whether the user needs KYC verification */
  visible: boolean
  /** URL to the provider's KYC verification flow */
  kycUrl?: string
  /** Provider name shown in the banner */
  provider?: string
  /** Callback when the user dismisses the banner */
  onDismiss?: () => void
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TRANSAK_API_KEY = import.meta.env.VITE_TRANSAK_API_KEY || ""
const DEFAULT_KYC_URL = `https://global.transak.com/?productsAvailed=BUY&apiKey=${TRANSAK_API_KEY}`

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function KYCBanner({
  visible,
  kycUrl = DEFAULT_KYC_URL,
  provider = "Transak",
  onDismiss,
}: KYCBannerProps) {
  const [dismissed, setDismissed] = useState(false)

  if (!visible || dismissed) return null

  const handleDismiss = () => {
    setDismissed(true)
    onDismiss?.()
  }

  return (
    <div className="relative rounded-xl border border-amber-500/30 bg-amber-500/5 px-5 py-4">
      {/* Dismiss button */}
      <button
        onClick={handleDismiss}
        className="absolute top-3 right-3 p-1 rounded-md hover:bg-amber-500/10 transition-colors"
        aria-label="Dismiss KYC banner"
      >
        <X className="w-4 h-4 text-amber-400/70" />
      </button>

      <div className="flex items-start gap-4">
        {/* Icon */}
        <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center flex-shrink-0">
          <AlertTriangle className="w-5 h-5 text-amber-400" />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold mono-text text-amber-300 mb-1">
            Identity Verification Required
          </h3>
          <p className="text-xs text-muted-foreground leading-relaxed mb-3">
            To buy or sell USDC using fiat currency, you need to complete identity
            verification (KYC) with {provider}. This is a one-time process that
            typically takes a few minutes.
          </p>

          <div className="flex items-center gap-3">
            <Button
              asChild
              size="sm"
              className="mono-text text-xs font-semibold bg-amber-500 hover:bg-amber-500/90 text-black"
            >
              <a href={kycUrl} target="_blank" rel="noopener noreferrer">
                <span className="flex items-center gap-1.5">
                  Complete Verification
                  <ExternalLink className="w-3 h-3" />
                </span>
              </a>
            </Button>

            <span className="text-[11px] text-muted-foreground mono-text">
              Powered by {provider}
            </span>
          </div>
        </div>
      </div>

      {/* Info list */}
      <div className="mt-4 ml-14 grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px] mono-text text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <div className="w-1 h-1 rounded-full bg-amber-400/50" />
          Government-issued ID
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-1 h-1 rounded-full bg-amber-400/50" />
          Selfie verification
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-1 h-1 rounded-full bg-amber-400/50" />
          ~2 minute process
        </div>
      </div>
    </div>
  )
}
