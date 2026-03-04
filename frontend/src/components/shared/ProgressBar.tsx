import { useEffect, useState } from "react"
import { motion } from "framer-motion"
import { cn } from "@/lib/utils"

interface ProgressBarProps {
  value: number
  max?: number
  className?: string
  color?: "primary" | "success" | "warning" | "danger"
  animated?: boolean
}

const colorMap = {
  primary: "from-violet-500 to-purple-500",
  success: "from-emerald-500 to-emerald-400",
  warning: "from-amber-500 to-amber-400",
  danger: "from-red-500 to-red-400",
}

const glowMap = {
  primary: "shadow-[0_0_8px_rgba(139,92,246,0.4)]",
  success: "shadow-[0_0_8px_rgba(16,185,129,0.4)]",
  warning: "shadow-[0_0_8px_rgba(245,158,11,0.4)]",
  danger: "shadow-[0_0_8px_rgba(239,68,68,0.4)]",
}

export function ProgressBar({ value, max = 100, className, color = "primary", animated = true }: ProgressBarProps) {
  const percent = Math.min(Math.max((value / max) * 100, 0), 100)
  const autoColor = percent > 90 ? "danger" : percent > 75 ? "warning" : color
  const [shouldAnimate, setShouldAnimate] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setShouldAnimate(true), 100)
    return () => clearTimeout(t)
  }, [])

  return (
    <div className={cn("w-full h-2 bg-muted/50 rounded-full overflow-hidden relative", className)}>
      <motion.div
        className={cn(
          "h-full rounded-full bg-gradient-to-r relative",
          colorMap[autoColor],
          glowMap[autoColor]
        )}
        initial={animated ? { width: 0 } : undefined}
        animate={shouldAnimate ? { width: `${percent}%` } : undefined}
        transition={{ duration: 1, ease: [0.4, 0, 0.2, 1] }}
        style={!animated ? { width: `${percent}%` } : undefined}
      >
        {/* Shimmer effect */}
        <div className="absolute inset-0 overflow-hidden rounded-full">
          <div
            className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full"
            style={{ animation: "shimmer 2s ease-in-out infinite" }}
          />
        </div>
      </motion.div>
    </div>
  )
}
