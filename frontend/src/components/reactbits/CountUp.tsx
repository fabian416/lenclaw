import { useEffect, useRef, useState } from "react"
import { useInView } from "framer-motion"

interface CountUpProps {
  /** Target number to count up to */
  target: number
  /** Duration in seconds */
  duration?: number
  /** Prefix string (e.g. "$") */
  prefix?: string
  /** Suffix string (e.g. "%") */
  suffix?: string
  /** Number of decimal places */
  decimals?: number
  /** Additional class names */
  className?: string
  /** Separator for thousands */
  separator?: string
}

function easeOutExpo(t: number): number {
  return t === 1 ? 1 : 1 - Math.pow(2, -10 * t)
}

function formatNumber(n: number, decimals: number, separator: string): string {
  const fixed = n.toFixed(decimals)
  const [intPart, decPart] = fixed.split(".")
  const withSeparator = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, separator)
  return decPart ? `${withSeparator}.${decPart}` : withSeparator
}

export function CountUp({
  target,
  duration = 2,
  prefix = "",
  suffix = "",
  decimals = 0,
  className = "",
  separator = ",",
}: CountUpProps) {
  const ref = useRef<HTMLSpanElement>(null)
  const isInView = useInView(ref, { once: true, margin: "-50px" })
  const [current, setCurrent] = useState(0)

  useEffect(() => {
    if (!isInView) return

    let startTime: number | null = null
    let rafId: number

    function tick(timestamp: number) {
      if (!startTime) startTime = timestamp
      const elapsed = (timestamp - startTime) / 1000
      const progress = Math.min(elapsed / duration, 1)
      const eased = easeOutExpo(progress)

      setCurrent(eased * target)

      if (progress < 1) {
        rafId = requestAnimationFrame(tick)
      } else {
        setCurrent(target)
      }
    }

    rafId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafId)
  }, [isInView, target, duration])

  return (
    <span ref={ref} className={className}>
      {prefix}{formatNumber(current, decimals, separator)}{suffix}
    </span>
  )
}
