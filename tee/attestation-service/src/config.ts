import dotenv from "dotenv";

dotenv.config();

/** Supported TEE enclave types. */
export enum EnclaveType {
  SGX = "sgx",
  NITRO = "nitro",
}

/** Attestation validity status for an agent. */
export enum AttestationStatus {
  UNVERIFIED = "unverified",
  VERIFIED = "verified",
  EXPIRED = "expired",
  FAILED = "failed",
}

/** Full service configuration, populated from environment variables with sane defaults. */
export interface ServiceConfig {
  /** HTTP port for the attestation REST API. */
  port: number;

  /** Hostname to bind the Express server to. */
  host: string;

  /** EVM-compatible JSON-RPC endpoint used for on-chain interactions. */
  rpcUrl: string;

  /** Chain ID of the target network. */
  chainId: number;

  /** Deployed TEEAttestationVerifier contract address. */
  verifierContractAddress: string;

  /** Deployed AgentRegistry contract address. */
  agentRegistryAddress: string;

  /**
   * Private key of the signer authorised to submit attestation results on-chain.
   * Should belong to the address set as `attestor` in the verifier contract.
   */
  signerPrivateKey: string;

  /** How long (seconds) a single attestation result is considered valid. Default 24 h. */
  attestationTtlSeconds: number;

  /**
   * Cron expression that controls how often the scheduler triggers re-attestation
   * for all tracked agents. Default: every 6 hours.
   */
  reattestationCron: string;

  /**
   * Cron expression for the expiry-monitor sweep. Default: every 5 minutes.
   */
  monitorCron: string;

  /**
   * If an attestation will expire within this many seconds the monitor treats it
   * as "about to expire" and triggers proactive re-attestation.
   */
  expiryWarningSeconds: number;

  /** Log level for winston. */
  logLevel: string;
}

function envOrDefault(key: string, fallback: string): string {
  return process.env[key] ?? fallback;
}

function envOrDefaultNum(key: string, fallback: number): number {
  const raw = process.env[key];
  if (!raw) return fallback;
  const parsed = parseInt(raw, 10);
  return isNaN(parsed) ? fallback : parsed;
}

export function loadConfig(): ServiceConfig {
  return {
    port: envOrDefaultNum("PORT", 3300),
    host: envOrDefault("HOST", "0.0.0.0"),
    rpcUrl: envOrDefault("RPC_URL", "http://127.0.0.1:8545"),
    chainId: envOrDefaultNum("CHAIN_ID", 31337),
    verifierContractAddress: envOrDefault("VERIFIER_CONTRACT_ADDRESS", ""),
    agentRegistryAddress: envOrDefault("AGENT_REGISTRY_ADDRESS", ""),
    signerPrivateKey: envOrDefault(
      "SIGNER_PRIVATE_KEY",
      "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" // Hardhat default #0
    ),
    attestationTtlSeconds: envOrDefaultNum("ATTESTATION_TTL_SECONDS", 86400), // 24 h
    reattestationCron: envOrDefault("REATTESTATION_CRON", "0 */6 * * *"), // every 6 h
    monitorCron: envOrDefault("MONITOR_CRON", "*/5 * * * *"), // every 5 min
    expiryWarningSeconds: envOrDefaultNum("EXPIRY_WARNING_SECONDS", 3600), // 1 h
    logLevel: envOrDefault("LOG_LEVEL", "info"),
  };
}

export const config = loadConfig();
