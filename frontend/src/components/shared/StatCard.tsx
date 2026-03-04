import type { LucideIcon } from "lucide-react"

interface StatCardProps {
  label: string
  value: string
  icon: LucideIcon
  sublabel?: string
  trend?: "up" | "down" | "neutral"
}

export function StatCard({ label, value, icon: Icon, sublabel, trend }: StatCardProps) {
  const trendColor = trend === "up" ? "text-emerald-400" : trend === "down" ? "text-red-400" : "text-muted-foreground"

  return (
    <div className="data-card rounded-xl p-5 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-xs mono-text text-muted-foreground uppercase tracking-wider">{label}</span>
        <Icon className="w-4 h-4 text-primary/60" />
      </div>
      <div className="flex items-end gap-2">
        <span className="text-2xl font-bold mono-text text-foreground">{value}</span>
        {sublabel && (
          <span className={`text-xs mono-text ${trendColor} pb-0.5`}>{sublabel}</span>
        )}
      </div>
    </div>
  )
}
