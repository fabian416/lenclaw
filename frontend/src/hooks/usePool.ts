import { MOCK_POOL_DATA } from "@/lib/constants"
import type { PoolData } from "@/lib/types"

// API endpoints (from PRODUCT_SPEC):
//   GET /pool/stats  -> { tvl, utilization_rate, active_agents, total_revenue, total_loans, default_rate }
//   GET /pool/apy    -> { senior_apy, junior_apy }
export function usePool(): { data: PoolData; isLoading: boolean } {
  // TODO: Wire to backend via @tanstack/react-query:
  // const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:8000"
  // const stats = useQuery({ queryKey: ['pool-stats'], queryFn: () => fetch(`${API_BASE}/pool/stats`).then(r => r.json()) })
  // const apy = useQuery({ queryKey: ['pool-apy'], queryFn: () => fetch(`${API_BASE}/pool/apy`).then(r => r.json()) })
  return {
    data: MOCK_POOL_DATA,
    isLoading: false,
  }
}
