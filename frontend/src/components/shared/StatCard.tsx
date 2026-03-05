import { motion } from "framer-motion"
import type { LucideIcon } from "lucide-react"
import { TrendingUp, TrendingDown } from "lucide-react"

interface StatCardProps {
  label: string
  value: string
  icon: LucideIcon
  sublabel?: string
  trend?: "up" | "down" | "neutral"
  delay?: number
}

export function StatCard({ label, value, icon: Icon, sublabel, trend, delay = 0 }: StatCardProps) {
  const trendColor = trend === "up" ? "text-emerald-600 dark:text-emerald-400" : trend === "down" ? "text-red-500" : "text-muted-foreground"
  const TrendIcon = trend === "up" ? TrendingUp : trend === "down" ? TrendingDown : null

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: delay * 0.06 }}
      className="rounded-lg border border-border bg-background p-4 md:p-5"
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs text-muted-foreground">{label}</span>
        <Icon className="w-4 h-4 text-muted-foreground" />
      </div>
      <div className="text-xl md:text-2xl font-semibold mono-text">{value}</div>
      {sublabel && (
        <div className={`text-xs mt-1 flex items-center gap-1 ${trendColor}`}>
          {TrendIcon && <TrendIcon className="w-3 h-3" />}
          {sublabel}
        </div>
      )}
    </motion.div>
  )
}
