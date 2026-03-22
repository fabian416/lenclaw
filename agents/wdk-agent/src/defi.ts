/**
 * DeFi operations via WDK protocol modules.
 *
 * Supports:
 *   - Cross-chain USDT0 bridging using @tetherto/wdk-protocol-bridge-usdt0-evm
 *   - Token swaps via WDK protocol modules
 *   - Balance queries across chains
 */

import WDK from '@tetherto/wdk';
import { ProtocolBridgeUSDT0Evm } from '@tetherto/wdk-protocol-bridge-usdt0-evm';
import { type Address, encodeFunctionData, type PublicClient, parseGwei } from 'viem';
import { AgentWallet } from './wallet';
import { ERC20_ABI } from './contracts';
import { getLogger } from './logger';
import { AgentConfig, formatUSDC } from './config';

const log = getLogger('defi');

/** Supported chain identifiers for USDT0 bridging */
export type BridgeChain = 'ethereum' | 'arbitrum' | 'optimism' | 'polygon' | 'base';

/** Bridge operation result */
export interface BridgeResult {
  success: boolean;
  txHash: string | null;
  sourceChain: BridgeChain;
  destinationChain: BridgeChain;
  amount: bigint;
  error?: string;
}

/** Swap operation result */
export interface SwapResult {
  success: boolean;
  txHash: string | null;
  tokenIn: Address;
  tokenOut: Address;
  amountIn: bigint;
  amountOut: bigint;
  error?: string;
}

/**
 * DeFi operations manager using WDK protocol modules.
 */
export class DeFiOperations {
  private wallet: AgentWallet;
  private bridgeProtocol: InstanceType<typeof ProtocolBridgeUSDT0Evm> | null = null;
  private maxGasPriceGwei: number;

  constructor(wallet: AgentWallet, maxGasPriceGwei: number = 50) {
    this.wallet = wallet;
    this.maxGasPriceGwei = maxGasPriceGwei;
  }

  /**
   * Check gas price against the configured maximum. Returns true if gas price is acceptable.
   */
  private async checkGasPrice(): Promise<boolean> {
    try {
      const gasPrice = await this.wallet.publicClient.getGasPrice();
      const maxGasPriceWei = parseGwei(this.maxGasPriceGwei.toString());
      const gasPriceGwei = Number(gasPrice) / 1e9;

      if (gasPrice > maxGasPriceWei) {
        log.warn('Gas price exceeds configured maximum, skipping transaction', {
          currentGasPriceGwei: gasPriceGwei.toFixed(2),
          maxGasPriceGwei: this.maxGasPriceGwei,
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
   * Initialize the USDT0 bridge protocol module.
   * Must be called before any bridge operations.
   */
  async initBridge(): Promise<void> {
    try {
      this.bridgeProtocol = new ProtocolBridgeUSDT0Evm(this.wallet.wdk);
      await this.bridgeProtocol.init();
      log.info('USDT0 bridge protocol initialized');
    } catch (err) {
      log.error('Failed to initialize USDT0 bridge protocol', { error: String(err) });
      throw err;
    }
  }

  /**
   * Bridge USDT0 from one chain to another using the WDK bridge protocol.
   *
   * @param sourceChain - The source chain
   * @param destinationChain - The destination chain
   * @param amount - Amount to bridge (in raw token units)
   * @returns BridgeResult with transaction details
   */
  async bridgeUSDT0(
    sourceChain: BridgeChain,
    destinationChain: BridgeChain,
    amount: bigint,
  ): Promise<BridgeResult> {
    if (!this.bridgeProtocol) {
      await this.initBridge();
    }

    log.info('Initiating USDT0 bridge', {
      from: sourceChain,
      to: destinationChain,
      amount: amount.toString(),
    });

    try {
      const account = await this.wallet.wdk.getAccount('ethereum', 0);

      // Execute bridge via WDK protocol module
      const result = await this.bridgeProtocol!.bridge({
        from: sourceChain,
        to: destinationChain,
        amount: amount.toString(),
        account,
      });

      log.info('USDT0 bridge transaction submitted', {
        txHash: result.txHash,
        from: sourceChain,
        to: destinationChain,
      });

      // Wait for source chain confirmation
      const receipt = await this.wallet.publicClient.waitForTransactionReceipt({
        hash: result.txHash as `0x${string}`,
        confirmations: 2,
      });

      const success = receipt.status === 'success';

      if (success) {
        log.info('USDT0 bridge confirmed on source chain', {
          txHash: receipt.transactionHash,
          blockNumber: receipt.blockNumber.toString(),
        });
      } else {
        log.error('USDT0 bridge reverted on source chain', {
          txHash: receipt.transactionHash,
        });
      }

      return {
        success,
        txHash: receipt.transactionHash,
        sourceChain,
        destinationChain,
        amount,
      };
    } catch (err) {
      const errorMsg = String(err);
      log.error('USDT0 bridge failed', { error: errorMsg });
      return {
        success: false,
        txHash: null,
        sourceChain,
        destinationChain,
        amount,
        error: errorMsg,
      };
    }
  }

  /**
   * Execute a token swap on Base using WDK.
   *
   * Encodes and sends a swap transaction through the WDK account. The agent
   * approves the router, then calls the swap function.
   *
   * @param routerAddress - DEX router contract address
   * @param tokenIn - Input token address
   * @param tokenOut - Output token address
   * @param amountIn - Amount of input token to swap
   * @param minAmountOut - Minimum acceptable output (slippage protection)
   * @param swapCalldata - Pre-encoded swap calldata for the router
   * @returns SwapResult with transaction details
   */
  async executeSwap(
    routerAddress: Address,
    tokenIn: Address,
    tokenOut: Address,
    amountIn: bigint,
    minAmountOut: bigint,
    swapCalldata: `0x${string}`,
  ): Promise<SwapResult> {
    log.info('Initiating token swap', {
      router: routerAddress,
      tokenIn,
      tokenOut,
      amountIn: amountIn.toString(),
      minAmountOut: minAmountOut.toString(),
    });

    try {
      // Check gas price before submitting
      if (!(await this.checkGasPrice())) {
        return {
          success: false, txHash: null, tokenIn, tokenOut, amountIn, amountOut: 0n,
          error: 'Gas price too high',
        };
      }

      const account = await this.wallet.wdk.getAccount('ethereum', 0);

      // Step 1: Approve the router to spend tokenIn
      const approveData = encodeFunctionData({
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [routerAddress, amountIn],
      });

      // Estimate gas for approval
      if (!(await this.estimateGas(tokenIn, approveData as `0x${string}`))) {
        return {
          success: false, txHash: null, tokenIn, tokenOut, amountIn, amountOut: 0n,
          error: 'Approval gas estimation failed',
        };
      }

      const approveTxResult = await account.sendTransaction({
        to: tokenIn,
        data: approveData,
        value: '0x0',
      });

      log.debug('Approval transaction submitted', { txHash: approveTxResult.hash });

      const approveReceipt = await this.wallet.publicClient.waitForTransactionReceipt({
        hash: approveTxResult.hash as `0x${string}`,
        confirmations: 1,
      });

      if (approveReceipt.status !== 'success') {
        log.error('Token approval reverted', { txHash: approveReceipt.transactionHash });
        return {
          success: false,
          txHash: approveReceipt.transactionHash,
          tokenIn,
          tokenOut,
          amountIn,
          amountOut: 0n,
          error: 'Token approval reverted',
        };
      }

      // Step 2: Estimate gas for the swap before executing
      if (!(await this.estimateGas(routerAddress, swapCalldata))) {
        log.warn('Swap gas estimation failed, revoking approval and skipping');
        await this.revokeApproval(account, tokenIn, routerAddress);
        return {
          success: false, txHash: null, tokenIn, tokenOut, amountIn, amountOut: 0n,
          error: 'Swap gas estimation failed',
        };
      }

      // Execute the swap
      const swapTxResult = await account.sendTransaction({
        to: routerAddress,
        data: swapCalldata,
        value: '0x0',
      });

      log.info('Swap transaction submitted', { txHash: swapTxResult.hash });

      const swapReceipt = await this.wallet.publicClient.waitForTransactionReceipt({
        hash: swapTxResult.hash as `0x${string}`,
        confirmations: 2,
      });

      if (swapReceipt.status === 'success') {
        // Query output token balance to determine actual amount received
        const balanceAfter = await this.wallet.publicClient.readContract({
          address: tokenOut,
          abi: ERC20_ABI,
          functionName: 'balanceOf',
          args: [this.wallet.address],
        }) as bigint;

        log.info('Swap confirmed', {
          txHash: swapReceipt.transactionHash,
          blockNumber: swapReceipt.blockNumber.toString(),
        });

        // Revoke approval for security
        await this.revokeApproval(account, tokenIn, routerAddress);

        return {
          success: true,
          txHash: swapReceipt.transactionHash,
          tokenIn,
          tokenOut,
          amountIn,
          amountOut: balanceAfter, // Note: this is total balance, not just swap output
        };
      } else {
        log.error('Swap reverted', { txHash: swapReceipt.transactionHash });

        // Revoke approval even on failure
        await this.revokeApproval(account, tokenIn, routerAddress);

        return {
          success: false,
          txHash: swapReceipt.transactionHash,
          tokenIn,
          tokenOut,
          amountIn,
          amountOut: 0n,
          error: 'Swap transaction reverted',
        };
      }
    } catch (err) {
      const errorMsg = String(err);
      log.error('Swap failed', { error: errorMsg });
      return {
        success: false,
        txHash: null,
        tokenIn,
        tokenOut,
        amountIn,
        amountOut: 0n,
        error: errorMsg,
      };
    }
  }

  /**
   * Revoke token approval for a spender (security best practice).
   */
  private async revokeApproval(
    account: Awaited<ReturnType<InstanceType<typeof WDK>['getAccount']>>,
    tokenAddress: Address,
    spenderAddress: Address,
  ): Promise<void> {
    try {
      const revokeData = encodeFunctionData({
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [spenderAddress, 0n],
      });

      await account.sendTransaction({
        to: tokenAddress,
        data: revokeData,
        value: '0x0',
      });

      log.debug('Approval revoked', { token: tokenAddress, spender: spenderAddress });
    } catch (err) {
      // Non-critical: log but don't throw
      log.warn('Failed to revoke approval', { error: String(err) });
    }
  }

  /**
   * Get the USDT0 balance on a specific chain.
   */
  async getUSDT0Balance(chain: BridgeChain): Promise<bigint> {
    if (!this.bridgeProtocol) {
      await this.initBridge();
    }

    try {
      const account = await this.wallet.wdk.getAccount('ethereum', 0);
      const balance = await this.bridgeProtocol!.getBalance({
        chain,
        account,
      });
      return BigInt(balance);
    } catch (err) {
      log.warn('Failed to get USDT0 balance', { chain, error: String(err) });
      return 0n;
    }
  }

  /**
   * Get supported bridge routes from the WDK protocol.
   */
  async getSupportedRoutes(): Promise<Array<{ from: BridgeChain; to: BridgeChain }>> {
    if (!this.bridgeProtocol) {
      await this.initBridge();
    }

    try {
      const routes = await this.bridgeProtocol!.getSupportedRoutes();
      return routes as Array<{ from: BridgeChain; to: BridgeChain }>;
    } catch (err) {
      log.warn('Failed to get supported routes', { error: String(err) });
      return [];
    }
  }
}
