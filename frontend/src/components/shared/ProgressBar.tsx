import { cn } from "@/lib/utils"

interface ProgressBarProps {
  value: number
  max?: number
  className?: string
  color?: "primary" | "success" | "warning" | "danger"
}

const colorMap = {
  primary: "bg-primary",
  success: "bg-emerald-500",
  warning: "bg-amber-500",
  danger: "bg-red-500",
}

export function ProgressBar({ value, max = 100, className, color = "primary" }: ProgressBarProps) {
  const percent = Math.min(Math.max((value / max) * 100, 0), 100)
  const autoColor = percent > 90 ? "danger" : percent > 75 ? "warning" : color

  return (
    <div className={cn("w-full h-2 bg-muted rounded-full overflow-hidden", className)}>
      <div
        className={cn("h-full rounded-full transition-all duration-500", colorMap[autoColor])}
        style={{ width: `${percent}%` }}
      />
    </div>
  )
}
