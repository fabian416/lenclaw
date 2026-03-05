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
      const distance = 28

      const newSparks = Array.from({ length: sparkCount }, (_, i) => {
        const angle = (i / sparkCount) * 2 * Math.PI
        return {
          id: Date.now() + i,
          x,
          y,
          tx: Math.cos(angle) * distance,
          ty: Math.sin(angle) * distance,
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
            "--tx": `${spark.tx}px`,
            "--ty": `${spark.ty}px`,
            animation: "spark-fly 0.5s ease-out forwards",
          } as React.CSSProperties}
        />
      ))}
    </div>
  )
}
