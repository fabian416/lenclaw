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
  primary: "bg-foreground",
  success: "bg-emerald-600 dark:bg-emerald-500",
  warning: "bg-amber-600 dark:bg-amber-500",
  danger: "bg-red-600 dark:bg-red-500",
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
    <div className={cn("w-full h-1.5 bg-muted rounded-full overflow-hidden", className)}>
      <motion.div
        className={cn("h-full rounded-full", colorMap[autoColor])}
        initial={animated ? { width: 0 } : undefined}
        animate={shouldAnimate ? { width: `${percent}%` } : undefined}
        transition={{ duration: 0.8, ease: [0.4, 0, 0.2, 1] }}
        style={!animated ? { width: `${percent}%` } : undefined}
      />
    </div>
  )
}
