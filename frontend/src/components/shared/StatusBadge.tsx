import { Badge } from "@/components/ui/badge"
import type { AgentStatus } from "@/lib/types"

const statusConfig: Record<AgentStatus, { label: string; variant: "success" | "warning" | "danger" }> = {
  active: { label: "Active", variant: "success" },
  delinquent: { label: "Delinquent", variant: "warning" },
  default: { label: "Default", variant: "danger" },
  none: { label: "Uninitialized", variant: "warning" },
}

export function StatusBadge({ status }: { status: AgentStatus }) {
  const config = statusConfig[status]
  return (
    <Badge variant={config.variant} className="mono-text text-[10px] uppercase tracking-wider">
      {config.label}
    </Badge>
  )
}
