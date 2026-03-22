/**
 * Revenue monitoring and routing to the Lenclaw RevenueLockbox.
 *
 * The agent continuously monitors its WDK wallet for incoming USDC. When the
 * balance exceeds the configured threshold, it:
 *   1. Transfers USDC to the RevenueLockbox contract
 *   2. Calls processRevenue() on the lockbox to split between debt repayment and agent
 *
 * The lockbox's processRevenue() can only be called by the agent address or the vault,
 * so the agent must be the msg.sender (or route through an authorized path).
 */

import {
  createWalletClient,
  http,
  type Address,
  type WalletClient,
  type PublicClient,
  encodeFunctionData,
  parseAbi,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { base } from 'viem/chains';
import { AgentConfig, formatUSDC } from './config';
import { AgentWallet, getUSDCBalance, getUSDCBalanceOf, formatUSDCBalance } from './wallet';
import { ERC20_ABI, REVENUE_LOCKBOX_ABI, AGENT_VAULT_ABI, AGENT_CREDIT_LINE_ABI } from './contracts';
import { getLogger } from './logger';

const log = getLogger('revenue');

export interface RevenueMonitorState {
  isRunning: boolean;
  totalProcessed: bigint;
  processCount: number;
  lastProcessedAt: Date | null;
  errors: number;
}

/**
 * Revenue monitor that watches the agent's wallet and routes USDC to the lockbox.
 */
export class RevenueMonitor {
  private config: AgentConfig;
  private wallet: AgentWallet;
  private intervalHandle: ReturnType<typeof setInterval> | null = null;
  private state: RevenueMonitorState = {
    isRunning: false,
    totalProcessed: 0n,
    processCount: 0,
    lastProcessedAt: null,
    errors: 0,
  };

  constructor(config: AgentConfig, wallet: AgentWallet) {
    this.config = config;
    this.wallet = wallet;
  }

  /**
   * Start the revenue monitoring loop.
   */
  start(): void {
    if (this.state.isRunning) {
      log.warn('Revenue monitor is already running');
      return;
    }

    this.state.isRunning = true;
    log.info('Starting revenue monitor', {
      lockbox: this.config.contracts.revenueLockbox,
      pollInterval: this.config.pollIntervalMs,
      minThreshold: formatUSDC(this.config.minRevenueThreshold),
    });

    // Run immediately, then on interval
    this.checkAndProcess().catch((err) => {
      log.error('Error in initial revenue check', { error: String(err) });
    });

    this.intervalHandle = setInterval(() => {
      this.checkAndProcess().catch((err) => {
        log.error('Error in revenue check cycle', { error: String(err) });
        this.state.errors++;
      });
    }, this.config.pollIntervalMs);
  }

  /**
   * Stop the revenue monitoring loop.
   */
  stop(): void {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
    this.state.isRunning = false;
    log.info('Revenue monitor stopped', {
      totalProcessed: formatUSDC(this.state.totalProcessed),
      processCount: this.state.processCount,
      errors: this.state.errors,
    });
  }

  /**
   * Get the current monitor state.
   */
  getState(): RevenueMonitorState {
    return { ...this.state };
  }

  /**
   * Check USDC balance and process revenue if above threshold.
   */
  private async checkAndProcess(): Promise<void> {
    const usdcAddress = this.config.contracts.usdc as Address;
    const lockboxAddress = this.config.contracts.revenueLockbox as Address;

    // Step 1: Check agent wallet USDC balance
    const agentBalance = await getUSDCBalance(this.wallet, usdcAddress);
    log.debug('Agent wallet USDC balance', {
      balance: formatUSDCBalance(agentBalance),
      address: this.wallet.address,
    });

    if (agentBalance >= this.config.minRevenueThreshold) {
      log.info('Revenue detected in agent wallet, transferring to lockbox', {
        amount: formatUSDCBalance(agentBalance),
      });

      await this.transferToLockbox(usdcAddress, lockboxAddress, agentBalance);
    }

    // Step 2: Check if lockbox has pending USDC to process
    const lockboxBalance = await getUSDCBalanceOf(
      this.wallet,
      usdcAddress,
      lockboxAddress,
    );

    if (lockboxBalance > 0n) {
      log.info('Lockbox has pending revenue, calling processRevenue()', {
        lockboxBalance: formatUSDCBalance(lockboxBalance),
      });

      await this.callProcessRevenue(lockboxAddress, lockboxBalance);
    } else {
      log.debug('No pending revenue in lockbox');
    }
  }

  /**
   * Transfer USDC from the agent's WDK wallet to the RevenueLockbox.
   *
   * Uses WDK's built-in transfer capability to send USDC.
   */
  private async transferToLockbox(
    usdcAddress: Address,
    lockboxAddress: Address,
    amount: bigint,
  ): Promise<void> {
    try {
      log.info('Initiating USDC transfer to lockbox', {
        amount: formatUSDCBalance(amount),
        to: lockboxAddress,
      });

      // Use WDK to send the transfer transaction
      const account = await this.wallet.wdk.getAccount('ethereum', 0);

      // Encode the ERC-20 transfer call
      const transferData = encodeFunctionData({
        abi: ERC20_ABI,
        functionName: 'transfer',
        args: [lockboxAddress, amount],
      });

      // Execute the transaction through WDK
      const txResult = await account.sendTransaction({
        to: usdcAddress,
        data: transferData,
        value: '0x0',
      });

      log.info('USDC transfer submitted', { txHash: txResult.hash });

      // Wait for confirmation
      const receipt = await this.wallet.publicClient.waitForTransactionReceipt({
        hash: txResult.hash as `0x${string}`,
        confirmations: 2,
      });

      if (receipt.status === 'success') {
        log.info('USDC transfer confirmed', {
          txHash: receipt.transactionHash,
          blockNumber: receipt.blockNumber.toString(),
          gasUsed: receipt.gasUsed.toString(),
        });
      } else {
        log.error('USDC transfer reverted', { txHash: receipt.transactionHash });
        this.state.errors++;
      }
    } catch (err) {
      log.error('Failed to transfer USDC to lockbox', { error: String(err) });
      this.state.errors++;
      throw err;
    }
  }

  /**
   * Call processRevenue() on the RevenueLockbox contract.
   *
   * This splits the USDC between debt repayment (to vault) and agent remainder.
   * Only the agent address or vault can call this function.
   */
  private async callProcessRevenue(lockboxAddress: Address, amount: bigint): Promise<void> {
    try {
      const account = await this.wallet.wdk.getAccount('ethereum', 0);

      // Encode processRevenue() call (no arguments)
      const callData = encodeFunctionData({
        abi: REVENUE_LOCKBOX_ABI,
        functionName: 'processRevenue',
        args: [],
      });

      const txResult = await account.sendTransaction({
        to: lockboxAddress,
        data: callData,
        value: '0x0',
      });

      log.info('processRevenue() transaction submitted', { txHash: txResult.hash });

      const receipt = await this.wallet.publicClient.waitForTransactionReceipt({
        hash: txResult.hash as `0x${string}`,
        confirmations: 2,
      });

      if (receipt.status === 'success') {
        this.state.totalProcessed += amount;
        this.state.processCount++;
        this.state.lastProcessedAt = new Date();

        log.info('processRevenue() confirmed', {
          txHash: receipt.transactionHash,
          blockNumber: receipt.blockNumber.toString(),
          totalProcessedLifetime: formatUSDC(this.state.totalProcessed),
          processCount: this.state.processCount,
        });
      } else {
        log.error('processRevenue() reverted', { txHash: receipt.transactionHash });
        this.state.errors++;
      }
    } catch (err) {
      log.error('Failed to call processRevenue()', { error: String(err) });
      this.state.errors++;
      throw err;
    }
  }
}

/**
 * Query lockbox stats for logging/monitoring.
 */
export async function getLockboxStats(
  publicClient: PublicClient,
  lockboxAddress: Address,
): Promise<{
  totalRevenueCapture: bigint;
  totalRepaid: bigint;
  repaymentRateBps: bigint;
  pendingRepayment: bigint;
  currentEpoch: bigint;
  epochsWithRevenue: bigint;
}> {
  const [
    totalRevenueCapture,
    totalRepaid,
    repaymentRateBps,
    pendingRepayment,
    currentEpoch,
    epochsWithRevenue,
  ] = await Promise.all([
    publicClient.readContract({
      address: lockboxAddress,
      abi: REVENUE_LOCKBOX_ABI,
      functionName: 'totalRevenueCapture',
    }) as Promise<bigint>,
    publicClient.readContract({
      address: lockboxAddress,
      abi: REVENUE_LOCKBOX_ABI,
      functionName: 'totalRepaid',
    }) as Promise<bigint>,
    publicClient.readContract({
      address: lockboxAddress,
      abi: REVENUE_LOCKBOX_ABI,
      functionName: 'repaymentRateBps',
    }) as Promise<bigint>,
    publicClient.readContract({
      address: lockboxAddress,
      abi: REVENUE_LOCKBOX_ABI,
      functionName: 'pendingRepayment',
    }) as Promise<bigint>,
    publicClient.readContract({
      address: lockboxAddress,
      abi: REVENUE_LOCKBOX_ABI,
      functionName: 'currentEpoch',
    }) as Promise<bigint>,
    publicClient.readContract({
      address: lockboxAddress,
      abi: REVENUE_LOCKBOX_ABI,
      functionName: 'epochsWithRevenue',
    }) as Promise<bigint>,
  ]);

  return {
    totalRevenueCapture,
    totalRepaid,
    repaymentRateBps,
    pendingRepayment,
    currentEpoch,
    epochsWithRevenue,
  };
}

/**
 * Query the agent's credit status from AgentCreditLine.
 */
export async function getCreditStatus(
  publicClient: PublicClient,
  creditLineAddress: Address,
  agentId: number,
): Promise<{
  outstanding: bigint;
  status: number;
} | null> {
  if (!creditLineAddress || creditLineAddress === '0x0000000000000000000000000000000000000000') {
    return null;
  }

  try {
    const [outstanding, status] = await Promise.all([
      publicClient.readContract({
        address: creditLineAddress,
        abi: AGENT_CREDIT_LINE_ABI,
        functionName: 'getOutstanding',
        args: [BigInt(agentId)],
      }) as Promise<bigint>,
      publicClient.readContract({
        address: creditLineAddress,
        abi: AGENT_CREDIT_LINE_ABI,
        functionName: 'getStatus',
        args: [BigInt(agentId)],
      }) as Promise<number>,
    ]);

    return { outstanding, status };
  } catch (err) {
    log.warn('Failed to query credit status', { error: String(err) });
    return null;
  }
}
