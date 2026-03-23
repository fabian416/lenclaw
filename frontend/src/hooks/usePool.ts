import { MOCK_POOL_DATA } from "@/lib/constants"
import type { PoolData } from "@/lib/types"

// API endpoints:
//   GET /pool/stats  -> { tvl, utilization_rate, active_agents, total_revenue, total_loans, default_rate }
//   GET /pool/apy    -> { apy }
export function usePool(): { data: PoolData; isLoading: boolean } {
  // Returns mock data for demo — production implementation reads from backend API:
  // const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:8000"
  // const stats = useQuery({ queryKey: ['pool-stats'], queryFn: () => fetch(`${API_BASE}/pool/stats`).then(r => r.json()) })
  // const apy = useQuery({ queryKey: ['pool-apy'], queryFn: () => fetch(`${API_BASE}/pool/apy`).then(r => r.json()) })
  return {
    data: MOCK_POOL_DATA,
    isLoading: false,
  }
}
