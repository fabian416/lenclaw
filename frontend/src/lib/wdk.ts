// ============================================================================
// Tether WDK Integration — via WDK API Server
//
// WDK requires Node.js runtime (bare-node-runtime). The frontend calls a
// lightweight Node.js API server (wdk-api/) that runs WDK operations
// server-side and returns results over HTTP.
//
// NOTE: Seed phrase is stored in localStorage for hackathon demo purposes.
// In production, use secure enclave / biometric-gated storage.
// ============================================================================

// ── Constants ───────────────────────────────────────────────────────────────

const STORAGE_KEY = "lenclaw_wdk_seed"
const WDK_API_BASE = import.meta.env.VITE_WDK_API_URL || ""

/** USDT on Base */
const USDT_ADDRESS = "0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2"
const BASE_CHAIN_ID = 8453
const BASE_RPC = "https://mainnet.base.org"

// ── Types ───────────────────────────────────────────────────────────────────

export interface WDKWalletState {
  address: string
  seedPhrase: string
  isInitialized: boolean
}

export interface WDKAccountInfo {
  address: string
  ethBalance: bigint
  usdtBalance: bigint
}

// ── API helpers ─────────────────────────────────────────────────────────────

async function wdkFetch<T>(path: string, body?: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${WDK_API_BASE}${path}`, {
    method: body ? "POST" : "GET",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })

  const data = await res.json()

  if (!res.ok) {
    throw new Error(data.error || `WDK API error: ${res.status}`)
  }

  return data as T
}

// ── Seed phrase management ──────────────────────────────────────────────────

export function storeSeedPhrase(seed: string): void {
  localStorage.setItem(STORAGE_KEY, seed)
}

export function getStoredSeedPhrase(): string | null {
  return localStorage.getItem(STORAGE_KEY)
}

export function clearStoredSeedPhrase(): void {
  localStorage.removeItem(STORAGE_KEY)
}

// ── Wallet operations (via API) ─────────────────────────────────────────────

export async function isWDKAvailable(): Promise<boolean> {
  try {
    await wdkFetch<{ status: string }>("/api/wdk/health")
    return true
  } catch {
    return false
  }
}

export async function isValidSeedPhrase(seed: string): Promise<boolean> {
  try {
    const { valid } = await wdkFetch<{ valid: boolean }>("/api/wdk/validate", { seedPhrase: seed })
    return valid
  } catch {
    // Fallback: basic word count check
    const words = seed.trim().split(/\s+/)
    return words.length === 12 || words.length === 24
  }
}

export async function createWDKWallet(): Promise<WDKWalletState> {
  const { address, seedPhrase } = await wdkFetch<{ address: string; seedPhrase: string }>("/api/wdk/create", {})
  storeSeedPhrase(seedPhrase)
  return { address, seedPhrase, isInitialized: true }
}

export async function restoreWDKWallet(seedPhrase: string): Promise<WDKWalletState> {
  const { address } = await wdkFetch<{ address: string }>("/api/wdk/restore", { seedPhrase })
  storeSeedPhrase(seedPhrase)
  return { address, seedPhrase, isInitialized: true }
}

export async function tryAutoRestore(): Promise<WDKWalletState | null> {
  const stored = getStoredSeedPhrase()
  if (!stored) return null

  try {
    return await restoreWDKWallet(stored)
  } catch {
    clearStoredSeedPhrase()
    return null
  }
}

// ── Account info (via API) ──────────────────────────────────────────────────

export async function getWDKAccountInfo(_wdk?: unknown, _index?: number): Promise<WDKAccountInfo> {
  const seedPhrase = getStoredSeedPhrase()
  if (!seedPhrase) throw new Error("No wallet connected")

  const data = await wdkFetch<{ address: string; ethBalance: string; usdtBalance: string }>(
    "/api/wdk/balance",
    { seedPhrase }
  )

  return {
    address: data.address,
    ethBalance: BigInt(data.ethBalance),
    usdtBalance: BigInt(data.usdtBalance),
  }
}

// ── Instance management (no-ops — WDK runs server-side) ─────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getWDKInstance(): any {
  // WDK runs server-side; return a truthy marker so provider calls getWDKAccountInfo
  return getStoredSeedPhrase() ? { _serverSide: true } : null
}

export function disposeWDK(): void {
  // No-op: WDK instances live on the API server
}

// ── Balance formatting ──────────────────────────────────────────────────────

export function formatUSDTBalance(balance: bigint): string {
  const whole = balance / 1_000_000n
  const fraction = balance % 1_000_000n
  const fractionStr = fraction.toString().padStart(6, "0").slice(0, 2)
  return `${whole.toLocaleString()}.${fractionStr}`
}

export function formatETHBalance(balance: bigint): string {
  const whole = balance / 1_000_000_000_000_000_000n
  const fraction = (balance % 1_000_000_000_000_000_000n) / 1_000_000_000_000_000n
  return `${whole}.${fraction.toString().padStart(3, "0")}`
}

export { USDT_ADDRESS, BASE_CHAIN_ID, BASE_RPC }
