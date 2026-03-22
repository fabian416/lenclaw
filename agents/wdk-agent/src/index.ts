/**
 * Lenclaw WDK Agent -- Main entry point.
 *
 * An autonomous, long-lived agent that:
 *   1. Creates/restores a self-custodial wallet via Tether WDK
 *   2. Monitors the wallet for incoming USDC revenue
 *   3. Routes revenue to the RevenueLockbox for automatic debt repayment
 *   4. Exposes DeFi operations (bridges, swaps) via WDK protocol modules
 *
 * Run with:
 *   npm run dev    (ts-node, development)
 *   npm start      (compiled JS, production)
 */

import { type Address } from 'viem';
import { loadConfig, formatUSDC, AgentConfig } from './config';
import { createAgentWallet, getUSDCBalance, getETHBalance, formatUSDCBalance, AgentWallet } from './wallet';
import { RevenueMonitor, getLockboxStats, getCreditStatus } from './revenue';
import { DeFiOperations } from './defi';
import { logger, setLogLevel, getLogger } from './logger';
import {
  AGENT_REGISTRY_ABI,
  AGENT_VAULT_ABI,
  REVENUE_LOCKBOX_ABI,
} from './contracts';

const log = getLogger('main');

// ---------------------------------------------------------------------------
// Graceful shutdown
// ---------------------------------------------------------------------------

let shutdownRequested = false;
let revenueMonitor: RevenueMonitor | null = null;

function registerShutdownHandlers(): void {
  const shutdown = (signal: string) => {
    if (shutdownRequested) {
      log.warn('Forced shutdown');
      process.exit(1);
    }
    shutdownRequested = true;
    log.info(`Received ${signal}, shutting down gracefully...`);

    if (revenueMonitor) {
      revenueMonitor.stop();
    }

    // Give pending operations a moment to complete
    setTimeout(() => {
      log.info('Agent stopped.');
      process.exit(0);
    }, 3000);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  process.on('uncaughtException', (err) => {
    log.error('Uncaught exception', { error: String(err), stack: err.stack });
    process.exit(1);
  });

  process.on('unhandledRejection', (reason) => {
    log.error('Unhandled rejection', { reason: String(reason) });
  });
}

// ---------------------------------------------------------------------------
// Startup diagnostics
// ---------------------------------------------------------------------------

async function printStartupDiagnostics(
  config: AgentConfig,
  wallet: AgentWallet,
): Promise<void> {
  log.info('=== Lenclaw WDK Agent ===');
  log.info(`Agent ID: ${config.agentId}`);
  log.info(`Wallet: ${wallet.address}`);
  log.info(`Chain: Base (${config.chainId})`);
  log.info(`Lockbox: ${config.contracts.revenueLockbox}`);
  log.info(`Vault: ${config.contracts.agentVault}`);
  log.info(`Registry: ${config.contracts.agentRegistry}`);
  log.info(`Poll interval: ${config.pollIntervalMs}ms`);
  log.info(`Min revenue threshold: ${formatUSDC(config.minRevenueThreshold)} USDC`);

  // Check ETH balance for gas
  const ethBalance = await getETHBalance(wallet);
  const ethFormatted = (Number(ethBalance) / 1e18).toFixed(6);
  log.info(`ETH balance (gas): ${ethFormatted} ETH`);
  if (ethBalance === 0n) {
    log.warn('Agent wallet has no ETH for gas! Fund it before revenue can be routed.');
  }

  // Check USDC balance
  const usdcBalance = await getUSDCBalance(wallet, config.contracts.usdc as Address);
  log.info(`USDC balance: ${formatUSDCBalance(usdcBalance)} USDC`);

  // Check agent registration
  try {
    const isRegistered = await wallet.publicClient.readContract({
      address: config.contracts.agentRegistry as Address,
      abi: AGENT_REGISTRY_ABI,
      functionName: 'isRegistered',
      args: [BigInt(config.agentId)],
    }) as boolean;

    if (isRegistered) {
      const profile = await wallet.publicClient.readContract({
        address: config.contracts.agentRegistry as Address,
        abi: AGENT_REGISTRY_ABI,
        functionName: 'getAgent',
        args: [BigInt(config.agentId)],
      }) as {
        wallet: Address;
        smartWallet: Address;
        lockbox: Address;
        vault: Address;
        reputationScore: bigint;
        codeVerified: boolean;
      };

      log.info('Agent is registered in AgentRegistry', {
        registeredWallet: profile.wallet,
        smartWallet: profile.smartWallet,
        lockbox: profile.lockbox,
        vault: profile.vault,
        reputationScore: profile.reputationScore.toString(),
        codeVerified: profile.codeVerified,
      });

      // Verify the WDK wallet matches the registered wallet
      if (profile.wallet.toLowerCase() !== wallet.address.toLowerCase()) {
        log.warn('WDK wallet address does not match registered agent wallet!', {
          wdkWallet: wallet.address,
          registeredWallet: profile.wallet,
        });
        log.warn('Revenue routing may fail if the lockbox only accepts calls from the registered agent address.');
      }
    } else {
      log.warn(`Agent ID ${config.agentId} is NOT registered in the AgentRegistry`);
    }
  } catch (err) {
    log.warn('Could not verify agent registration', { error: String(err) });
  }

  // Query lockbox stats
  try {
    const stats = await getLockboxStats(
      wallet.publicClient,
      config.contracts.revenueLockbox as Address,
    );
    log.info('Lockbox stats', {
      totalRevenueCaptured: formatUSDC(stats.totalRevenueCapture),
      totalRepaid: formatUSDC(stats.totalRepaid),
      repaymentRateBps: stats.repaymentRateBps.toString(),
      pendingRepayment: formatUSDC(stats.pendingRepayment),
      currentEpoch: stats.currentEpoch.toString(),
      epochsWithRevenue: stats.epochsWithRevenue.toString(),
    });
  } catch (err) {
    log.debug('Could not query lockbox stats', { error: String(err) });
  }

  // Query vault stats
  try {
    const vaultAddress = config.contracts.agentVault as Address;
    const [totalAssets, totalBorrowed, utilization, frozen] = await Promise.all([
      wallet.publicClient.readContract({
        address: vaultAddress,
        abi: AGENT_VAULT_ABI,
        functionName: 'totalAssets',
      }) as Promise<bigint>,
      wallet.publicClient.readContract({
        address: vaultAddress,
        abi: AGENT_VAULT_ABI,
        functionName: 'totalBorrowed',
      }) as Promise<bigint>,
      wallet.publicClient.readContract({
        address: vaultAddress,
        abi: AGENT_VAULT_ABI,
        functionName: 'utilizationRate',
      }) as Promise<bigint>,
      wallet.publicClient.readContract({
        address: vaultAddress,
        abi: AGENT_VAULT_ABI,
        functionName: 'frozen',
      }) as Promise<boolean>,
    ]);

    log.info('Vault stats', {
      totalAssets: formatUSDC(totalAssets),
      totalBorrowed: formatUSDC(totalBorrowed),
      utilizationBps: utilization.toString(),
      frozen,
    });

    if (frozen) {
      log.error('VAULT IS FROZEN -- agent may be in default. Revenue routing will still work but withdrawals are blocked.');
    }
  } catch (err) {
    log.debug('Could not query vault stats', { error: String(err) });
  }

  // Query credit status
  if (config.contracts.agentCreditLine) {
    const creditStatus = await getCreditStatus(
      wallet.publicClient,
      config.contracts.agentCreditLine as Address,
      config.agentId,
    );
    if (creditStatus) {
      const statusNames = ['ACTIVE', 'DELINQUENT', 'DEFAULT'];
      log.info('Credit status', {
        outstanding: formatUSDC(creditStatus.outstanding),
        status: statusNames[creditStatus.status] || `UNKNOWN(${creditStatus.status})`,
      });
    }
  }

  log.info('=== Diagnostics complete ===');
}

// ---------------------------------------------------------------------------
// Status report (periodic)
// ---------------------------------------------------------------------------

async function printStatusReport(
  config: AgentConfig,
  wallet: AgentWallet,
  monitor: RevenueMonitor,
): Promise<void> {
  const state = monitor.getState();
  const usdcBalance = await getUSDCBalance(wallet, config.contracts.usdc as Address);
  const ethBalance = await getETHBalance(wallet);

  log.info('--- Status Report ---', {
    usdcBalance: formatUSDCBalance(usdcBalance),
    ethBalance: (Number(ethBalance) / 1e18).toFixed(6),
    totalProcessed: formatUSDC(state.totalProcessed),
    processCount: state.processCount,
    errors: state.errors,
    lastProcessed: state.lastProcessedAt?.toISOString() || 'never',
  });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  registerShutdownHandlers();

  // Load configuration from environment
  let config: AgentConfig;
  try {
    config = loadConfig();
  } catch (err) {
    console.error(`Configuration error: ${err}`);
    console.error('Copy .env.example to .env and fill in the required values.');
    process.exit(1);
  }

  setLogLevel(config.logLevel);

  // Initialize WDK wallet
  let wallet: AgentWallet;
  try {
    wallet = await createAgentWallet(config);
  } catch (err) {
    log.error('Failed to initialize WDK wallet', { error: String(err) });
    process.exit(1);
  }

  // Run startup diagnostics
  await printStartupDiagnostics(config, wallet);

  // Initialize DeFi operations (bridge, swap) -- non-blocking
  const defi = new DeFiOperations(wallet);
  defi.initBridge().catch((err) => {
    log.warn('USDT0 bridge initialization failed (non-critical)', { error: String(err) });
  });

  // Start revenue monitoring loop
  revenueMonitor = new RevenueMonitor(config, wallet);
  revenueMonitor.start();

  // Periodic status report every 5 minutes
  const STATUS_REPORT_INTERVAL = 5 * 60 * 1000;
  const statusInterval = setInterval(() => {
    if (!shutdownRequested) {
      printStatusReport(config, wallet, revenueMonitor!).catch((err) => {
        log.warn('Status report failed', { error: String(err) });
      });
    }
  }, STATUS_REPORT_INTERVAL);

  // Keep the process alive
  log.info('Agent is running. Press Ctrl+C to stop.');

  // Wait for shutdown signal
  await new Promise<void>((resolve) => {
    const checkShutdown = setInterval(() => {
      if (shutdownRequested) {
        clearInterval(checkShutdown);
        clearInterval(statusInterval);
        resolve();
      }
    }, 500);
  });
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
