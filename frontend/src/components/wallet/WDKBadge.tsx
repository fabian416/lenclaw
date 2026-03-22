import { Shield } from "lucide-react"

interface WDKBadgeProps {
  className?: string
  /** Compact variant shows just the icon + text, no border */
  compact?: boolean
}

export function WDKBadge({ className = "", compact = false }: WDKBadgeProps) {
  if (compact) {
    return (
      <span className={`inline-flex items-center gap-1 text-[10px] text-teal-600 dark:text-teal-400 font-medium ${className}`}>
        <Shield className="w-3 h-3" />
        Tether WDK
      </span>
    )
  }

  return (
    <div className={`flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-md bg-teal-500/[0.06] border border-teal-500/15 ${className}`}>
      <Shield className="w-3 h-3 text-teal-500" />
      <span className="text-[10px] text-teal-600 dark:text-teal-400 font-medium tracking-wide">
        Powered by Tether WDK
      </span>
    </div>
  )
}
