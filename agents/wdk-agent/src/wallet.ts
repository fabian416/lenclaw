/**
 * WDK wallet creation and management.
 *
 * Handles seed phrase generation, WDK initialization, EVM wallet registration
 * on Base, and balance queries.
 */

import WDK from '@tetherto/wdk';
import { WalletManagerEvm } from '@tetherto/wdk-wallet-evm';
import { createPublicClient, http, type PublicClient, type Address, formatUnits } from 'viem';
import { base } from 'viem/chains';
import { AgentConfig, USDT_DECIMALS } from './config';
import { ERC20_ABI } from './contracts';
import { logger } from './logger';

export interface AgentWallet {
  /** The WDK instance */
  wdk: InstanceType<typeof WDK>;

  /** The agent's EVM address on Base */
  address: Address;

  /** viem public client for read operations */
  publicClient: PublicClient;
}

/**
 * Create or restore an agent wallet using WDK.
 *
 * If config.seedPhrase is provided, it restores an existing wallet.
 * Otherwise, it generates a fresh 24-word seed phrase.
 */
export async function createAgentWallet(config: AgentConfig): Promise<AgentWallet> {
  let seedPhrase = config.seedPhrase;

  if (!seedPhrase) {
    logger.info('No seed phrase provided, generating a new 24-word seed phrase...');
    seedPhrase = WDK.getRandomSeedPhrase(24);
    logger.warn('New seed phrase generated. Set WDK_SEED_PHRASE in .env to persist.');
  } else {
    logger.info('Restoring wallet from existing seed phrase...');
  }

  const wdk = new WDK(seedPhrase);

  // Register the EVM wallet manager for Base
  wdk.registerWallet('ethereum', WalletManagerEvm, {
    provider: config.baseRpcUrl,
  });

  // Derive the first account (index 0)
  const account = await wdk.getAccount('ethereum', 0);
  const address = account.getAddress() as Address;

  logger.info(`WDK wallet initialized on Base (chainId: ${config.chainId})`);
  logger.info(`Agent wallet address: ${address}`);

  // Create a viem public client for direct RPC reads
  const publicClient = createPublicClient({
    chain: base,
    transport: http(config.baseRpcUrl),
  });

  return {
    wdk,
    address,
    publicClient,
  };
}

/**
 * Get the agent's wallet address.
 */
export function getWalletAddress(wallet: AgentWallet): Address {
  return wallet.address;
}

/**
 * Query the USDT balance of the agent's wallet.
 * Returns the raw balance (6 decimals).
 */
export async function getUSDTBalance(
  wallet: AgentWallet,
  usdtAddress: Address,
): Promise<bigint> {
  const balance = await wallet.publicClient.readContract({
    address: usdtAddress,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: [wallet.address],
  });
  return balance as bigint;
}

/**
 * Query the USDT balance of any address.
 */
export async function getUSDTBalanceOf(
  wallet: AgentWallet,
  usdtAddress: Address,
  targetAddress: Address,
): Promise<bigint> {
  const balance = await wallet.publicClient.readContract({
    address: usdtAddress,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: [targetAddress],
  });
  return balance as bigint;
}

/**
 * Get the native ETH balance of the agent's wallet (for gas).
 */
export async function getETHBalance(wallet: AgentWallet): Promise<bigint> {
  return wallet.publicClient.getBalance({ address: wallet.address });
}

/**
 * Format a USDT raw amount to a human-readable string.
 */
export function formatUSDTBalance(raw: bigint): string {
  return formatUnits(raw, USDT_DECIMALS);
}
