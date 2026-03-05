import { type ReactNode } from "react"

interface StarBorderProps {
  children: ReactNode
  color?: string
  speed?: number
  className?: string
}

export function StarBorder({
  children,
  color = "#14f195",
  speed = 4,
  className = "",
}: StarBorderProps) {
  return (
    <div className={`relative rounded-xl ${className}`}>
      <div
        className="absolute -inset-px rounded-xl overflow-hidden"
        style={{ padding: "1px" }}
      >
        <div
          className="absolute inset-0"
          style={{
            background: `conic-gradient(from 0deg, transparent 0%, ${color} 10%, transparent 20%)`,
            animation: `star-rotate ${speed}s linear infinite`,
          }}
        />
        <div className="absolute inset-px rounded-xl bg-[#0a0a0a]" />
      </div>
      <div className="relative">{children}</div>
      <style>{`
        @keyframes star-rotate {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}
