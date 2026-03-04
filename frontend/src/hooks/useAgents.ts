import { MOCK_AGENTS } from "@/lib/constants"
import type { Agent } from "@/lib/types"

// API endpoints (from PRODUCT_SPEC):
//   GET  /agents             -> List all registered agents (paginated)
//   POST /agents             -> Register a new agent
//   GET  /agents/{id}        -> Get agent details
//   GET  /agents/{id}/revenue -> Agent revenue history
//   GET  /agents/{id}/credit  -> Agent credit line info
//   GET  /agents/{id}/health  -> Agent health status and alerts
export function useAgents(): { data: Agent[]; isLoading: boolean } {
  // TODO: Wire to backend via @tanstack/react-query:
  // const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:8000"
  // const { data } = useQuery({ queryKey: ['agents'], queryFn: () => fetch(`${API_BASE}/agents`).then(r => r.json()) })
  return {
    data: MOCK_AGENTS,
    isLoading: false,
  }
}
