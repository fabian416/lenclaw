/**
 * Contract ABIs and typed configs for wagmi/viem interactions.
 *
 * ABIs are minimal -- only the functions the frontend actually calls.
 * Full Solidity sources: contracts/src/
 */

import { getContracts, CHAIN_ID } from "./constants"

// ── AgentRegistry ABI (minimal) ─────────────────────────────────────────────

export const AGENT_REGISTRY_ABI = [
  {
    name: "registerAgent",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "agentWallet", type: "address" },
      { name: "codeHash", type: "bytes32" },
      { name: "metadata", type: "string" },
      { name: "externalToken", type: "address" },
      { name: "externalProtocolId", type: "uint256" },
      { name: "agentCategory", type: "bytes32" },
      { name: "asset", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "getAgent",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "agentId", type: "uint256" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "wallet", type: "address" },
          { name: "smartWallet", type: "address" },
          { name: "codeHash", type: "bytes32" },
          { name: "metadata", type: "string" },
          { name: "reputationScore", type: "uint256" },
          { name: "codeVerified", type: "bool" },
          { name: "lockbox", type: "address" },
          { name: "vault", type: "address" },
          { name: "registeredAt", type: "uint256" },
          { name: "externalToken", type: "address" },
          { name: "externalProtocolId", type: "uint256" },
          { name: "agentCategory", type: "bytes32" },
        ],
      },
    ],
  },
  {
    name: "getAgentIdByWallet",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "wallet", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "isRegistered",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "agentId", type: "uint256" }],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    name: "totalAgents",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "owner",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
  {
    name: "protocol",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
  // Events
  {
    name: "AgentRegistered",
    type: "event",
    inputs: [
      { name: "agentId", type: "uint256", indexed: true },
      { name: "wallet", type: "address", indexed: true },
      { name: "codeHash", type: "bytes32", indexed: false },
    ],
  },
] as const

// ── Contract addresses ──────────────────────────────────────────────────────

const contracts = getContracts(CHAIN_ID)

export const AGENT_REGISTRY_ADDRESS = contracts.AGENT_REGISTRY as `0x${string}`
export const AGENT_VAULT_FACTORY_ADDRESS = contracts.AGENT_VAULT_FACTORY as `0x${string}`
export const USDT_ADDRESS = contracts.USDT as `0x${string}`

// ── Typed contract configs for wagmi ────────────────────────────────────────

export const agentRegistryConfig = {
  address: AGENT_REGISTRY_ADDRESS,
  abi: AGENT_REGISTRY_ABI,
} as const

// ── Category hash helpers ───────────────────────────────────────────────────

import { keccak256, toHex } from "viem"

const CATEGORY_MAP: Record<string, `0x${string}`> = {
  Trading: keccak256(toHex("TRADING")),
  Content: keccak256(toHex("CONTENT")),
  Oracle: keccak256(toHex("ORACLE")),
  DeFi: keccak256(toHex("DEFI")),
  NFT: keccak256(toHex("NFT")),
  Sniping: keccak256(toHex("SNIPING")),
  Stablecoin: keccak256(toHex("STABLECOIN")),
  Service: keccak256(toHex("SERVICE")),
  MEV: keccak256(toHex("MEV")),
  Other: keccak256(toHex("OTHER")),
}

/** Convert a human-readable category to the on-chain bytes32 keccak hash */
export function categoryToBytes32(category: string): `0x${string}` {
  return CATEGORY_MAP[category] ?? keccak256(toHex(category.toUpperCase()))
}

/** Zero bytes32 constant */
export const ZERO_BYTES32 = "0x0000000000000000000000000000000000000000000000000000000000000000" as `0x${string}`

/** Zero address constant */
export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as `0x${string}`
