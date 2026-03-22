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
  /** Wallet is fully ready (created/restored AND backup confirmed or auto-restored) */
  isConnected: boolean
  /** Wallet exists but backup not yet confirmed (first-time creation) */
  isPendingBackup: boolean
  /** Loading on mount (auto-restore attempt) */
  isLoading: boolean
  /** Wallet address */
  address: string | null
  /** Seed phrase — only available right after creation, cleared after backup confirm */
  seedPhrase: string | null
  /** Balances */
  accountInfo: WDKAccountInfo | null
  usdcDisplay: string
  ethDisplay: string
  /** Actions */
  createWallet: () => Promise<void>
  restoreWallet: (seed: string) => Promise<void>
  confirmBackup: () => void
  disconnect: () => void
  refreshBalances: () => Promise<void>
  error: string | null
  clearError: () => void
}

const WDKContext = createContext<WDKContextValue | null>(null)

// ── Provider ────────────────────────────────────────────────────────────────

export function WDKProvider({ children }: { children: ReactNode }) {
  const [isLoading, setIsLoading] = useState(true)
  const [walletState, setWalletState] = useState<WDKWalletState | null>(null)
  const [accountInfo, setAccountInfo] = useState<WDKAccountInfo | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Track if this is a fresh creation that needs backup confirmation
  const [pendingBackup, setPendingBackup] = useState(false)

  const operationInProgress = useRef(false)

  // Auto-restore on mount — if seed exists in localStorage, silently connect
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
          // Auto-restored = user already backed up seed before, no backup needed
          setPendingBackup(false)
          // Fetch balances silently
          const wdk = getWDKInstance()
          if (wdk) {
            try {
              const info = await getWDKAccountInfo(wdk)
              if (!cancelled) setAccountInfo(info)
            } catch {
              // non-critical
            }
          }
        }
      } catch {
        // auto-restore failure is not critical
      } finally {
        operationInProgress.current = false
        if (!cancelled) setIsLoading(false)
      }
    }

    autoRestore()
    return () => { cancelled = true }
  }, [])

  const createWallet = useCallback(async () => {
    if (operationInProgress.current) return
    operationInProgress.current = true
    setError(null)
    try {
      const state = await createWDKWallet()
      setWalletState(state)
      // Mark as pending backup — user must confirm they saved the seed
      setPendingBackup(true)
      // Try to fetch balances
      const wdk = getWDKInstance()
      if (wdk) {
        try {
          const info = await getWDKAccountInfo(wdk)
          setAccountInfo(info)
        } catch { /* non-critical */ }
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
      // Restored = user already has seed backed up, no backup needed
      setPendingBackup(false)
      const wdk = getWDKInstance()
      if (wdk) {
        try {
          const info = await getWDKAccountInfo(wdk)
          setAccountInfo(info)
        } catch { /* non-critical */ }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to restore wallet"
      setError(msg)
    } finally {
      operationInProgress.current = false
    }
  }, [])

  const confirmBackup = useCallback(() => {
    setPendingBackup(false)
  }, [])

  const disconnect = useCallback(() => {
    disposeWDK()
    clearStoredSeedPhrase()
    setWalletState(null)
    setAccountInfo(null)
    setError(null)
    setPendingBackup(false)
  }, [])

  const refreshBalances = useCallback(async () => {
    const wdk = getWDKInstance()
    if (!wdk) return
    try {
      const info = await getWDKAccountInfo(wdk)
      setAccountInfo(info)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to refresh")
    }
  }, [])

  const clearError = useCallback(() => setError(null), [])

  const hasWallet = walletState?.isInitialized ?? false

  const value: WDKContextValue = {
    isConnected: hasWallet && !pendingBackup,
    isPendingBackup: hasWallet && pendingBackup,
    isLoading,
    address: walletState?.address ?? null,
    seedPhrase: walletState?.seedPhrase ?? null,
    accountInfo,
    usdcDisplay: accountInfo ? formatUSDCBalance(accountInfo.usdcBalance) : "0.00",
    ethDisplay: accountInfo ? formatETHBalance(accountInfo.ethBalance) : "0.000",
    createWallet,
    restoreWallet,
    confirmBackup,
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
  if (!ctx) throw new Error("useWDK must be used within <WDKProvider>")
  return ctx
}
