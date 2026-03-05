import { useMemo } from "react"

interface SquaresProps {
  squareSize?: number
  speed?: number
  borderColor?: string
  className?: string
}

export function Squares({
  squareSize = 60,
  speed = 20,
  borderColor = "rgba(20,241,149,0.08)",
  className = "",
}: SquaresProps) {
  const squares = useMemo(
    () =>
      Array.from({ length: 12 }, (_, i) => ({
        id: i,
        x: Math.random() * 100,
        y: Math.random() * 100,
        delay: Math.random() * speed,
        opacity: 0.03 + Math.random() * 0.06,
      })),
    [speed]
  )

  return (
    <div className={`absolute inset-0 overflow-hidden pointer-events-none z-0 ${className}`}>
      {/* Grid lines */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: `linear-gradient(${borderColor} 1px, transparent 1px), linear-gradient(90deg, ${borderColor} 1px, transparent 1px)`,
          backgroundSize: `${squareSize}px ${squareSize}px`,
        }}
      />
      {/* Floating accent squares */}
      {squares.map((sq) => (
        <div
          key={sq.id}
          className="absolute rounded-sm"
          style={{
            width: squareSize * 0.6,
            height: squareSize * 0.6,
            left: `${sq.x}%`,
            top: `${sq.y}%`,
            border: `1px solid ${borderColor}`,
            opacity: sq.opacity,
            animation: `sq-drift ${speed + sq.delay}s ease-in-out infinite alternate`,
          }}
        />
      ))}
    </div>
  )
}
