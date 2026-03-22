export { AgentRegistryAbi } from "./AgentRegistry"
export { AgentVaultAbi } from "./AgentVault"
export { AgentVaultFactoryAbi } from "./AgentVaultFactory"
export { AgentCreditLineAbi } from "./AgentCreditLine"
export { CreditScorerAbi } from "./CreditScorer"
export { RevenueLockboxAbi } from "./RevenueLockbox"
export { DutchAuctionAbi } from "./DutchAuction"
export { RecoveryManagerAbi } from "./RecoveryManager"
export { LiquidationKeeperAbi } from "./LiquidationKeeper"

export const erc20Abi = [
  { type: "function", name: "approve", inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ name: "", type: "bool" }], stateMutability: "nonpayable" },
  { type: "function", name: "allowance", inputs: [{ name: "owner", type: "address" }, { name: "spender", type: "address" }], outputs: [{ name: "", type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "balanceOf", inputs: [{ name: "account", type: "address" }], outputs: [{ name: "", type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "decimals", inputs: [], outputs: [{ name: "", type: "uint8" }], stateMutability: "view" },
  { type: "function", name: "symbol", inputs: [], outputs: [{ name: "", type: "string" }], stateMutability: "view" },
  { type: "function", name: "transfer", inputs: [{ name: "to", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ name: "", type: "bool" }], stateMutability: "nonpayable" },
] as const
