import { useRef, useState, type ReactNode, type MouseEvent } from "react"

interface SpotlightCardProps {
  children: ReactNode
  className?: string
  spotlightColor?: string
}

export function SpotlightCard({
  children,
  className = "",
  spotlightColor = "rgba(20,241,149,0.08)",
}: SpotlightCardProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ x: 0, y: 0 })
  const [isHovering, setIsHovering] = useState(false)

  const handleMouseMove = (e: MouseEvent<HTMLDivElement>) => {
    if (!ref.current) return
    const rect = ref.current.getBoundingClientRect()
    setPos({ x: e.clientX - rect.left, y: e.clientY - rect.top })
  }

  return (
    <div
      ref={ref}
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
      className={`relative overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.03] transition-all ${className}`}
      style={{
        background: isHovering
          ? `radial-gradient(300px circle at ${pos.x}px ${pos.y}px, ${spotlightColor}, transparent 60%), rgba(255,255,255,0.03)`
          : undefined,
      }}
    >
      {children}
    </div>
  )
}
