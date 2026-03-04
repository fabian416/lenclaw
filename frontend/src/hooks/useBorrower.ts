import { MOCK_BORROWER } from "@/lib/constants"
import type { BorrowerData } from "@/lib/types"

// API endpoints (from PRODUCT_SPEC):
//   GET  /agents/{id}/credit       -> Credit line info (available_credit, outstanding_debt, interest_rate)
//   GET  /agents/{id}/revenue      -> Revenue flowing through RevenueLockbox
//   POST /agents/{id}/credit/draw  -> Draw down from credit line
//   POST /agents/{id}/credit/repay -> Manual repayment
// Auth: SIWE via POST /auth/siwe/nonce + POST /auth/siwe/verify -> JWT
export function useBorrower(): { data: BorrowerData; isLoading: boolean } {
  // TODO: Wire to backend via @tanstack/react-query:
  // const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:8000"
  // const { data } = useQuery({ queryKey: ['borrower', agentId], queryFn: () => fetch(`${API_BASE}/agents/${agentId}/credit`, { headers: { Authorization: `Bearer ${jwt}` } }).then(r => r.json()) })
  return {
    data: MOCK_BORROWER,
    isLoading: false,
  }
}
