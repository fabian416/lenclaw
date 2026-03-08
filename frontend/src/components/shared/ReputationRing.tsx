import { motion } from "framer-motion"

interface ReputationRingProps {
  score: number
  size?: number
  strokeWidth?: number
  animated?: boolean
}

function getColor(score: number): string {
  if (score >= 90) return "var(--success)"
  if (score >= 70) return "var(--primary)"
  if (score >= 50) return "var(--warning)"
  return "var(--destructive)"
}

function getStrokeClass(score: number): string {
  if (score >= 90) return "stroke-success"
  if (score >= 70) return "stroke-primary"
  if (score >= 50) return "stroke-warning"
  return "stroke-destructive"
}

export function ReputationRing({ score, size = 40, strokeWidth = 3, animated = true }: ReputationRingProps) {
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const percent = Math.min(Math.max(score, 0), 100)
  const offset = circumference - (percent / 100) * circumference

  // Determine font size based on ring size
  const fontSize = size <= 44 ? 10 : 14

  return (
    <div
      className="relative inline-flex items-center justify-center flex-shrink-0"
      style={{ width: size, height: size }}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="-rotate-90"
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          className="text-border"
          strokeWidth={strokeWidth}
        />
        {animated ? (
          <motion.circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={getColor(percent)}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset: offset }}
            transition={{ duration: 1, ease: [0.4, 0, 0.2, 1] }}
          />
        ) : (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            className={getStrokeClass(percent)}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
          />
        )}
      </svg>
      <span
        className="absolute inset-0 flex items-center justify-center font-bold mono-text text-foreground"
        style={{ fontSize }}
      >
        {score}
      </span>
    </div>
  )
}
