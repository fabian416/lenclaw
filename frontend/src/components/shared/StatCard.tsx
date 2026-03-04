import { useEffect, useRef, useState } from "react"
import { motion } from "framer-motion"
import type { LucideIcon } from "lucide-react"
import { TrendingUp, TrendingDown, Minus } from "lucide-react"

interface StatCardProps {
  label: string
  value: string
  icon: LucideIcon
  sublabel?: string
  trend?: "up" | "down" | "neutral"
  delay?: number
}

function AnimatedNumber({ value }: { value: string }) {
  const [displayed, setDisplayed] = useState(value)
  const prevRef = useRef(value)

  useEffect(() => {
    // Try to extract a number for animation
    const numMatch = value.match(/[\d,.]+/)
    if (!numMatch) {
      setDisplayed(value)
      return
    }

    const targetNum = parseFloat(numMatch[0].replace(/,/g, ""))
    if (isNaN(targetNum)) {
      setDisplayed(value)
      return
    }

    const prefix = value.slice(0, numMatch.index)
    const suffix = value.slice((numMatch.index ?? 0) + numMatch[0].length)
    const hasDecimals = numMatch[0].includes(".")
    const decimalPlaces = hasDecimals ? (numMatch[0].split(".")[1]?.length ?? 0) : 0

    let startNum = 0
    const prevMatch = prevRef.current.match(/[\d,.]+/)
    if (prevMatch) {
      startNum = parseFloat(prevMatch[0].replace(/,/g, ""))
      if (isNaN(startNum)) startNum = 0
    }

    const duration = 800
    const startTime = Date.now()

    const animate = () => {
      const elapsed = Date.now() - startTime
      const progress = Math.min(elapsed / duration, 1)
      // easeOutExpo
      const eased = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress)
      const current = startNum + (targetNum - startNum) * eased

      const formatted = current.toLocaleString("en-US", {
        minimumFractionDigits: decimalPlaces,
        maximumFractionDigits: decimalPlaces,
      })
      setDisplayed(`${prefix}${formatted}${suffix}`)

      if (progress < 1) {
        requestAnimationFrame(animate)
      }
    }

    requestAnimationFrame(animate)
    prevRef.current = value
  }, [value])

  return <>{displayed}</>
}

export function StatCard({ label, value, icon: Icon, sublabel, trend, delay = 0 }: StatCardProps) {
  const trendColor = trend === "up" ? "text-emerald-400" : trend === "down" ? "text-red-400" : "text-muted-foreground"
  const TrendIcon = trend === "up" ? TrendingUp : trend === "down" ? TrendingDown : Minus

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: delay * 0.1, ease: [0.4, 0, 0.2, 1] }}
      whileHover={{ y: -4, transition: { duration: 0.2 } }}
      className="data-card rounded-xl p-5 flex flex-col gap-3 group cursor-default"
    >
      <div className="flex items-center justify-between">
        <span className="text-xs mono-text text-muted-foreground uppercase tracking-wider">{label}</span>
        <motion.div
          className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500/20 to-purple-600/10 flex items-center justify-center"
          whileHover={{ scale: 1.1, rotate: 5 }}
          transition={{ type: "spring", stiffness: 300 }}
        >
          <Icon className="w-4 h-4 text-primary" />
        </motion.div>
      </div>
      <div className="flex items-end gap-2">
        <span className="text-2xl font-bold mono-text text-foreground">
          <AnimatedNumber value={value} />
        </span>
        {sublabel && trend && (
          <span className={`text-xs mono-text ${trendColor} pb-0.5 flex items-center gap-0.5`}>
            <TrendIcon className="w-3 h-3" />
            {sublabel}
          </span>
        )}
        {sublabel && !trend && (
          <span className="text-xs mono-text text-muted-foreground pb-0.5">{sublabel}</span>
        )}
      </div>
      {/* Mini sparkline placeholder */}
      <div className="flex items-end gap-[2px] h-4 opacity-40 group-hover:opacity-70 transition-opacity">
        {[3, 5, 4, 7, 6, 8, 5, 9, 7, 10, 8, 11].map((h, i) => (
          <motion.div
            key={i}
            className="flex-1 rounded-sm bg-gradient-to-t from-violet-500/60 to-purple-400/30"
            initial={{ height: 0 }}
            animate={{ height: `${h * 10}%` }}
            transition={{ duration: 0.5, delay: delay * 0.1 + i * 0.03, ease: "easeOut" }}
          />
        ))}
      </div>
    </motion.div>
  )
}
