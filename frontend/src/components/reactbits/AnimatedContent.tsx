import { useRef, type ReactNode } from "react"
import { motion, useInView } from "framer-motion"

interface AnimatedContentProps {
  children: ReactNode
  direction?: "up" | "down" | "left" | "right"
  delay?: number
  distance?: number
  className?: string
}

const directionMap = {
  up: { x: 0, y: 1 },
  down: { x: 0, y: -1 },
  left: { x: 1, y: 0 },
  right: { x: -1, y: 0 },
}

export function AnimatedContent({
  children,
  direction = "up",
  delay = 0,
  distance = 24,
  className = "",
}: AnimatedContentProps) {
  const ref = useRef<HTMLDivElement>(null)
  const isInView = useInView(ref, { once: true, margin: "-60px" })

  const dir = directionMap[direction]

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, x: dir.x * distance, y: dir.y * distance }}
      animate={
        isInView
          ? { opacity: 1, x: 0, y: 0 }
          : { opacity: 0, x: dir.x * distance, y: dir.y * distance }
      }
      transition={{ duration: 0.5, delay, ease: [0.25, 0.4, 0.25, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  )
}
