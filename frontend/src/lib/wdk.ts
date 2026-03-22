// ============================================================================
// Tether WDK Integration
//
// Self-custodial wallet SDK powered by Tether WDK.
// Generates BIP39 seed phrases, manages keys locally in the browser.
// Supports ERC-4337 Account Abstraction and ERC-7702 delegation.
//
// NOTE: Seed phrase is stored in localStorage for hackathon demo purposes.
// In production, use secure enclave / biometric-gated storage.
// ============================================================================

import WDK from "@tetherto/wdk"
import WalletManagerEvm from "@tetherto/wdk-wallet-evm"

// ── Constants ───────────────────────────────────────────────────────────────

const STORAGE_KEY = "lenclaw_wdk_seed"
const BASE_RPC = "https://mainnet.base.org"
const BASE_CHAIN_ID = 8453

/** USDC on Base */
const USDC_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"

// ── Types ───────────────────────────────────────────────────────────────────

export interface WDKWalletState {
  address: string
  seedPhrase: string
  isInitialized: boolean
}

export interface WDKAccountInfo {
  address: string
  ethBalance: bigint
  usdcBalance: bigint
}

// ── Seed phrase management ──────────────────────────────────────────────────

export function generateSeedPhrase(): string {
  return WDK.getRandomSeedPhrase()
}

export function isValidSeedPhrase(seed: string): boolean {
  return WDK.isValidSeed(seed)
}

export function storeSeedPhrase(seed: string): void {
  localStorage.setItem(STORAGE_KEY, seed)
}

export function getStoredSeedPhrase(): string | null {
  return localStorage.getItem(STORAGE_KEY)
}

export function clearStoredSeedPhrase(): void {
  localStorage.removeItem(STORAGE_KEY)
}

// ── WDK instance management ────────────────────────────────────────────────

let _wdkInstance: InstanceType<typeof WDK> | null = null

export function initializeWDK(seedPhrase: string): InstanceType<typeof WDK> {
  if (_wdkInstance) {
    _wdkInstance.dispose()
  }

  const wdk = new WDK(seedPhrase)

  // EvmWalletConfig.provider accepts string URL or Eip1193Provider
  wdk.registerWallet("base", WalletManagerEvm, {
    provider: BASE_RPC,
  })

  _wdkInstance = wdk
  return wdk
}

export function getWDKInstance(): InstanceType<typeof WDK> | null {
  return _wdkInstance
}

export function disposeWDK(): void {
  if (_wdkInstance) {
    _wdkInstance.dispose()
    _wdkInstance = null
  }
}

// ── Account helpers ─────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getWDKAccount(wdk: InstanceType<typeof WDK>, index = 0): Promise<any> {
  return await wdk.getAccount("base", index)
}

export async function getWDKAddress(wdk: InstanceType<typeof WDK>, index = 0): Promise<string> {
  const account = await getWDKAccount(wdk, index)
  // WDK EVM accounts expose .address as a getter (from WalletAccountReadOnlyEvm)
  return await account.getAddress()
}

export async function getWDKAccountInfo(wdk: InstanceType<typeof WDK>, index = 0): Promise<WDKAccountInfo> {
  const account = await getWDKAccount(wdk, index)
  const address: string = await account.getAddress()

  let ethBalance = 0n
  let usdcBalance = 0n

  try {
    ethBalance = await account.getBalance()
  } catch {
    // Provider may not be available; default to 0
  }

  try {
    usdcBalance = await account.getTokenBalance(USDC_ADDRESS)
  } catch {
    // Provider may not be available; default to 0
  }

  return { address, ethBalance, usdcBalance }
}

// ── Convenience: create a new wallet from scratch ───────────────────────────

export async function createWDKWallet(): Promise<WDKWalletState> {
  const seedPhrase = generateSeedPhrase()
  storeSeedPhrase(seedPhrase)

  const wdk = initializeWDK(seedPhrase)
  const address = await getWDKAddress(wdk)

  return { address, seedPhrase, isInitialized: true }
}

// ── Convenience: restore wallet from seed phrase ────────────────────────────

export async function restoreWDKWallet(seedPhrase: string): Promise<WDKWalletState> {
  if (!isValidSeedPhrase(seedPhrase)) {
    throw new Error("Invalid seed phrase")
  }

  storeSeedPhrase(seedPhrase)
  const wdk = initializeWDK(seedPhrase)
  const address = await getWDKAddress(wdk)

  return { address, seedPhrase, isInitialized: true }
}

// ── Convenience: try to restore from localStorage on page load ──────────────

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

// ── USDC formatting helpers ─────────────────────────────────────────────────

/** Format USDC balance from 6 decimal base units to human-readable string */
export function formatUSDCBalance(balance: bigint): string {
  const whole = balance / 1_000_000n
  const fraction = balance % 1_000_000n
  const fractionStr = fraction.toString().padStart(6, "0").slice(0, 2)
  return `${whole.toLocaleString()}.${fractionStr}`
}

/** Format ETH balance from wei to human-readable string */
export function formatETHBalance(balance: bigint): string {
  const whole = balance / 1_000_000_000_000_000_000n
  const fraction = (balance % 1_000_000_000_000_000_000n) / 1_000_000_000_000_000n
  return `${whole}.${fraction.toString().padStart(3, "0")}`
}

export { USDC_ADDRESS, BASE_CHAIN_ID, BASE_RPC }
