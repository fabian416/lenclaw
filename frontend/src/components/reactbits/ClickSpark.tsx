import { useState, useCallback, type ReactNode, type MouseEvent } from "react"

interface Spark {
  id: number
  x: number
  y: number
  tx: number
  ty: number
}

interface ClickSparkProps {
  children: ReactNode
  sparkColor?: string
  sparkCount?: number
}

export function ClickSpark({
  children,
  sparkColor = "#14f195",
  sparkCount = 8,
}: ClickSparkProps) {
  const [sparks, setSparks] = useState<Spark[]>([])

  const handleClick = useCallback(
    (e: MouseEvent<HTMLDivElement>) => {
      const rect = e.currentTarget.getBoundingClientRect()
      const x = e.clientX - rect.left
      const y = e.clientY - rect.top
      const radius = 28

      const newSparks = Array.from({ length: sparkCount }, (_, i) => {
        const angle = ((360 / sparkCount) * i * Math.PI) / 180
        return {
          id: Date.now() + i,
          x,
          y,
          tx: Math.cos(angle) * radius,
          ty: Math.sin(angle) * radius,
        }
      })

      setSparks((prev) => [...prev, ...newSparks])
      setTimeout(() => {
        setSparks((prev) => prev.filter((s) => !newSparks.includes(s)))
      }, 600)
    },
    [sparkCount]
  )

  return (
    <div className="relative" onClick={handleClick}>
      {children}
      {sparks.map((spark) => (
        <span
          key={spark.id}
          className="absolute pointer-events-none rounded-full"
          style={{
            left: spark.x,
            top: spark.y,
            width: 4,
            height: 4,
            backgroundColor: sparkColor,
            "--spark-tx": `${spark.tx}px`,
            "--spark-ty": `${spark.ty}px`,
            animation: "spark-fly 0.5s ease-out forwards",
          } as React.CSSProperties}
        />
      ))}
      <style>{`
        @keyframes spark-fly {
          0% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
          100% { opacity: 0; transform: translate(calc(-50% + var(--spark-tx)), calc(-50% + var(--spark-ty))) scale(0); }
        }
      `}</style>
    </div>
  )
}
