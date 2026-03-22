import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface AgentConfig {
  /** WDK seed phrase. If empty, a new one will be generated. */
  seedPhrase: string;

  /** Base chain RPC URL */
  baseRpcUrl: string;

  /** Chain ID for Base mainnet */
  chainId: number;

  /** Lenclaw contract addresses */
  contracts: {
    agentRegistry: string;
    revenueLockbox: string;
    agentVault: string;
    agentCreditLine: string;
    usdc: string;
  };

  /** Agent's registered ID in the AgentRegistry */
  agentId: number;

  /** Polling interval for revenue monitoring (ms) */
  pollIntervalMs: number;

  /** Minimum USDC balance to trigger revenue processing (6 decimals) */
  minRevenueThreshold: bigint;

  /** Log level */
  logLevel: LogLevel;
}

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value || value.trim() === '') {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value.trim();
}

function optionalEnv(key: string, defaultValue: string): string {
  const value = process.env[key];
  if (!value || value.trim() === '') {
    return defaultValue;
  }
  return value.trim();
}

/** USDC on Base mainnet */
export const USDC_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';

/** Base chain ID */
export const BASE_CHAIN_ID = 8453;

/** USDC decimals */
export const USDC_DECIMALS = 6;

/**
 * Parse a human-readable USDC amount (e.g. "1.5") to its 6-decimal raw representation.
 */
export function parseUSDC(amount: string): bigint {
  const parts = amount.split('.');
  const whole = BigInt(parts[0] || '0') * BigInt(10 ** USDC_DECIMALS);
  if (parts.length === 1) return whole;
  const decStr = (parts[1] || '0').padEnd(USDC_DECIMALS, '0').slice(0, USDC_DECIMALS);
  return whole + BigInt(decStr);
}

/**
 * Format a raw USDC amount (6 decimals) to a human-readable string.
 */
export function formatUSDC(raw: bigint): string {
  const whole = raw / BigInt(10 ** USDC_DECIMALS);
  const frac = raw % BigInt(10 ** USDC_DECIMALS);
  const fracStr = frac.toString().padStart(USDC_DECIMALS, '0');
  return `${whole}.${fracStr}`;
}

export function loadConfig(): AgentConfig {
  const seedPhrase = optionalEnv('WDK_SEED_PHRASE', '');
  const baseRpcUrl = optionalEnv('BASE_RPC_URL', 'https://mainnet.base.org');
  const pollIntervalMs = parseInt(optionalEnv('POLL_INTERVAL_MS', '30000'), 10);
  const minThresholdStr = optionalEnv('MIN_REVENUE_THRESHOLD', '1.0');
  const logLevel = optionalEnv('LOG_LEVEL', 'info') as LogLevel;

  const agentIdStr = requireEnv('AGENT_ID');
  const agentId = parseInt(agentIdStr, 10);
  if (isNaN(agentId) || agentId <= 0) {
    throw new Error(`AGENT_ID must be a positive integer, got: ${agentIdStr}`);
  }

  return {
    seedPhrase,
    baseRpcUrl,
    chainId: BASE_CHAIN_ID,
    contracts: {
      agentRegistry: requireEnv('AGENT_REGISTRY_ADDRESS'),
      revenueLockbox: requireEnv('REVENUE_LOCKBOX_ADDRESS'),
      agentVault: requireEnv('AGENT_VAULT_ADDRESS'),
      agentCreditLine: optionalEnv('AGENT_CREDIT_LINE_ADDRESS', ''),
      usdc: USDC_ADDRESS,
    },
    agentId,
    pollIntervalMs,
    minRevenueThreshold: parseUSDC(minThresholdStr),
    logLevel,
  };
}
