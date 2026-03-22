import { WagmiProvider as WagmiProviderBase } from "wagmi"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { http, createConfig } from "wagmi"
import { base, baseSepolia } from "viem/chains"
import { injected } from "wagmi/connectors"
import { WDKProvider } from "@/providers/WDKProvider"
import type { ReactNode } from "react"

const config = createConfig({
  chains: [base, baseSepolia],
  connectors: [injected()],
  transports: {
    [base.id]: http(),
    [baseSepolia.id]: http(),
  },
})

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 2,
    },
  },
})

export function WalletProvider({ children }: { children: ReactNode }) {
  return (
    <WagmiProviderBase config={config}>
      <QueryClientProvider client={queryClient}>
        <WDKProvider>
          {children}
        </WDKProvider>
      </QueryClientProvider>
    </WagmiProviderBase>
  )
}

export { config as wagmiConfig }
