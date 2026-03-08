import { useAccount, useChainId } from "wagmi"

const SUPPORTED_CHAIN_ID = 8453 // Base

export function WrongNetworkBanner() {
  const { isConnected } = useAccount()
  const chainId = useChainId()

  if (!isConnected || chainId === SUPPORTED_CHAIN_ID) return null

  return (
    <div className="bg-amber-500/10 border border-amber-500/30 text-amber-400 text-sm text-center py-2 px-4">
      Wrong network — please switch to Base
    </div>
  )
}
