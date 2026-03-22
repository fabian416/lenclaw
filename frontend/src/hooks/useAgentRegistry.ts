/**
 * Wagmi hooks for interacting with the AgentRegistry contract.
 *
 * IMPORTANT: registerAgent() has an `onlyAuthorized` modifier on-chain,
 * meaning only the owner, protocol, vaultFactory, or an authorized factory
 * can call it. End users cannot call registerAgent directly.
 *
 * For registration, the frontend calls the WDK API server relay endpoint
 * (/api/wdk/register-agent) which holds an authorized key and submits
 * the transaction on behalf of the user.
 *
 * The read hooks (useGetAgent, useIsRegistered) are public and can be
 * called by anyone.
 */

import { useReadContract } from "wagmi"
import { useState, useCallback } from "react"
import {
  AGENT_REGISTRY_ABI,
  AGENT_REGISTRY_ADDRESS,
  USDT_ADDRESS,
  categoryToBytes32,
  ZERO_BYTES32,
  ZERO_ADDRESS,
} from "@/lib/contracts"
import { ECOSYSTEM_PROTOCOL_IDS } from "@/lib/constants"
import type { OnboardingFormData } from "@/lib/types"
import type { Address } from "viem"

// ── WDK API base URL ────────────────────────────────────────────────────────

const WDK_API_BASE = import.meta.env.VITE_WDK_API_URL || ""

// ── Types ───────────────────────────────────────────────────────────────────

export interface AgentProfile {
  wallet: Address
  smartWallet: Address
  codeHash: `0x${string}`
  metadata: string
  reputationScore: bigint
  codeVerified: boolean
  lockbox: Address
  vault: Address
  registeredAt: bigint
  externalToken: Address
  externalProtocolId: bigint
  agentCategory: `0x${string}`
}

export interface RegisterAgentResult {
  txHash: string
  agentId: number
}

// ── Registration via relay ──────────────────────────────────────────────────

/**
 * Hook for registering an agent on-chain via the WDK API relay.
 *
 * The WDK API server holds an authorized key (owner/protocol) that can call
 * AgentRegistry.registerAgent(). The frontend sends the registration params
 * and receives back the tx hash and agent ID.
 */
export function useRegisterAgent() {
  const [isPending, setIsPending] = useState(false)
  const [isSuccess, setIsSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [txHash, setTxHash] = useState<string | null>(null)
  const [agentId, setAgentId] = useState<number | null>(null)

  const registerAgent = useCallback(async (
    form: OnboardingFormData,
    agentWallet: string,
  ): Promise<RegisterAgentResult> => {
    setIsPending(true)
    setIsSuccess(false)
    setError(null)
    setTxHash(null)
    setAgentId(null)

    try {
      // Build the metadata JSON string stored on-chain
      const metadata = JSON.stringify({
        name: form.name,
        description: form.description,
        ecosystem: form.ecosystem,
        deploySmartWallet: form.deploySmartWallet,
        ...(form.teeProvider ? { teeProvider: form.teeProvider } : {}),
        ...(form.teeAttestation ? { teeAttestation: form.teeAttestation } : {}),
      })

      // Resolve codeHash: user-provided or zero
      const codeHash = form.codeHash && form.codeHash.startsWith("0x") && form.codeHash.length === 66
        ? form.codeHash
        : ZERO_BYTES32

      // Resolve external token address
      const externalToken = form.externalTokenAddress && form.externalTokenAddress.startsWith("0x")
        ? form.externalTokenAddress
        : ZERO_ADDRESS

      // Ecosystem -> protocol ID
      const externalProtocolId = ECOSYSTEM_PROTOCOL_IDS[form.ecosystem] ?? 0

      // Category -> bytes32
      const agentCategory = categoryToBytes32(form.agentCategory)

      // Asset for vault deployment (USDT on Base)
      const asset = USDT_ADDRESS

      // Call the relay endpoint
      const res = await fetch(`${WDK_API_BASE}/api/wdk/register-agent`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentWallet,
          codeHash,
          metadata,
          externalToken,
          externalProtocolId,
          agentCategory,
          asset,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || `Registration failed: ${res.status}`)
      }

      const result: RegisterAgentResult = {
        txHash: data.txHash,
        agentId: data.agentId,
      }

      setTxHash(result.txHash)
      setAgentId(result.agentId)
      setIsSuccess(true)
      return result
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Registration failed"
      setError(msg)
      throw err
    } finally {
      setIsPending(false)
    }
  }, [])

  const reset = useCallback(() => {
    setIsPending(false)
    setIsSuccess(false)
    setError(null)
    setTxHash(null)
    setAgentId(null)
  }, [])

  return {
    registerAgent,
    isPending,
    isSuccess,
    error,
    txHash,
    agentId,
    reset,
  }
}

// ── Read hooks (public, no authorization needed) ────────────────────────────

/**
 * Read an agent's profile by ID.
 */
export function useGetAgent(agentId: number | undefined) {
  return useReadContract({
    address: AGENT_REGISTRY_ADDRESS,
    abi: AGENT_REGISTRY_ABI,
    functionName: "getAgent",
    args: agentId !== undefined ? [BigInt(agentId)] : undefined,
    query: {
      enabled: agentId !== undefined && agentId > 0,
    },
  })
}

/**
 * Check if an agent ID is registered.
 */
export function useIsRegistered(agentId: number | undefined) {
  return useReadContract({
    address: AGENT_REGISTRY_ADDRESS,
    abi: AGENT_REGISTRY_ABI,
    functionName: "isRegistered",
    args: agentId !== undefined ? [BigInt(agentId)] : undefined,
    query: {
      enabled: agentId !== undefined && agentId > 0,
    },
  })
}

/**
 * Look up an agent ID by wallet address.
 */
export function useGetAgentIdByWallet(wallet: string | null | undefined) {
  return useReadContract({
    address: AGENT_REGISTRY_ADDRESS,
    abi: AGENT_REGISTRY_ABI,
    functionName: "getAgentIdByWallet",
    args: wallet ? [wallet as Address] : undefined,
    query: {
      enabled: !!wallet,
    },
  })
}

/**
 * Get the total number of registered agents.
 */
export function useTotalAgents() {
  return useReadContract({
    address: AGENT_REGISTRY_ADDRESS,
    abi: AGENT_REGISTRY_ABI,
    functionName: "totalAgents",
  })
}
