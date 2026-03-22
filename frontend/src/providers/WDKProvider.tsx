import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from "react"
import type { WDKWalletState, WDKAccountInfo } from "@/lib/wdk"
import {
  tryAutoRestore,
  createWDKWallet,
  restoreWDKWallet,
  disposeWDK,
  clearStoredSeedPhrase,
  getWDKInstance,
  getWDKAccountInfo,
  formatUSDCBalance,
  formatETHBalance,
} from "@/lib/wdk"

// ── Context types ───────────────────────────────────────────────────────────

interface WDKContextValue {
  /** Whether WDK wallet is connected */
  isConnected: boolean
  /** Whether WDK is currently initializing (auto-restore on mount) */
  isLoading: boolean
  /** Wallet address if connected */
  address: string | null
  /** Seed phrase (visible only during creation flow) */
  seedPhrase: string | null
  /** Account info with balances */
  accountInfo: WDKAccountInfo | null
  /** Human-readable USDC balance */
  usdcDisplay: string
  /** Human-readable ETH balance */
  ethDisplay: string
  /** Create a brand-new WDK wallet */
  createWallet: () => Promise<void>
  /** Restore wallet from an existing seed phrase */
  restoreWallet: (seed: string) => Promise<void>
  /** Disconnect and wipe local state */
  disconnect: () => void
  /** Refresh balances */
  refreshBalances: () => Promise<void>
  /** Error message if something went wrong */
  error: string | null
  /** Clear error */
  clearError: () => void
}

const WDKContext = createContext<WDKContextValue | null>(null)

// ── Provider component ──────────────────────────────────────────────────────

export function WDKProvider({ children }: { children: ReactNode }) {
  const [isLoading, setIsLoading] = useState(true)
  const [walletState, setWalletState] = useState<WDKWalletState | null>(null)
  const [accountInfo, setAccountInfo] = useState<WDKAccountInfo | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Guard against race conditions between auto-restore and manual create/restore
  const operationInProgress = useRef(false)

  // Auto-restore on mount
  useEffect(() => {
    let cancelled = false

    async function autoRestore() {
      if (operationInProgress.current) {
        if (!cancelled) setIsLoading(false)
        return
      }
      operationInProgress.current = true
      try {
        const restored = await tryAutoRestore()
        if (!cancelled && restored) {
          setWalletState(restored)
          // Fetch balances in background
          const wdk = getWDKInstance()
          if (wdk) {
            try {
              const info = await getWDKAccountInfo(wdk)
              if (!cancelled) setAccountInfo(info)
            } catch {
              // Balance fetch can fail silently on initial load
            }
          }
        }
      } catch {
        // Auto-restore failure is not critical
      } finally {
        operationInProgress.current = false
        if (!cancelled) setIsLoading(false)
      }
    }

    autoRestore()
    return () => {
      cancelled = true
      // Cleanup WDK on unmount
      disposeWDK()
    }
  }, [])

  const createWallet = useCallback(async () => {
    if (operationInProgress.current) return
    operationInProgress.current = true
    setError(null)
    try {
      const state = await createWDKWallet()
      setWalletState(state)

      const wdk = getWDKInstance()
      if (wdk) {
        try {
          const info = await getWDKAccountInfo(wdk)
          setAccountInfo(info)
        } catch {
          // Balance fetch failure is non-critical
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to create wallet"
      setError(msg)
    } finally {
      operationInProgress.current = false
    }
  }, [])

  const restoreWallet = useCallback(async (seed: string) => {
    if (operationInProgress.current) return
    operationInProgress.current = true
    setError(null)
    try {
      const state = await restoreWDKWallet(seed)
      setWalletState(state)

      const wdk = getWDKInstance()
      if (wdk) {
        try {
          const info = await getWDKAccountInfo(wdk)
          setAccountInfo(info)
        } catch {
          // Balance fetch failure is non-critical
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to restore wallet"
      setError(msg)
    } finally {
      operationInProgress.current = false
    }
  }, [])

  const disconnect = useCallback(() => {
    disposeWDK()
    clearStoredSeedPhrase()
    setWalletState(null)
    setAccountInfo(null)
    setError(null)
  }, [])

  const refreshBalances = useCallback(async () => {
    const wdk = getWDKInstance()
    if (!wdk) return

    try {
      const info = await getWDKAccountInfo(wdk)
      setAccountInfo(info)
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to refresh balances"
      setError(msg)
    }
  }, [])

  const clearError = useCallback(() => setError(null), [])

  const value: WDKContextValue = {
    isConnected: walletState?.isInitialized ?? false,
    isLoading,
    address: walletState?.address ?? null,
    seedPhrase: walletState?.seedPhrase ?? null,
    accountInfo,
    usdcDisplay: accountInfo ? formatUSDCBalance(accountInfo.usdcBalance) : "0.00",
    ethDisplay: accountInfo ? formatETHBalance(accountInfo.ethBalance) : "0.000",
    createWallet,
    restoreWallet,
    disconnect,
    refreshBalances,
    error,
    clearError,
  }

  return <WDKContext.Provider value={value}>{children}</WDKContext.Provider>
}

// ── Hook ────────────────────────────────────────────────────────────────────

export function useWDK(): WDKContextValue {
  const ctx = useContext(WDKContext)
  if (!ctx) {
    throw new Error("useWDK must be used within a <WDKProvider>")
  }
  return ctx
}
