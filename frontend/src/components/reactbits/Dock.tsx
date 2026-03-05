import { useRef, useState, type ReactNode } from "react"
import { motion, useMotionValue, useSpring, useTransform } from "framer-motion"

interface DockItem {
  icon: ReactNode
  label: string
  onClick?: () => void
  isActive?: boolean
}

interface DockProps {
  items: DockItem[]
  className?: string
}

function DockIcon({ item, mouseX }: { item: DockItem; mouseX: ReturnType<typeof useMotionValue<number>> }) {
  const ref = useRef<HTMLButtonElement>(null)

  const distance = useTransform(mouseX, (val: number) => {
    const el = ref.current
    if (!el) return 150
    const rect = el.getBoundingClientRect()
    return val - rect.left - rect.width / 2
  })

  const scale = useTransform(distance, [-100, 0, 100], [1, 1.35, 1])
  const springScale = useSpring(scale, { stiffness: 300, damping: 25 })

  return (
    <motion.button
      ref={ref}
      onClick={item.onClick}
      style={{ scale: springScale }}
      className={`relative flex flex-col items-center justify-center gap-0.5 flex-1 min-h-[44px] transition-colors ${
        item.isActive ? "text-[#14f195]" : "text-white/40"
      }`}
    >
      {item.isActive && (
        <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 rounded-full bg-[#14f195]" />
      )}
      <span className="w-5 h-5 flex items-center justify-center">{item.icon}</span>
      <span className="text-[10px] font-medium">{item.label}</span>
    </motion.button>
  )
}

export function Dock({ items, className = "" }: DockProps) {
  const mouseX = useMotionValue(Infinity)
  const [, setHovering] = useState(false)

  return (
    <motion.div
      onMouseMove={(e) => mouseX.set(e.clientX)}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => { mouseX.set(Infinity); setHovering(false) }}
      className={`flex items-stretch justify-around h-16 max-w-lg mx-auto ${className}`}
    >
      {items.map((item, i) => (
        <DockIcon key={i} item={item} mouseX={mouseX} />
      ))}
    </motion.div>
  )
}
