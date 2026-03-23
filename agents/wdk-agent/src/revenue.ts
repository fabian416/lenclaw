/**
 * Revenue monitoring and routing to the Lenclaw RevenueLockbox.
 *
 * The agent continuously monitors its WDK wallet for incoming USDT. When the
 * balance exceeds the configured threshold, it:
 *   1. Transfers USDT to the RevenueLockbox contract
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
  parseGwei,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { base } from 'viem/chains';
import { AgentConfig, formatUSDT } from './config';
import { AgentWallet, getUSDTBalance, getUSDTBalanceOf, formatUSDTBalance } from './wallet';
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
 * Revenue monitor that watches the agent's wallet and routes USDT to the lockbox.
 */
export class RevenueMonitor {
  private config: AgentConfig;
  private wallet: AgentWallet;
  private intervalHandle: ReturnType<typeof setTimeout> | null = null;
  private state: RevenueMonitorState = {
    isRunning: false,
    totalProcessed: 0n,
    processCount: 0,
    lastProcessedAt: null,
    errors: 0,
  };

  /** Exponential backoff state */
  private consecutiveFailures: number = 0;
  private static readonly BACKOFF_BASE_DELAY_MS = 5000;
  private static readonly BACKOFF_MAX_DELAY_MS = 300000; // 5 minutes

  constructor(config: AgentConfig, wallet: AgentWallet) {
    this.config = config;
    this.wallet = wallet;
  }

  /**
   * Compute the delay before the next poll, applying exponential backoff on failures.
   */
  private getNextPollDelay(): number {
    if (this.consecutiveFailures === 0) {
      return this.config.pollIntervalMs;
    }
    const backoffDelay = Math.min(
      RevenueMonitor.BACKOFF_BASE_DELAY_MS * Math.pow(2, this.consecutiveFailures),
      RevenueMonitor.BACKOFF_MAX_DELAY_MS,
    );
    return backoffDelay;
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
      minThreshold: formatUSDT(this.config.minRevenueThreshold),
    });

    // Run immediately, then schedule the next poll
    this.pollLoop();
  }

  /**
   * Internal polling loop with exponential backoff on failures.
   */
  private pollLoop(): void {
    if (!this.state.isRunning) return;

    this.checkAndProcess()
      .then(() => {
        // Success: reset consecutive failures
        this.consecutiveFailures = 0;
      })
      .catch((err) => {
        log.error('Error in revenue check cycle', { error: String(err) });
        this.state.errors++;
        this.consecutiveFailures++;
      })
      .finally(() => {
        if (!this.state.isRunning) return;
        const delay = this.getNextPollDelay();
        if (this.consecutiveFailures > 0) {
          log.warn('Applying exponential backoff before next poll', {
            consecutiveFailures: this.consecutiveFailures,
            backoffDelayMs: delay,
          });
        }
        this.intervalHandle = setTimeout(() => this.pollLoop(), delay);
      });
  }

  /**
   * Stop the revenue monitoring loop.
   */
  stop(): void {
    if (this.intervalHandle) {
      clearTimeout(this.intervalHandle);
      this.intervalHandle = null;
    }
    this.state.isRunning = false;
    log.info('Revenue monitor stopped', {
      totalProcessed: formatUSDT(this.state.totalProcessed),
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
   * Check gas price against the configured maximum. Returns true if gas price is acceptable.
   */
  private async checkGasPrice(): Promise<boolean> {
    try {
      const gasPrice = await this.wallet.publicClient.getGasPrice();
      const maxGasPriceWei = parseGwei(this.config.maxGasPriceGwei.toString());
      const gasPriceGwei = Number(gasPrice) / 1e9;

      if (gasPrice > maxGasPriceWei) {
        log.warn('Gas price exceeds configured maximum, skipping transaction', {
          currentGasPriceGwei: gasPriceGwei.toFixed(2),
          maxGasPriceGwei: this.config.maxGasPriceGwei,
        });
        return false;
      }

      log.debug('Gas price check passed', { gasPriceGwei: gasPriceGwei.toFixed(2) });
      return true;
    } catch (err) {
      log.warn('Failed to fetch gas price, proceeding anyway', { error: String(err) });
      return true;
    }
  }

  /**
   * Estimate gas for a transaction. Returns true if estimation succeeds (tx likely won't revert).
   */
  private async estimateGas(to: Address, data: `0x${string}`): Promise<boolean> {
    try {
      await this.wallet.publicClient.estimateGas({
        account: this.wallet.address,
        to,
        data,
      });
      return true;
    } catch (err) {
      log.warn('Gas estimation failed, transaction would likely revert -- skipping', {
        to,
        error: String(err),
      });
      return false;
    }
  }

  /**
   * Check USDT balance and process revenue if above threshold.
   */
  private async checkAndProcess(): Promise<void> {
    const usdtAddress = this.config.contracts.usdt as Address;
    const lockboxAddress = this.config.contracts.revenueLockbox as Address;

    // Step 1: Check agent wallet USDT balance
    const agentBalance = await getUSDTBalance(this.wallet, usdtAddress);
    log.debug('Agent wallet USDT balance', {
      balance: formatUSDTBalance(agentBalance),
      address: this.wallet.address,
    });

    if (agentBalance >= this.config.minRevenueThreshold) {
      log.info('Revenue detected in agent wallet, transferring to lockbox', {
        amount: formatUSDTBalance(agentBalance),
      });

      // Nonce management: transactions are serialized (each awaited before the next)
      // to prevent nonce conflicts between transfer and processRevenue calls.
      // WDK handles nonce assignment internally; we ensure ordering by awaiting each tx.
      await this.transferToLockbox(usdtAddress, lockboxAddress, agentBalance);
    }

    // Step 2: Check if lockbox has pending USDT to process
    const lockboxBalance = await getUSDTBalanceOf(
      this.wallet,
      usdtAddress,
      lockboxAddress,
    );

    if (lockboxBalance > 0n) {
      log.info('Lockbox has pending revenue, calling processRevenue()', {
        lockboxBalance: formatUSDTBalance(lockboxBalance),
      });

      await this.callProcessRevenue(lockboxAddress, lockboxBalance);
    } else {
      log.debug('No pending revenue in lockbox');
    }
  }

  /**
   * Transfer USDT from the agent's WDK wallet to the RevenueLockbox.
   *
   * Uses WDK's built-in transfer capability to send USDT.
   */
  private async transferToLockbox(
    usdtAddress: Address,
    lockboxAddress: Address,
    amount: bigint,
  ): Promise<void> {
    try {
      log.info('Initiating USDT transfer to lockbox', {
        amount: formatUSDTBalance(amount),
        to: lockboxAddress,
      });

      // Check gas price before submitting
      if (!(await this.checkGasPrice())) {
        log.warn('Skipping USDT transfer due to high gas price');
        return;
      }

      // Use WDK to send the transfer transaction
      const account = await this.wallet.wdk.getAccount('ethereum', 0);

      // Encode the ERC-20 transfer call
      const transferData = encodeFunctionData({
        abi: ERC20_ABI,
        functionName: 'transfer',
        args: [lockboxAddress, amount],
      });

      // Estimate gas to verify transaction won't revert
      if (!(await this.estimateGas(usdtAddress, transferData))) {
        log.warn('Skipping USDT transfer: gas estimation failed');
        return;
      }

      // Execute the transaction through WDK
      const txResult = await account.sendTransaction({
        to: usdtAddress,
        data: transferData,
        value: '0x0',
      });

      log.info('USDT transfer submitted', { txHash: txResult.hash });

      // Wait for confirmation
      const receipt = await this.wallet.publicClient.waitForTransactionReceipt({
        hash: txResult.hash as `0x${string}`,
        confirmations: 2,
      });

      if (receipt.status === 'success') {
        log.info('USDT transfer confirmed', {
          txHash: receipt.transactionHash,
          blockNumber: receipt.blockNumber.toString(),
          gasUsed: receipt.gasUsed.toString(),
        });
      } else {
        log.error('USDT transfer reverted', { txHash: receipt.transactionHash });
        this.state.errors++;
      }
    } catch (err) {
      log.error('Failed to transfer USDT to lockbox', { error: String(err) });
      this.state.errors++;
      throw err;
    }
  }

  /**
   * Call processRevenue() on the RevenueLockbox contract.
   *
   * This splits the USDT between debt repayment (to vault) and agent remainder.
   * Only the agent address or vault can call this function.
   */
  private async callProcessRevenue(lockboxAddress: Address, amount: bigint): Promise<void> {
    try {
      // Check gas price before submitting
      if (!(await this.checkGasPrice())) {
        log.warn('Skipping processRevenue() due to high gas price');
        return;
      }

      const account = await this.wallet.wdk.getAccount('ethereum', 0);

      // Encode processRevenue() call (no arguments)
      const callData = encodeFunctionData({
        abi: REVENUE_LOCKBOX_ABI,
        functionName: 'processRevenue',
        args: [],
      });

      // Estimate gas to verify transaction won't revert
      if (!(await this.estimateGas(lockboxAddress, callData))) {
        log.warn('Skipping processRevenue(): gas estimation failed');
        return;
      }

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
          totalProcessedLifetime: formatUSDT(this.state.totalProcessed),
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
