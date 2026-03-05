import { useRef, type ReactNode } from "react"
import { motion, useInView } from "framer-motion"

interface ScrollFloatProps {
  children: ReactNode
  delay?: number
  className?: string
}

export function ScrollFloat({
  children,
  delay = 0,
  className = "",
}: ScrollFloatProps) {
  const ref = useRef<HTMLDivElement>(null)
  const isInView = useInView(ref, { once: true, margin: "-60px" })

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 20 }}
      animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
      transition={{ duration: 0.5, delay, ease: [0.25, 0.4, 0.25, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  )
}
