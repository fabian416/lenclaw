/**
 * Lenclaw Lending Agent — OpenClaw + WDK Entry Point
 *
 * Autonomous lending agent that evaluates AI agent creditworthiness,
 * approves/denies credit lines, and monitors repayments on the
 * Lenclaw protocol using Tether WDK for wallet operations.
 */

import OpenClaw from 'openclaw'
import WDK from '@tetherto/wdk'
import { WalletManagerEvm } from '@tetherto/wdk-wallet-evm'
import {
  type Address,
  createPublicClient,
  http,
  encodeFunctionData,
  formatUnits,
} from 'viem'
import { base } from 'viem/chains'

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const CONFIG = {
  agentId: process.env.AGENT_ID!,
  rpcUrl: process.env.BASE_RPC_URL || 'https://mainnet.base.org',
  soulPath: new URL('./SOUL.md', import.meta.url).pathname,
  seedPhrase: process.env.WDK_SEED_PHRASE,
  contracts: {
    creditScorer: process.env.CREDIT_SCORER_ADDRESS as Address,
    agentCreditLine: process.env.AGENT_CREDIT_LINE_ADDRESS as Address,
    revenueLockbox: process.env.REVENUE_LOCKBOX_ADDRESS as Address,
    agentRegistry: process.env.AGENT_REGISTRY_ADDRESS as Address,
    agentVault: process.env.AGENT_VAULT_ADDRESS as Address,
    agentVaultFactory: process.env.AGENT_VAULT_FACTORY_ADDRESS as Address,
    zkVerifier: process.env.ZK_VERIFIER_ADDRESS as Address,
    usdt: '0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2' as Address,
  },
  pollIntervalMs: 30_000,
  minScoreForApproval: 350,
}

// ---------------------------------------------------------------------------
// Shared viem client
// ---------------------------------------------------------------------------

const publicClient = createPublicClient({
  chain: base,
  transport: http(CONFIG.rpcUrl),
})

// ---------------------------------------------------------------------------
// WDK Wallet Setup
// ---------------------------------------------------------------------------

interface AgentWallet {
  wdk: InstanceType<typeof WDK>
  address: Address
  account: Awaited<ReturnType<InstanceType<typeof WDK>['getAccount']>>
}

async function initWallet(): Promise<AgentWallet> {
  let seedPhrase = CONFIG.seedPhrase
  if (!seedPhrase) {
    seedPhrase = WDK.getRandomSeedPhrase(24)
    console.log('[lending-agent] Generated new seed phrase. Set WDK_SEED_PHRASE to persist.')
  }

  const wdk = new WDK(seedPhrase)
  wdk.registerWallet('ethereum', WalletManagerEvm, {
    provider: CONFIG.rpcUrl,
  })

  const account = await wdk.getAccount('ethereum', 0)
  const address = account.getAddress() as Address

  console.log(`[lending-agent] WDK wallet ready: ${address}`)
  return { wdk, address, account }
}

// ---------------------------------------------------------------------------
// OpenClaw Agent Setup
// ---------------------------------------------------------------------------

async function initAgent(wallet: AgentWallet) {
  const agent = new OpenClaw({
    soul: CONFIG.soulPath,
    tools: {
      // ---------------------------------------------------------------
      // wdk_wallet — Self-custodial wallet via Tether WDK
      // ---------------------------------------------------------------
      wdk_wallet: {
        description: 'Self-custodial wallet via Tether WDK',
        handler: async (action: string, params: Record<string, unknown>) => {
          if (action === 'create') {
            const newSeed = WDK.getRandomSeedPhrase(24)
            const newWdk = new WDK(newSeed)
            newWdk.registerWallet('ethereum', WalletManagerEvm, {
              provider: CONFIG.rpcUrl,
            })
            const newAccount = await newWdk.getAccount('ethereum', 0)
            const newAddress = newAccount.getAddress() as Address
            return { address: newAddress, seed: newSeed }
          }

          if (action === 'restore') {
            const seed = params.seed as string
            const restoreWdk = new WDK(seed)
            restoreWdk.registerWallet('ethereum', WalletManagerEvm, {
              provider: CONFIG.rpcUrl,
            })
            const restoreAccount = await restoreWdk.getAccount('ethereum', 0)
            const restoreAddress = restoreAccount.getAddress() as Address
            return { address: restoreAddress }
          }

          if (action === 'balance') {
            const target = (params.address as Address) || wallet.address
            const [ethBalance, usdtBalance] = await Promise.all([
              publicClient.getBalance({ address: target }),
              publicClient.readContract({
                address: CONFIG.contracts.usdt,
                abi: ERC20_ABI,
                functionName: 'balanceOf',
                args: [target],
              }),
            ])
            return {
              eth: formatUnits(ethBalance, 18),
              usdt: formatUnits(usdtBalance as bigint, 6),
              rawEth: ethBalance.toString(),
              rawUsdt: (usdtBalance as bigint).toString(),
            }
          }

          if (action === 'sign') {
            const tx = params.tx as { to: Address; data: `0x${string}`; value?: bigint }
            const signed = await wallet.account.signTransaction(tx)
            return { signed }
          }

          if (action === 'send') {
            const to = params.to as Address
            const amount = BigInt(params.amount as string)
            // Approve + transfer USDT
            const transferData = encodeFunctionData({
              abi: ERC20_ABI,
              functionName: 'transfer',
              args: [to, amount],
            })
            const txHash = await wallet.account.sendTransaction({
              to: CONFIG.contracts.usdt,
              data: transferData,
            })
            return { txHash, to, amount: amount.toString() }
          }

          return { error: `Unknown wdk_wallet action: ${action}` }
        },
      },

      // ---------------------------------------------------------------
      // credit_scorer — On-chain 5-factor credit assessment
      // ---------------------------------------------------------------
      credit_scorer: {
        description: 'On-chain 5-factor credit assessment',
        handler: async (action: string, params: Record<string, unknown>) => {
          const agentId = BigInt(params.agentId as string)

          if (action === 'score') {
            const score = await publicClient.readContract({
              address: CONFIG.contracts.creditScorer,
              abi: CREDIT_SCORER_ABI,
              functionName: 'getCompositeScore',
              args: [agentId],
            })
            return { agentId: agentId.toString(), compositeScore: (score as bigint).toString() }
          }

          if (action === 'breakdown') {
            // Read the agent profile to get the lockbox, then query each factor
            const profile = await publicClient.readContract({
              address: CONFIG.contracts.agentRegistry,
              abi: AGENT_REGISTRY_ABI,
              functionName: 'getAgent',
              args: [agentId],
            }) as { lockbox: Address; registeredAt: bigint }

            const lockboxAddr = profile.lockbox

            const [totalRevenue, currentEpoch, epochsWithRevenue, outstanding, loansRepaid] =
              await Promise.all([
                publicClient.readContract({
                  address: lockboxAddr,
                  abi: REVENUE_LOCKBOX_ABI,
                  functionName: 'totalRevenueCapture',
                }) as Promise<bigint>,
                publicClient.readContract({
                  address: lockboxAddr,
                  abi: REVENUE_LOCKBOX_ABI,
                  functionName: 'currentEpoch',
                }) as Promise<bigint>,
                publicClient.readContract({
                  address: lockboxAddr,
                  abi: REVENUE_LOCKBOX_ABI,
                  functionName: 'epochsWithRevenue',
                }) as Promise<bigint>,
                publicClient.readContract({
                  address: CONFIG.contracts.agentCreditLine,
                  abi: AGENT_CREDIT_LINE_ABI,
                  functionName: 'getOutstanding',
                  args: [agentId],
                }) as Promise<bigint>,
                publicClient.readContract({
                  address: CONFIG.contracts.agentCreditLine,
                  abi: AGENT_CREDIT_LINE_ABI,
                  functionName: 'loansRepaid',
                  args: [agentId],
                }) as Promise<bigint>,
              ])

            const totalEpochs = currentEpoch + 1n
            const consistencyPct =
              totalEpochs > 0n ? (epochsWithRevenue * 100n) / totalEpochs : 0n

            const debtToRevenuePct =
              totalRevenue > 0n ? (outstanding * 100n) / totalRevenue : 0n

            return {
              agentId: agentId.toString(),
              revenueLevel: formatUnits(totalRevenue, 6),
              revenueConsistency: `${consistencyPct}% (${epochsWithRevenue}/${totalEpochs} epochs)`,
              creditHistory: `${loansRepaid} completed loans`,
              timeInProtocol: `registered at block timestamp ${profile.registeredAt}`,
              debtToRevenue: `${debtToRevenuePct}% (${formatUnits(outstanding, 6)} outstanding / ${formatUnits(totalRevenue, 6)} revenue)`,
            }
          }

          if (action === 'credit_line') {
            const result = await publicClient.readContract({
              address: CONFIG.contracts.creditScorer,
              abi: CREDIT_SCORER_ABI,
              functionName: 'calculateCreditLine',
              args: [agentId],
            }) as [bigint, bigint]
            return {
              agentId: agentId.toString(),
              creditLimit: formatUnits(result[0], 6),
              interestRateBps: result[1].toString(),
              interestRateApr: `${Number(result[1]) / 100}%`,
            }
          }

          if (action === 'interest_rate') {
            const result = await publicClient.readContract({
              address: CONFIG.contracts.creditScorer,
              abi: CREDIT_SCORER_ABI,
              functionName: 'calculateCreditLine',
              args: [agentId],
            }) as [bigint, bigint]
            return {
              agentId: agentId.toString(),
              interestRateBps: result[1].toString(),
              interestRateApr: `${Number(result[1]) / 100}%`,
            }
          }

          return { error: `Unknown credit_scorer action: ${action}` }
        },
      },

      // ---------------------------------------------------------------
      // revenue_monitor — RevenueLockbox polling and analysis
      // ---------------------------------------------------------------
      revenue_monitor: {
        description: 'RevenueLockbox polling and analysis',
        handler: async (action: string, params: Record<string, unknown>) => {
          const lockbox = CONFIG.contracts.revenueLockbox

          if (action === 'stats') {
            const [totalRevenue, totalRepaid, repaymentRateBps, pending, currentEpoch, epochsWithRevenue] =
              await Promise.all([
                publicClient.readContract({ address: lockbox, abi: REVENUE_LOCKBOX_ABI, functionName: 'totalRevenueCapture' }) as Promise<bigint>,
                publicClient.readContract({ address: lockbox, abi: REVENUE_LOCKBOX_ABI, functionName: 'totalRepaid' }) as Promise<bigint>,
                publicClient.readContract({ address: lockbox, abi: REVENUE_LOCKBOX_ABI, functionName: 'repaymentRateBps' }) as Promise<bigint>,
                publicClient.readContract({ address: lockbox, abi: REVENUE_LOCKBOX_ABI, functionName: 'pendingRepayment' }) as Promise<bigint>,
                publicClient.readContract({ address: lockbox, abi: REVENUE_LOCKBOX_ABI, functionName: 'currentEpoch' }) as Promise<bigint>,
                publicClient.readContract({ address: lockbox, abi: REVENUE_LOCKBOX_ABI, functionName: 'epochsWithRevenue' }) as Promise<bigint>,
              ])
            return {
              totalRevenueCaptured: formatUnits(totalRevenue, 6),
              totalRepaid: formatUnits(totalRepaid, 6),
              repaymentRateBps: repaymentRateBps.toString(),
              pendingRepayment: formatUnits(pending, 6),
              currentEpoch: currentEpoch.toString(),
              epochsWithRevenue: epochsWithRevenue.toString(),
            }
          }

          if (action === 'poll') {
            // Check lockbox USDT balance to see if new revenue has arrived
            const lockboxBalance = await publicClient.readContract({
              address: CONFIG.contracts.usdt,
              abi: ERC20_ABI,
              functionName: 'balanceOf',
              args: [lockbox],
            }) as bigint
            const pending = await publicClient.readContract({
              address: lockbox,
              abi: REVENUE_LOCKBOX_ABI,
              functionName: 'pendingRepayment',
            }) as bigint
            return {
              lockboxBalance: formatUnits(lockboxBalance, 6),
              pendingRepayment: formatUnits(pending, 6),
              hasUnprocessedRevenue: lockboxBalance > 0n,
            }
          }

          if (action === 'epoch_history') {
            const currentEpoch = await publicClient.readContract({
              address: lockbox,
              abi: REVENUE_LOCKBOX_ABI,
              functionName: 'currentEpoch',
            }) as bigint

            const epochCount = Number(currentEpoch) + 1
            const maxEpochs = Math.min(epochCount, 12) // Last 12 epochs max
            const epochs: { epoch: number; revenue: string }[] = []

            for (let i = epochCount - maxEpochs; i < epochCount; i++) {
              const revenue = await publicClient.readContract({
                address: lockbox,
                abi: REVENUE_LOCKBOX_ABI,
                functionName: 'revenueByEpoch',
                args: [BigInt(i)],
              }) as bigint
              epochs.push({ epoch: i, revenue: formatUnits(revenue, 6) })
            }

            return { currentEpoch: currentEpoch.toString(), epochs }
          }

          if (action === 'alert_check') {
            const currentEpoch = await publicClient.readContract({
              address: lockbox,
              abi: REVENUE_LOCKBOX_ABI,
              functionName: 'currentEpoch',
            }) as bigint

            const alerts: string[] = []
            const epoch = Number(currentEpoch)

            // Check current epoch revenue
            const currentRevenue = await publicClient.readContract({
              address: lockbox,
              abi: REVENUE_LOCKBOX_ABI,
              functionName: 'revenueByEpoch',
              args: [currentEpoch],
            }) as bigint

            if (currentRevenue === 0n) {
              alerts.push(`No revenue in current epoch ${epoch}`)
            }

            // Compare with previous epoch for drops
            if (epoch > 0) {
              const prevRevenue = await publicClient.readContract({
                address: lockbox,
                abi: REVENUE_LOCKBOX_ABI,
                functionName: 'revenueByEpoch',
                args: [BigInt(epoch - 1)],
              }) as bigint

              if (prevRevenue > 0n && currentRevenue < prevRevenue / 2n) {
                alerts.push(
                  `Revenue dropped >50%: ${formatUnits(prevRevenue, 6)} -> ${formatUnits(currentRevenue, 6)}`
                )
              }
            }

            // Check for consecutive missed epochs
            let missedEpochs = 0
            for (let i = epoch; i >= Math.max(0, epoch - 3); i--) {
              const rev = await publicClient.readContract({
                address: lockbox,
                abi: REVENUE_LOCKBOX_ABI,
                functionName: 'revenueByEpoch',
                args: [BigInt(i)],
              }) as bigint
              if (rev === 0n) missedEpochs++
              else break
            }
            if (missedEpochs >= 2) {
              alerts.push(`${missedEpochs} consecutive epochs with no revenue`)
            }

            return {
              currentEpoch: epoch,
              alertCount: alerts.length,
              alerts,
              healthy: alerts.length === 0,
            }
          }

          return { error: `Unknown revenue_monitor action: ${action}` }
        },
      },

      // ---------------------------------------------------------------
      // loan_manager — AgentCreditLine drawdown/repayment lifecycle
      // ---------------------------------------------------------------
      loan_manager: {
        description: 'AgentCreditLine drawdown/repayment lifecycle',
        handler: async (action: string, params: Record<string, unknown>) => {
          const agentId = BigInt(params.agentId as string)

          if (action === 'status') {
            const [outstanding, status, facility] = await Promise.all([
              publicClient.readContract({
                address: CONFIG.contracts.agentCreditLine,
                abi: AGENT_CREDIT_LINE_ABI,
                functionName: 'getOutstanding',
                args: [agentId],
              }) as Promise<bigint>,
              publicClient.readContract({
                address: CONFIG.contracts.agentCreditLine,
                abi: AGENT_CREDIT_LINE_ABI,
                functionName: 'getStatus',
                args: [agentId],
              }) as Promise<number>,
              publicClient.readContract({
                address: CONFIG.contracts.agentCreditLine,
                abi: AGENT_CREDIT_LINE_ABI,
                functionName: 'facilities',
                args: [agentId],
              }) as Promise<[bigint, bigint, bigint, bigint, bigint, number]>,
            ])
            const statusNames = ['ACTIVE', 'DELINQUENT', 'DEFAULT']
            return {
              agentId: agentId.toString(),
              outstanding: formatUnits(outstanding, 6),
              status: statusNames[status] || `UNKNOWN(${status})`,
              principal: formatUnits(facility[0], 6),
              accruedInterest: formatUnits(facility[1], 6),
              interestRateBps: facility[3].toString(),
              creditLimit: formatUnits(facility[4], 6),
            }
          }

          if (action === 'approve_drawdown') {
            const amount = BigInt(params.amount as string)

            // Pre-flight checks
            const [status, compositeScore, creditLineResult, isRegistered, vaultAddr] = await Promise.all([
              publicClient.readContract({
                address: CONFIG.contracts.agentCreditLine,
                abi: AGENT_CREDIT_LINE_ABI,
                functionName: 'getStatus',
                args: [agentId],
              }) as Promise<number>,
              publicClient.readContract({
                address: CONFIG.contracts.creditScorer,
                abi: CREDIT_SCORER_ABI,
                functionName: 'getCompositeScore',
                args: [agentId],
              }) as Promise<bigint>,
              publicClient.readContract({
                address: CONFIG.contracts.creditScorer,
                abi: CREDIT_SCORER_ABI,
                functionName: 'calculateCreditLine',
                args: [agentId],
              }) as Promise<[bigint, bigint]>,
              publicClient.readContract({
                address: CONFIG.contracts.agentRegistry,
                abi: AGENT_REGISTRY_ABI,
                functionName: 'isRegistered',
                args: [agentId],
              }) as Promise<boolean>,
              publicClient.readContract({
                address: CONFIG.contracts.agentVaultFactory,
                abi: AGENT_VAULT_FACTORY_ABI,
                functionName: 'getVault',
                args: [agentId],
              }) as Promise<Address>,
            ])

            if (!isRegistered) {
              return { approved: false, reason: 'AGENT_NOT_REGISTERED' }
            }
            if (status !== 0) {
              const statusNames = ['ACTIVE', 'DELINQUENT', 'DEFAULT']
              return { approved: false, reason: `AGENT_STATUS_${statusNames[status]}` }
            }
            if (Number(compositeScore) < CONFIG.minScoreForApproval) {
              return {
                approved: false,
                reason: 'SCORE_BELOW_THRESHOLD',
                score: compositeScore.toString(),
                threshold: CONFIG.minScoreForApproval,
              }
            }
            if (amount < 10_000_000n) {
              return { approved: false, reason: 'BELOW_MIN_DRAWDOWN', minimum: '10 USDT' }
            }

            // Check vault liquidity
            const liquidity = await publicClient.readContract({
              address: vaultAddr,
              abi: AGENT_VAULT_ABI,
              functionName: 'availableLiquidity',
            }) as bigint
            if (liquidity < amount) {
              return {
                approved: false,
                reason: 'INSUFFICIENT_VAULT_LIQUIDITY',
                available: formatUnits(liquidity, 6),
                requested: formatUnits(amount, 6),
              }
            }

            return {
              approved: true,
              agentId: agentId.toString(),
              amount: formatUnits(amount, 6),
              compositeScore: compositeScore.toString(),
              creditLimit: formatUnits(creditLineResult[0], 6),
              interestRateBps: creditLineResult[1].toString(),
            }
          }

          if (action === 'deny_drawdown') {
            const reason = params.reason as string
            const score = await publicClient.readContract({
              address: CONFIG.contracts.creditScorer,
              abi: CREDIT_SCORER_ABI,
              functionName: 'getCompositeScore',
              args: [agentId],
            }) as bigint

            const creditLineResult = await publicClient.readContract({
              address: CONFIG.contracts.creditScorer,
              abi: CREDIT_SCORER_ABI,
              functionName: 'calculateCreditLine',
              args: [agentId],
            }) as [bigint, bigint]

            return {
              denied: true,
              agentId: agentId.toString(),
              reason,
              compositeScore: score.toString(),
              creditLimit: formatUnits(creditLineResult[0], 6),
              interestRateBps: creditLineResult[1].toString(),
            }
          }

          if (action === 'track_repayment') {
            const [outstanding, facility, lastPayment] = await Promise.all([
              publicClient.readContract({
                address: CONFIG.contracts.agentCreditLine,
                abi: AGENT_CREDIT_LINE_ABI,
                functionName: 'getOutstanding',
                args: [agentId],
              }) as Promise<bigint>,
              publicClient.readContract({
                address: CONFIG.contracts.agentCreditLine,
                abi: AGENT_CREDIT_LINE_ABI,
                functionName: 'facilities',
                args: [agentId],
              }) as Promise<[bigint, bigint, bigint, bigint, bigint, number]>,
              publicClient.readContract({
                address: CONFIG.contracts.agentCreditLine,
                abi: AGENT_CREDIT_LINE_ABI,
                functionName: 'lastPaymentTimestamp',
                args: [agentId],
              }) as Promise<bigint>,
            ])

            const totalBorrowed = await publicClient.readContract({
              address: CONFIG.contracts.agentCreditLine,
              abi: AGENT_CREDIT_LINE_ABI,
              functionName: 'totalAmountBorrowed',
              args: [agentId],
            }) as bigint

            const totalRepaid = totalBorrowed - facility[0] // totalBorrowed - principal
            const repaymentPct = totalBorrowed > 0n ? (totalRepaid * 100n) / totalBorrowed : 0n

            return {
              agentId: agentId.toString(),
              outstanding: formatUnits(outstanding, 6),
              principal: formatUnits(facility[0], 6),
              accruedInterest: formatUnits(facility[1], 6),
              creditLimit: formatUnits(facility[4], 6),
              totalBorrowed: formatUnits(totalBorrowed, 6),
              totalRepaid: formatUnits(totalRepaid, 6),
              repaymentPct: `${repaymentPct}%`,
              lastPaymentTimestamp: lastPayment.toString(),
            }
          }

          if (action === 'flag_delinquent') {
            // Force a status update on-chain to detect delinquency
            const statusBefore = await publicClient.readContract({
              address: CONFIG.contracts.agentCreditLine,
              abi: AGENT_CREDIT_LINE_ABI,
              functionName: 'getStatus',
              args: [agentId],
            }) as number

            // Simulate the updateStatus call to see the current state
            const lastPayment = await publicClient.readContract({
              address: CONFIG.contracts.agentCreditLine,
              abi: AGENT_CREDIT_LINE_ABI,
              functionName: 'lastPaymentTimestamp',
              args: [agentId],
            }) as bigint

            const block = await publicClient.getBlock()
            const timeSincePayment = block.timestamp - lastPayment
            const statusNames = ['ACTIVE', 'DELINQUENT', 'DEFAULT']

            return {
              agentId: agentId.toString(),
              currentStatus: statusNames[statusBefore] || `UNKNOWN(${statusBefore})`,
              lastPaymentTimestamp: lastPayment.toString(),
              secondsSincePayment: timeSincePayment.toString(),
              flagged: statusBefore >= 1,
              recommendation:
                statusBefore === 0
                  ? 'Agent is ACTIVE, no flag needed'
                  : statusBefore === 1
                    ? 'Agent is DELINQUENT — increase monitoring frequency'
                    : 'Agent is in DEFAULT — trigger vault freeze',
            }
          }

          if (action === 'trigger_freeze') {
            // Check if agent is in DEFAULT before recommending freeze
            const status = await publicClient.readContract({
              address: CONFIG.contracts.agentCreditLine,
              abi: AGENT_CREDIT_LINE_ABI,
              functionName: 'getStatus',
              args: [agentId],
            }) as number

            const vaultAddr = await publicClient.readContract({
              address: CONFIG.contracts.agentVaultFactory,
              abi: AGENT_VAULT_FACTORY_ABI,
              functionName: 'getVault',
              args: [agentId],
            }) as Address

            const frozen = await publicClient.readContract({
              address: vaultAddr,
              abi: AGENT_VAULT_ABI,
              functionName: 'frozen',
            }) as boolean

            const statusNames = ['ACTIVE', 'DELINQUENT', 'DEFAULT']
            return {
              agentId: agentId.toString(),
              status: statusNames[status] || `UNKNOWN(${status})`,
              vaultAddress: vaultAddr,
              alreadyFrozen: frozen,
              shouldFreeze: status === 2 && !frozen,
              note:
                status === 2
                  ? 'Agent is in DEFAULT. Vault freeze recommended via AgentVaultFactory.freezeVault().'
                  : 'Agent is not in DEFAULT. Freeze not warranted.',
            }
          }

          return { error: `Unknown loan_manager action: ${action}` }
        },
      },


      // ---------------------------------------------------------------
      // yield_optimizer — Cross-vault yield comparison and rebalancing
      // ---------------------------------------------------------------
      yield_optimizer: {
        description: 'Cross-vault yield comparison and capital reallocation',
        handler: async (action: string, params: Record<string, unknown>) => {
          if (action === 'scan_yields') {
            const agentIds = (params.agentIds as string[]) || []
            const vaultData: Array<Record<string, unknown>> = []

            for (const id of agentIds) {
              const agentId = BigInt(id)
              try {
                const vaultAddr = await publicClient.readContract({
                  address: CONFIG.contracts.agentVaultFactory,
                  abi: AGENT_VAULT_FACTORY_ABI,
                  functionName: 'getVault',
                  args: [agentId],
                }) as Address

                const [totalAssets, totalBorrowed, utilization, frozen] = await Promise.all([
                  publicClient.readContract({ address: vaultAddr, abi: AGENT_VAULT_ABI, functionName: 'totalAssets' }) as Promise<bigint>,
                  publicClient.readContract({ address: vaultAddr, abi: AGENT_VAULT_ABI, functionName: 'totalBorrowed' }) as Promise<bigint>,
                  publicClient.readContract({ address: vaultAddr, abi: AGENT_VAULT_ABI, functionName: 'utilizationRate' }) as Promise<bigint>,
                  publicClient.readContract({ address: vaultAddr, abi: AGENT_VAULT_ABI, functionName: 'frozen' }) as Promise<boolean>,
                ])

                // Get interest rate for this agent
                const creditLineResult = await publicClient.readContract({
                  address: CONFIG.contracts.creditScorer,
                  abi: CREDIT_SCORER_ABI,
                  functionName: 'calculateCreditLine',
                  args: [agentId],
                }) as [bigint, bigint]

                // Get repayment rate from lockbox
                const profile = await publicClient.readContract({
                  address: CONFIG.contracts.agentRegistry,
                  abi: AGENT_REGISTRY_ABI,
                  functionName: 'getAgent',
                  args: [agentId],
                }) as { lockbox: Address }

                const repaymentRateBps = await publicClient.readContract({
                  address: profile.lockbox,
                  abi: REVENUE_LOCKBOX_ABI,
                  functionName: 'repaymentRateBps',
                }) as bigint

                // Effective APY = interest rate * utilization rate * repayment reliability
                const interestRateBps = Number(creditLineResult[1])
                const utilizationPct = Number(utilization) / 100
                const estimatedApy = (interestRateBps / 100) * (utilizationPct / 100)

                vaultData.push({
                  agentId: id,
                  vault: vaultAddr,
                  totalAssets: formatUnits(totalAssets, 6),
                  totalBorrowed: formatUnits(totalBorrowed, 6),
                  utilizationPct: `${Number(utilization) / 100}%`,
                  interestRateApr: `${interestRateBps / 100}%`,
                  repaymentRateBps: repaymentRateBps.toString(),
                  estimatedApyPct: `${estimatedApy.toFixed(2)}%`,
                  frozen,
                })
              } catch (err) {
                vaultData.push({ agentId: id, error: String(err) })
              }
            }

            // Sort by estimated APY descending
            vaultData.sort((a, b) => {
              const apyA = parseFloat((a.estimatedApyPct as string) || '0')
              const apyB = parseFloat((b.estimatedApyPct as string) || '0')
              return apyB - apyA
            })

            return { vaults: vaultData, count: vaultData.length }
          }

          if (action === 'compare_vaults') {
            const agentIds = (params.agentIds as string[]) || []
            const comparisons: Array<Record<string, unknown>> = []

            for (const id of agentIds) {
              const agentId = BigInt(id)
              try {
                const [compositeScore, creditLineResult] = await Promise.all([
                  publicClient.readContract({
                    address: CONFIG.contracts.creditScorer,
                    abi: CREDIT_SCORER_ABI,
                    functionName: 'getCompositeScore',
                    args: [agentId],
                  }) as Promise<bigint>,
                  publicClient.readContract({
                    address: CONFIG.contracts.creditScorer,
                    abi: CREDIT_SCORER_ABI,
                    functionName: 'calculateCreditLine',
                    args: [agentId],
                  }) as Promise<[bigint, bigint]>,
                ])

                const vaultAddr = await publicClient.readContract({
                  address: CONFIG.contracts.agentVaultFactory,
                  abi: AGENT_VAULT_FACTORY_ABI,
                  functionName: 'getVault',
                  args: [agentId],
                }) as Address

                const [totalAssets, totalBorrowed, utilization] = await Promise.all([
                  publicClient.readContract({ address: vaultAddr, abi: AGENT_VAULT_ABI, functionName: 'totalAssets' }) as Promise<bigint>,
                  publicClient.readContract({ address: vaultAddr, abi: AGENT_VAULT_ABI, functionName: 'totalBorrowed' }) as Promise<bigint>,
                  publicClient.readContract({ address: vaultAddr, abi: AGENT_VAULT_ABI, functionName: 'utilizationRate' }) as Promise<bigint>,
                ])

                // Revenue consistency
                const profile = await publicClient.readContract({
                  address: CONFIG.contracts.agentRegistry,
                  abi: AGENT_REGISTRY_ABI,
                  functionName: 'getAgent',
                  args: [agentId],
                }) as { lockbox: Address }

                const [epochsWithRevenue, currentEpoch] = await Promise.all([
                  publicClient.readContract({ address: profile.lockbox, abi: REVENUE_LOCKBOX_ABI, functionName: 'epochsWithRevenue' }) as Promise<bigint>,
                  publicClient.readContract({ address: profile.lockbox, abi: REVENUE_LOCKBOX_ABI, functionName: 'currentEpoch' }) as Promise<bigint>,
                ])

                const totalEpochs = currentEpoch + 1n
                const consistencyPct = totalEpochs > 0n ? Number((epochsWithRevenue * 100n) / totalEpochs) : 0

                const interestRateBps = Number(creditLineResult[1])
                const utilizationPct = Number(utilization) / 100
                const rawApy = (interestRateBps / 100) * (utilizationPct / 100)

                // Risk-adjusted yield: raw APY * (credit score / 1000)
                const riskAdjustedApy = rawApy * (Number(compositeScore) / 1000)

                comparisons.push({
                  agentId: id,
                  vault: vaultAddr,
                  compositeScore: compositeScore.toString(),
                  interestRateApr: `${interestRateBps / 100}%`,
                  utilizationPct: `${utilizationPct}%`,
                  totalAssets: formatUnits(totalAssets, 6),
                  totalBorrowed: formatUnits(totalBorrowed, 6),
                  revenueConsistency: `${consistencyPct}%`,
                  rawApyPct: `${rawApy.toFixed(2)}%`,
                  riskAdjustedApyPct: `${riskAdjustedApy.toFixed(2)}%`,
                })
              } catch (err) {
                comparisons.push({ agentId: id, error: String(err) })
              }
            }

            // Sort by risk-adjusted APY descending
            comparisons.sort((a, b) => {
              const apyA = parseFloat((a.riskAdjustedApyPct as string) || '0')
              const apyB = parseFloat((b.riskAdjustedApyPct as string) || '0')
              return apyB - apyA
            })

            return { comparisons, count: comparisons.length }
          }

          if (action === 'recommend_rebalance') {
            const agentIds = (params.agentIds as string[]) || []
            const currentPositions = (params.currentPositions as Record<string, string>) || {}

            // Gather vault data for all agents
            const vaultSummaries: string[] = []
            for (const id of agentIds) {
              const agentId = BigInt(id)
              try {
                const vaultAddr = await publicClient.readContract({
                  address: CONFIG.contracts.agentVaultFactory,
                  abi: AGENT_VAULT_FACTORY_ABI,
                  functionName: 'getVault',
                  args: [agentId],
                }) as Address

                const [totalAssets, totalBorrowed, utilization, frozen] = await Promise.all([
                  publicClient.readContract({ address: vaultAddr, abi: AGENT_VAULT_ABI, functionName: 'totalAssets' }) as Promise<bigint>,
                  publicClient.readContract({ address: vaultAddr, abi: AGENT_VAULT_ABI, functionName: 'totalBorrowed' }) as Promise<bigint>,
                  publicClient.readContract({ address: vaultAddr, abi: AGENT_VAULT_ABI, functionName: 'utilizationRate' }) as Promise<bigint>,
                  publicClient.readContract({ address: vaultAddr, abi: AGENT_VAULT_ABI, functionName: 'frozen' }) as Promise<boolean>,
                ])

                const compositeScore = await publicClient.readContract({
                  address: CONFIG.contracts.creditScorer,
                  abi: CREDIT_SCORER_ABI,
                  functionName: 'getCompositeScore',
                  args: [agentId],
                }) as bigint

                const creditLineResult = await publicClient.readContract({
                  address: CONFIG.contracts.creditScorer,
                  abi: CREDIT_SCORER_ABI,
                  functionName: 'calculateCreditLine',
                  args: [agentId],
                }) as [bigint, bigint]

                const currentPos = currentPositions[id] || '0'
                vaultSummaries.push(
                  `Agent ${id}: vault=${vaultAddr}, assets=${formatUnits(totalAssets, 6)}, borrowed=${formatUnits(totalBorrowed, 6)}, util=${Number(utilization) / 100}%, score=${compositeScore}, apr=${Number(creditLineResult[1]) / 100}%, frozen=${frozen}, currentPosition=${currentPos} USDT`
                )
              } catch (err) {
                vaultSummaries.push(`Agent ${id}: error reading vault — ${String(err)}`)
              }
            }

            // Use agent.think() to reason about optimal reallocation
            const recommendation = await agent.think({
              context: { vaultSummaries, currentPositions },
              prompt:
                'You are analyzing agent vault yields for capital reallocation. ' +
                'Given the vault data below, recommend how to rebalance positions to maximize risk-adjusted yield. ' +
                'Consider: credit scores (higher = safer), utilization rates (drives yield), frozen vaults (avoid), and revenue consistency. ' +
                'Never recommend increasing exposure to agents with scores below 350. ' +
                'Output a JSON rebalance plan with: moves (array of {from, to, amount, reason}), totalExpectedApyImprovement, and riskNotes.

' +
                vaultSummaries.join('
'),
            })

            return { recommendation, vaultCount: agentIds.length }
          }

          if (action === 'execute_rebalance') {
            const fromAgentId = BigInt(params.fromAgentId as string)
            const toAgentId = BigInt(params.toAgentId as string)
            const amount = BigInt(params.amount as string)

            // Resolve vault addresses
            const [fromVault, toVault] = await Promise.all([
              publicClient.readContract({
                address: CONFIG.contracts.agentVaultFactory,
                abi: AGENT_VAULT_FACTORY_ABI,
                functionName: 'getVault',
                args: [fromAgentId],
              }) as Promise<Address>,
              publicClient.readContract({
                address: CONFIG.contracts.agentVaultFactory,
                abi: AGENT_VAULT_FACTORY_ABI,
                functionName: 'getVault',
                args: [toAgentId],
              }) as Promise<Address>,
            ])

            // Safety checks
            const [fromFrozen, toFrozen, toStatus] = await Promise.all([
              publicClient.readContract({ address: fromVault, abi: AGENT_VAULT_ABI, functionName: 'frozen' }) as Promise<boolean>,
              publicClient.readContract({ address: toVault, abi: AGENT_VAULT_ABI, functionName: 'frozen' }) as Promise<boolean>,
              publicClient.readContract({
                address: CONFIG.contracts.agentCreditLine,
                abi: AGENT_CREDIT_LINE_ABI,
                functionName: 'getStatus',
                args: [toAgentId],
              }) as Promise<number>,
            ])

            if (fromFrozen) {
              return { success: false, reason: 'SOURCE_VAULT_FROZEN' }
            }
            if (toFrozen) {
              return { success: false, reason: 'TARGET_VAULT_FROZEN' }
            }
            if (toStatus !== 0) {
              const statusNames = ['ACTIVE', 'DELINQUENT', 'DEFAULT']
              return { success: false, reason: `TARGET_AGENT_${statusNames[toStatus]}` }
            }

            // Prepare transaction data (not broadcasting — returns for WDK execution)
            const withdrawData = encodeFunctionData({
              abi: AGENT_VAULT_ABI,
              functionName: 'withdraw',
              args: [amount, wallet.address, wallet.address],
            })

            const depositData = encodeFunctionData({
              abi: AGENT_VAULT_ABI,
              functionName: 'deposit',
              args: [amount, wallet.address],
            })

            return {
              success: true,
              rebalance: {
                withdraw: { vault: fromVault, agentId: fromAgentId.toString(), data: withdrawData },
                deposit: { vault: toVault, agentId: toAgentId.toString(), data: depositData },
                amount: formatUnits(amount, 6),
              },
              note: 'Transaction data prepared. Execute via WDK wallet to complete rebalance.',
            }
          }

          return { error: `Unknown yield_optimizer action: ${action}` }
        },
      },

      // ---------------------------------------------------------------
      // zk_verifier — ZK credit proof verification
      // ---------------------------------------------------------------
      zk_verifier: {
        description: 'ZK credit proof verification',
        handler: async (action: string, params: Record<string, unknown>) => {
          if (action === 'verify_proof') {
            const proof = params.proof as `0x${string}`
            const agentId = BigInt(params.agentId as string)
            const revenueThreshold = BigInt(params.revenueThreshold as string)
            const minReputation = BigInt(params.minReputation as string)
            const registeredCodeHash = params.registeredCodeHash as `0x${string}`
            const revenueTier = Number(params.revenueTier || 0)
            const reputationBand = Number(params.reputationBand || 0)

            // Read-only simulation of verifyCredit to check validity
            const result = await publicClient.simulateContract({
              address: CONFIG.contracts.zkVerifier,
              abi: ZK_VERIFIER_ABI,
              functionName: 'verifyCredit',
              args: [
                {
                  proof,
                  revenueThreshold,
                  registeredCodeHash,
                  minReputation,
                  agentId,
                  revenueTier,
                  reputationBand,
                },
              ],
            })
            return { valid: result.result, agentId: agentId.toString() }
          }

          if (action === 'generate_attestation') {
            const agentId = BigInt(params.agentId as string)

            // Check current proof validity
            const [isValid, timestamp] = await Promise.all([
              publicClient.readContract({
                address: CONFIG.contracts.zkVerifier,
                abi: ZK_VERIFIER_ABI,
                functionName: 'isProofValid',
                args: [agentId],
              }) as Promise<boolean>,
              publicClient.readContract({
                address: CONFIG.contracts.zkVerifier,
                abi: ZK_VERIFIER_ABI,
                functionName: 'getVerificationTimestamp',
                args: [agentId],
              }) as Promise<bigint>,
            ])

            // Only fetch proof data if a valid proof exists
            const proofData = isValid
              ? await publicClient.readContract({
                  address: CONFIG.contracts.zkVerifier,
                  abi: ZK_VERIFIER_ABI,
                  functionName: 'getLastProof',
                  args: [agentId],
                })
              : null

            return {
              agentId: agentId.toString(),
              hasValidProof: isValid,
              verifiedAt: timestamp.toString(),
              attestation: isValid
                ? {
                    revenueTier: proofData?.revenueTier,
                    reputationBand: proofData?.reputationBand,
                    proofExpiry: 'Valid for 7 days from verification',
                  }
                : null,
              note: isValid
                ? 'Agent has a valid ZK credit attestation on file'
                : 'No valid proof. Agent should submit a ZK proof via verifyCredit().',
            }
          }

          if (action === 'check_threshold') {
            const agentId = BigInt(params.agentId as string)
            const revenueThreshold = BigInt(params.revenueThreshold as string || '0')
            const minReputation = BigInt(params.minReputation as string || '300')

            const eligible = await publicClient.readContract({
              address: CONFIG.contracts.zkVerifier,
              abi: ZK_VERIFIER_ABI,
              functionName: 'isCreditEligible',
              args: [agentId, revenueThreshold, minReputation],
            }) as boolean

            return {
              agentId: agentId.toString(),
              eligible,
              revenueThreshold: formatUnits(revenueThreshold, 6),
              minReputation: minReputation.toString(),
              note: eligible
                ? 'Agent meets credit threshold (verified via ZK proof)'
                : 'Agent does not meet threshold or has no valid proof on file',
            }
          }

          return { error: `Unknown zk_verifier action: ${action}` }
        },
      },

      // ---------------------------------------------------------------
      // loan_negotiator — LLM-powered loan term negotiation
      // ---------------------------------------------------------------
      loan_negotiator: {
        description: 'LLM-powered loan term negotiation with borrowers',
        handler: async (action: string, params: Record<string, unknown>) => {
          const agentId = BigInt(params.agentId as string)

          // Fetch the borrower's on-chain credit profile (shared across actions)
          const [compositeScore, creditLineResult, loanStatus] = await Promise.all([
            publicClient.readContract({
              address: CONFIG.contracts.creditScorer,
              abi: CREDIT_SCORER_ABI,
              functionName: 'getCompositeScore',
              args: [agentId],
            }) as Promise<bigint>,
            publicClient.readContract({
              address: CONFIG.contracts.creditScorer,
              abi: CREDIT_SCORER_ABI,
              functionName: 'calculateCreditLine',
              args: [agentId],
            }) as Promise<[bigint, bigint]>,
            publicClient.readContract({
              address: CONFIG.contracts.agentCreditLine,
              abi: AGENT_CREDIT_LINE_ABI,
              functionName: 'getStatus',
              args: [agentId],
            }) as Promise<number>,
          ])

          const maxCreditLimit = creditLineResult[0]
          const baseRateBps = creditLineResult[1]
          const score = Number(compositeScore)
          const statusNames = ['ACTIVE', 'DELINQUENT', 'DEFAULT']
          const status = statusNames[loanStatus] || 'UNKNOWN'

          if (action === 'negotiate') {
            const proposedAmount = BigInt(params.amount as string)
            const proposedDurationDays = Number(params.durationDays || 90)
            const proposedRateBps = Number(params.preferredRateBps || 0)

            // Hard guard: cannot negotiate with non-ACTIVE agents
            if (loanStatus !== 0) {
              return {
                negotiated: false,
                reason: `Agent status is ${status}. Negotiation requires ACTIVE status.`,
              }
            }

            // Use LLM reasoning to evaluate the proposal and craft a counter-offer
            const thinking = await agent.think({
              context: {
                borrowerProposal: {
                  amount: formatUnits(proposedAmount, 6),
                  durationDays: proposedDurationDays,
                  preferredRateApr: proposedRateBps > 0 ? `${proposedRateBps / 100}%` : 'no preference',
                },
                creditProfile: {
                  compositeScore: score,
                  maxCreditLimit: formatUnits(maxCreditLimit, 6),
                  baseInterestRateApr: `${Number(baseRateBps) / 100}%`,
                  baseInterestRateBps: Number(baseRateBps),
                  status,
                },
                protocolBounds: {
                  minRateBps: 300,
                  maxRateBps: 2500,
                  minAmount: '10 USDT',
                  maxAmount: formatUnits(maxCreditLimit, 6),
                  minDurationDays: 7,
                  maxDurationDays: 365,
                },
              },
              prompt:
                'You are negotiating loan terms with a borrower agent. ' +
                'Analyze their proposal against their credit profile. ' +
                'Decide: (1) approved amount — up to their credit limit, reduce if score is low; ' +
                '(2) interest rate — start from the base rate, give a discount (up to 15% off base rate) if score > 700, add a premium (up to 20% above base rate) if score < 400; ' +
                '(3) duration — allow requested duration if revenue is consistent, shorten if score < 500. ' +
                'Return your decision as JSON with fields: approvedAmount (USDT string), approvedRateBps (number), approvedDurationDays (number), reasoning (string explaining each adjustment). ' +
                'Be fair but protect the protocol. Respond ONLY with the JSON object.',
            })

            // Parse LLM response — fall back to deterministic defaults if parsing fails
            let approvedAmount = proposedAmount > maxCreditLimit ? maxCreditLimit : proposedAmount
            let approvedRateBps = Number(baseRateBps)
            let approvedDurationDays = proposedDurationDays
            let reasoning = 'Deterministic fallback: terms set to CreditScorer defaults.'

            try {
              const jsonMatch = (thinking as string).match(/\{[\s\S]*\}/)
              if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[0])
                if (parsed.approvedAmount) {
                  const parsedAmt = BigInt(Math.round(parseFloat(parsed.approvedAmount) * 1e6))
                  approvedAmount = parsedAmt > maxCreditLimit ? maxCreditLimit : parsedAmt
                  if (approvedAmount < 10_000_000n) approvedAmount = 10_000_000n
                }
                if (parsed.approvedRateBps) {
                  approvedRateBps = Math.max(300, Math.min(2500, Number(parsed.approvedRateBps)))
                }
                if (parsed.approvedDurationDays) {
                  approvedDurationDays = Math.max(7, Math.min(365, Number(parsed.approvedDurationDays)))
                }
                if (parsed.reasoning) {
                  reasoning = parsed.reasoning
                }
              }
            } catch {
              // Keep deterministic defaults
            }

            return {
              negotiated: true,
              agentId: agentId.toString(),
              proposal: {
                amount: formatUnits(proposedAmount, 6),
                durationDays: proposedDurationDays,
                preferredRateBps: proposedRateBps,
              },
              counterOffer: {
                amount: formatUnits(approvedAmount, 6),
                interestRateBps: approvedRateBps,
                interestRateApr: `${approvedRateBps / 100}%`,
                durationDays: approvedDurationDays,
              },
              creditProfile: {
                compositeScore: score,
                maxCreditLimit: formatUnits(maxCreditLimit, 6),
                baseRateBps: Number(baseRateBps),
              },
              reasoning,
            }
          }

          if (action === 'evaluate_proposal') {
            const proposedAmount = BigInt(params.amount as string)
            const proposedDurationDays = Number(params.durationDays || 90)
            const proposedRateBps = Number(params.rateBps || 0)

            // Compute a fit score: how well does the proposal match the profile?
            let fitScore = 100

            // Amount fit: penalize if over credit limit
            if (proposedAmount > maxCreditLimit) {
              const overPct = Number((proposedAmount - maxCreditLimit) * 100n / maxCreditLimit)
              fitScore -= Math.min(50, overPct)
            }

            // Rate fit: penalize if below base rate
            if (proposedRateBps > 0 && proposedRateBps < Number(baseRateBps)) {
              const rateGap = Number(baseRateBps) - proposedRateBps
              fitScore -= Math.min(30, Math.round(rateGap / 10))
            }

            // Duration fit: penalize long durations for low scores
            if (score < 500 && proposedDurationDays > 90) {
              fitScore -= Math.min(20, Math.round((proposedDurationDays - 90) / 10))
            }

            fitScore = Math.max(0, fitScore)

            const flags: string[] = []
            if (proposedAmount > maxCreditLimit) flags.push('AMOUNT_EXCEEDS_CREDIT_LIMIT')
            if (proposedRateBps > 0 && proposedRateBps < Number(baseRateBps)) flags.push('RATE_BELOW_BASE')
            if (score < 500 && proposedDurationDays > 180) flags.push('DURATION_TOO_LONG_FOR_SCORE')
            if (loanStatus !== 0) flags.push(`AGENT_STATUS_${status}`)

            return {
              agentId: agentId.toString(),
              fitScore,
              flags,
              profile: {
                compositeScore: score,
                maxCreditLimit: formatUnits(maxCreditLimit, 6),
                baseRateBps: Number(baseRateBps),
                status,
              },
              viable: fitScore >= 50 && loanStatus === 0,
            }
          }

          if (action === 'finalize_terms') {
            const amount = BigInt(params.amount as string)
            const rateBps = Number(params.rateBps as string)
            const durationDays = Number(params.durationDays as string)

            // Validate finalized terms are within bounds
            if (amount > maxCreditLimit) {
              return { finalized: false, reason: 'AMOUNT_EXCEEDS_CREDIT_LIMIT' }
            }
            if (amount < 10_000_000n) {
              return { finalized: false, reason: 'BELOW_MIN_DRAWDOWN' }
            }
            if (rateBps < 300 || rateBps > 2500) {
              return { finalized: false, reason: 'RATE_OUT_OF_BOUNDS' }
            }
            if (loanStatus !== 0) {
              return { finalized: false, reason: `AGENT_STATUS_${status}` }
            }

            const negotiationId = `neg-${agentId}-${Date.now()}`

            return {
              finalized: true,
              negotiationId,
              agentId: agentId.toString(),
              terms: {
                amount: formatUnits(amount, 6),
                interestRateBps: rateBps,
                interestRateApr: `${rateBps / 100}%`,
                durationDays,
              },
              note: 'Terms locked. Use this negotiationId when submitting drawdown.',
            }
          }

          return { error: `Unknown loan_negotiator action: ${action}` }
        },
      },

      // ---------------------------------------------------------------
      // peer_lending — Agent-to-agent lending across vaults
      // ---------------------------------------------------------------
      peer_lending: {
        description: 'Agent-to-agent lending across vaults',
        handler: async (action: string, params: Record<string, unknown>) => {
          if (action === 'find_liquidity') {
            const agentIds = (params.agentIds as string[]).map((id) => BigInt(id))

            const results: { agentId: string; vault: Address; availableLiquidity: string; totalAssets: string }[] = []

            for (const id of agentIds) {
              try {
                const isRegistered = await publicClient.readContract({
                  address: CONFIG.contracts.agentRegistry,
                  abi: AGENT_REGISTRY_ABI,
                  functionName: 'isRegistered',
                  args: [id],
                }) as boolean
                if (!isRegistered) continue

                const vaultAddr = await publicClient.readContract({
                  address: CONFIG.contracts.agentVaultFactory,
                  abi: AGENT_VAULT_FACTORY_ABI,
                  functionName: 'getVault',
                  args: [id],
                }) as Address

                const [liquidity, totalAssets, frozen] = await Promise.all([
                  publicClient.readContract({ address: vaultAddr, abi: AGENT_VAULT_ABI, functionName: 'availableLiquidity' }) as Promise<bigint>,
                  publicClient.readContract({ address: vaultAddr, abi: AGENT_VAULT_ABI, functionName: 'totalAssets' }) as Promise<bigint>,
                  publicClient.readContract({ address: vaultAddr, abi: AGENT_VAULT_ABI, functionName: 'frozen' }) as Promise<boolean>,
                ])

                if (frozen || liquidity === 0n) continue

                results.push({
                  agentId: id.toString(),
                  vault: vaultAddr,
                  availableLiquidity: formatUnits(liquidity, 6),
                  totalAssets: formatUnits(totalAssets, 6),
                })
              } catch {
                // Skip agents whose vault lookup fails
              }
            }

            // Sort by available liquidity descending
            results.sort((a, b) => parseFloat(b.availableLiquidity) - parseFloat(a.availableLiquidity))

            return {
              vaultsScanned: agentIds.length,
              vaultsWithLiquidity: results.length,
              vaults: results,
            }
          }

          if (action === 'request_peer_loan') {
            const sourceAgentId = BigInt(params.sourceAgentId as string)
            const destAgentId = BigInt(params.destAgentId as string)
            const amount = BigInt(params.amount as string)

            // Validate both agents are registered
            const [sourceRegistered, destRegistered] = await Promise.all([
              publicClient.readContract({ address: CONFIG.contracts.agentRegistry, abi: AGENT_REGISTRY_ABI, functionName: 'isRegistered', args: [sourceAgentId] }) as Promise<boolean>,
              publicClient.readContract({ address: CONFIG.contracts.agentRegistry, abi: AGENT_REGISTRY_ABI, functionName: 'isRegistered', args: [destAgentId] }) as Promise<boolean>,
            ])

            if (!sourceRegistered) return { requested: false, reason: 'SOURCE_AGENT_NOT_REGISTERED' }
            if (!destRegistered) return { requested: false, reason: 'DEST_AGENT_NOT_REGISTERED' }

            // Check source vault has liquidity
            const sourceVault = await publicClient.readContract({
              address: CONFIG.contracts.agentVaultFactory,
              abi: AGENT_VAULT_FACTORY_ABI,
              functionName: 'getVault',
              args: [sourceAgentId],
            }) as Address

            const sourceLiquidity = await publicClient.readContract({
              address: sourceVault,
              abi: AGENT_VAULT_ABI,
              functionName: 'availableLiquidity',
            }) as bigint

            if (sourceLiquidity < amount) {
              return {
                requested: false,
                reason: 'INSUFFICIENT_SOURCE_LIQUIDITY',
                available: formatUnits(sourceLiquidity, 6),
                requested_amount: formatUnits(amount, 6),
              }
            }

            // Get destination agent's credit profile for terms
            const [destScore, destCreditLine] = await Promise.all([
              publicClient.readContract({ address: CONFIG.contracts.creditScorer, abi: CREDIT_SCORER_ABI, functionName: 'getCompositeScore', args: [destAgentId] }) as Promise<bigint>,
              publicClient.readContract({ address: CONFIG.contracts.creditScorer, abi: CREDIT_SCORER_ABI, functionName: 'calculateCreditLine', args: [destAgentId] }) as Promise<[bigint, bigint]>,
            ])

            const requestId = `peer-${sourceAgentId}-${destAgentId}-${Date.now()}`

            return {
              requested: true,
              requestId,
              sourceAgentId: sourceAgentId.toString(),
              destAgentId: destAgentId.toString(),
              amount: formatUnits(amount, 6),
              sourceVault,
              sourceLiquidityAvailable: formatUnits(sourceLiquidity, 6),
              destCreditProfile: {
                compositeScore: destScore.toString(),
                creditLimit: formatUnits(destCreditLine[0], 6),
                interestRateBps: destCreditLine[1].toString(),
              },
              note: 'Peer loan request structured. Submit to approve_peer_loan for pre-flight checks.',
            }
          }

          if (action === 'approve_peer_loan') {
            const sourceAgentId = BigInt(params.sourceAgentId as string)
            const destAgentId = BigInt(params.destAgentId as string)
            const amount = BigInt(params.amount as string)

            // Pre-flight: both registered
            const [sourceRegistered, destRegistered] = await Promise.all([
              publicClient.readContract({ address: CONFIG.contracts.agentRegistry, abi: AGENT_REGISTRY_ABI, functionName: 'isRegistered', args: [sourceAgentId] }) as Promise<boolean>,
              publicClient.readContract({ address: CONFIG.contracts.agentRegistry, abi: AGENT_REGISTRY_ABI, functionName: 'isRegistered', args: [destAgentId] }) as Promise<boolean>,
            ])
            if (!sourceRegistered) return { approved: false, reason: 'SOURCE_AGENT_NOT_REGISTERED' }
            if (!destRegistered) return { approved: false, reason: 'DEST_AGENT_NOT_REGISTERED' }

            // Pre-flight: source has liquidity
            const sourceVault = await publicClient.readContract({
              address: CONFIG.contracts.agentVaultFactory,
              abi: AGENT_VAULT_FACTORY_ABI,
              functionName: 'getVault',
              args: [sourceAgentId],
            }) as Address

            const [sourceLiquidity, sourceFrozen] = await Promise.all([
              publicClient.readContract({ address: sourceVault, abi: AGENT_VAULT_ABI, functionName: 'availableLiquidity' }) as Promise<bigint>,
              publicClient.readContract({ address: sourceVault, abi: AGENT_VAULT_ABI, functionName: 'frozen' }) as Promise<boolean>,
            ])

            if (sourceFrozen) return { approved: false, reason: 'SOURCE_VAULT_FROZEN' }
            if (sourceLiquidity < amount) {
              return {
                approved: false,
                reason: 'INSUFFICIENT_SOURCE_LIQUIDITY',
                available: formatUnits(sourceLiquidity, 6),
                requested: formatUnits(amount, 6),
              }
            }

            // Pre-flight: destination agent is ACTIVE with good credit
            const [destStatus, destScore] = await Promise.all([
              publicClient.readContract({ address: CONFIG.contracts.agentCreditLine, abi: AGENT_CREDIT_LINE_ABI, functionName: 'getStatus', args: [destAgentId] }) as Promise<number>,
              publicClient.readContract({ address: CONFIG.contracts.creditScorer, abi: CREDIT_SCORER_ABI, functionName: 'getCompositeScore', args: [destAgentId] }) as Promise<bigint>,
            ])

            const statusNames = ['ACTIVE', 'DELINQUENT', 'DEFAULT']
            if (destStatus !== 0) {
              return { approved: false, reason: `DEST_AGENT_STATUS_${statusNames[destStatus]}` }
            }
            if (Number(destScore) < CONFIG.minScoreForApproval) {
              return {
                approved: false,
                reason: 'DEST_AGENT_SCORE_BELOW_THRESHOLD',
                score: destScore.toString(),
                threshold: CONFIG.minScoreForApproval,
              }
            }

            // Get destination credit line for terms
            const destCreditLine = await publicClient.readContract({
              address: CONFIG.contracts.creditScorer,
              abi: CREDIT_SCORER_ABI,
              functionName: 'calculateCreditLine',
              args: [destAgentId],
            }) as [bigint, bigint]

            return {
              approved: true,
              sourceAgentId: sourceAgentId.toString(),
              destAgentId: destAgentId.toString(),
              amount: formatUnits(amount, 6),
              sourceVault,
              destCreditProfile: {
                compositeScore: destScore.toString(),
                creditLimit: formatUnits(destCreditLine[0], 6),
                interestRateBps: destCreditLine[1].toString(),
              },
              note: 'Peer loan approved. Source agent can deposit into destination agent vault via AgentVault.deposit().',
            }
          }

          if (action === 'track_peer_exposure') {
            // Track exposure across a list of agent pairs
            const pairs = params.pairs as { sourceAgentId: string; destAgentId: string }[]

            const exposures: {
              sourceAgentId: string
              destAgentId: string
              destOutstanding: string
              sourceVaultTotalAssets: string
              concentrationPct: string
              warning: boolean
            }[] = []

            let totalExposure = 0n

            for (const pair of pairs) {
              try {
                const sourceId = BigInt(pair.sourceAgentId)
                const destId = BigInt(pair.destAgentId)

                const sourceVault = await publicClient.readContract({
                  address: CONFIG.contracts.agentVaultFactory,
                  abi: AGENT_VAULT_FACTORY_ABI,
                  functionName: 'getVault',
                  args: [sourceId],
                }) as Address

                const [destOutstanding, sourceTotalAssets] = await Promise.all([
                  publicClient.readContract({ address: CONFIG.contracts.agentCreditLine, abi: AGENT_CREDIT_LINE_ABI, functionName: 'getOutstanding', args: [destId] }) as Promise<bigint>,
                  publicClient.readContract({ address: sourceVault, abi: AGENT_VAULT_ABI, functionName: 'totalAssets' }) as Promise<bigint>,
                ])

                const concentrationPct = sourceTotalAssets > 0n
                  ? Number((destOutstanding * 10000n) / sourceTotalAssets) / 100
                  : 0

                totalExposure += destOutstanding

                exposures.push({
                  sourceAgentId: pair.sourceAgentId,
                  destAgentId: pair.destAgentId,
                  destOutstanding: formatUnits(destOutstanding, 6),
                  sourceVaultTotalAssets: formatUnits(sourceTotalAssets, 6),
                  concentrationPct: `${concentrationPct.toFixed(2)}%`,
                  warning: concentrationPct > 50,
                })
              } catch {
                // Skip pairs with lookup failures
              }
            }

            return {
              pairsTracked: pairs.length,
              pairsResolved: exposures.length,
              totalPeerExposure: formatUnits(totalExposure, 6),
              exposures,
              hasConcentrationWarning: exposures.some((e) => e.warning),
            }
          }

          return { error: `Unknown peer_lending action: ${action}` }
        },
      },
    },
  })

  return agent
}

// ---------------------------------------------------------------------------
// Main Loop — Full Credit Assessment & Monitoring Cycle
// ---------------------------------------------------------------------------

async function runLendingLoop(agent: InstanceType<typeof OpenClaw>) {
  console.log(`[lending-agent] Monitoring loop started (${CONFIG.pollIntervalMs}ms interval)`)

  const tick = async () => {
    try {
      // 1. Check agent credit line status
      const loanStatus = await agent.tool('loan_manager', 'status', {
        agentId: CONFIG.agentId,
      })
      console.log(`[lending-agent] Status: ${loanStatus.status} | Outstanding: ${loanStatus.outstanding} USDT`)

      // 2. Score the agent
      const score = await agent.tool('credit_scorer', 'score', {
        agentId: CONFIG.agentId,
      })
      console.log(`[lending-agent] Composite score: ${score.compositeScore}/100`)

      // 3. Get score breakdown for detailed analysis
      const breakdown = await agent.tool('credit_scorer', 'breakdown', {
        agentId: CONFIG.agentId,
      })

      // 4. Monitor revenue health
      const revenueStats = await agent.tool('revenue_monitor', 'stats', {})

      // 5. Check for revenue alerts
      const alerts = await agent.tool('revenue_monitor', 'alert_check', {})
      if (!alerts.healthy) {
        console.warn(`[lending-agent] Revenue alerts: ${alerts.alerts.join('; ')}`)
      }

      // 6. Track repayment progress if there is outstanding debt
      if (loanStatus.status !== 'ACTIVE' || parseFloat(loanStatus.outstanding) > 0) {
        const repayment = await agent.tool('loan_manager', 'track_repayment', {
          agentId: CONFIG.agentId,
        })
        console.log(`[lending-agent] Repayment: ${repayment.repaymentPct} of ${repayment.totalBorrowed} USDT`)
      }

      // 7. Detect delinquency and take action
      if (loanStatus.status === 'DELINQUENT') {
        const flagResult = await agent.tool('loan_manager', 'flag_delinquent', {
          agentId: CONFIG.agentId,
        })
        console.warn(`[lending-agent] DELINQUENT: ${flagResult.recommendation}`)
      }

      // 8. Handle DEFAULT — check if vault freeze is needed
      if (loanStatus.status === 'DEFAULT') {
        const freezeResult = await agent.tool('loan_manager', 'trigger_freeze', {
          agentId: CONFIG.agentId,
        })
        console.error(`[lending-agent] DEFAULT: ${freezeResult.note}`)
      }

      // 9. Check wallet gas balance
      const walletBalance = await agent.tool('wdk_wallet', 'balance', {})
      if (parseFloat(walletBalance.eth) < 0.001) {
        console.warn(`[lending-agent] Low gas: ${walletBalance.eth} ETH — pausing non-critical ops`)
      }

      // 10. Let the agent reason about the data and make autonomous decisions
      await agent.think({
        context: { loanStatus, score, breakdown, revenueStats, alerts, walletBalance },
        prompt:
          'Evaluate current credit positions. If revenue is healthy and agent is ACTIVE, ' +
          'assess readiness for drawdown requests. If DELINQUENT, recommend escalation. ' +
          'If DEFAULT, confirm vault freeze status. Report concisely.',
      })
    } catch (err) {
      console.error('[lending-agent] Tick error:', err)
    }
  }

  // Initial tick
  await tick()

  // Poll loop
  setInterval(tick, CONFIG.pollIntervalMs)
}

// ---------------------------------------------------------------------------
// Entrypoint
// ---------------------------------------------------------------------------

async function main() {
  console.log('[lending-agent] Lenclaw Lending Agent starting...')
  console.log('[lending-agent] Protocol: Lenclaw | Runtime: OpenClaw | Wallet: Tether WDK')

  const wallet = await initWallet()
  const agent = await initAgent(wallet)

  console.log('[lending-agent] OpenClaw agent initialized with SOUL.md')
  console.log(`[lending-agent] Contracts: CreditScorer=${CONFIG.contracts.creditScorer}`)
  console.log(`[lending-agent] Min approval score: ${CONFIG.minScoreForApproval}/100`)

  await runLendingLoop(agent)
}

main().catch((err) => {
  console.error('[lending-agent] Fatal:', err)
  process.exit(1)
})

// ---------------------------------------------------------------------------
// ABIs — Minimal entries matching actual contract function signatures
// ---------------------------------------------------------------------------

const ERC20_ABI = [
  { inputs: [{ name: 'account', type: 'address' }], name: 'balanceOf', outputs: [{ type: 'uint256' }], stateMutability: 'view', type: 'function' },
  { inputs: [{ name: 'to', type: 'address' }, { name: 'amount', type: 'uint256' }], name: 'transfer', outputs: [{ type: 'bool' }], stateMutability: 'nonpayable', type: 'function' },
  { inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }], name: 'approve', outputs: [{ type: 'bool' }], stateMutability: 'nonpayable', type: 'function' },
] as const

const CREDIT_SCORER_ABI = [
  { inputs: [{ name: 'agentId', type: 'uint256' }], name: 'getCompositeScore', outputs: [{ type: 'uint256' }], stateMutability: 'view', type: 'function' },
  { inputs: [{ name: 'agentId', type: 'uint256' }], name: 'calculateCreditLine', outputs: [{ name: 'creditLimit', type: 'uint256' }, { name: 'interestRateBps', type: 'uint256' }], stateMutability: 'view', type: 'function' },
] as const

const REVENUE_LOCKBOX_ABI = [
  { inputs: [], name: 'totalRevenueCapture', outputs: [{ type: 'uint256' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'totalRepaid', outputs: [{ type: 'uint256' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'repaymentRateBps', outputs: [{ type: 'uint256' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'pendingRepayment', outputs: [{ type: 'uint256' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'currentEpoch', outputs: [{ type: 'uint256' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'epochsWithRevenue', outputs: [{ type: 'uint256' }], stateMutability: 'view', type: 'function' },
  { inputs: [{ name: 'epoch', type: 'uint256' }], name: 'revenueByEpoch', outputs: [{ type: 'uint256' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'processRevenue', outputs: [], stateMutability: 'nonpayable', type: 'function' },
] as const

const AGENT_CREDIT_LINE_ABI = [
  { inputs: [{ name: 'agentId', type: 'uint256' }], name: 'getOutstanding', outputs: [{ type: 'uint256' }], stateMutability: 'view', type: 'function' },
  { inputs: [{ name: 'agentId', type: 'uint256' }], name: 'getStatus', outputs: [{ type: 'uint8' }], stateMutability: 'view', type: 'function' },
  { inputs: [{ name: 'agentId', type: 'uint256' }], name: 'facilities', outputs: [{ name: 'principal', type: 'uint256' }, { name: 'accruedInterest', type: 'uint256' }, { name: 'lastAccrualTimestamp', type: 'uint256' }, { name: 'interestRateBps', type: 'uint256' }, { name: 'creditLimit', type: 'uint256' }, { name: 'status', type: 'uint8' }], stateMutability: 'view', type: 'function' },
  { inputs: [{ name: 'agentId', type: 'uint256' }], name: 'lastPaymentTimestamp', outputs: [{ type: 'uint256' }], stateMutability: 'view', type: 'function' },
  { inputs: [{ name: 'agentId', type: 'uint256' }], name: 'loansRepaid', outputs: [{ type: 'uint256' }], stateMutability: 'view', type: 'function' },
  { inputs: [{ name: 'agentId', type: 'uint256' }], name: 'totalAmountBorrowed', outputs: [{ type: 'uint256' }], stateMutability: 'view', type: 'function' },
  { inputs: [{ name: 'agentId', type: 'uint256' }], name: 'updateStatus', outputs: [], stateMutability: 'nonpayable', type: 'function' },
  { inputs: [{ name: 'agentId', type: 'uint256' }, { name: 'amount', type: 'uint256' }], name: 'drawdown', outputs: [], stateMutability: 'nonpayable', type: 'function' },
  { inputs: [{ name: 'agentId', type: 'uint256' }], name: 'refreshCreditLine', outputs: [], stateMutability: 'nonpayable', type: 'function' },
] as const

const AGENT_REGISTRY_ABI = [
  {
    inputs: [{ name: 'agentId', type: 'uint256' }],
    name: 'getAgent',
    outputs: [{
      type: 'tuple',
      components: [
        { name: 'wallet', type: 'address' },
        { name: 'smartWallet', type: 'address' },
        { name: 'codeHash', type: 'bytes32' },
        { name: 'metadata', type: 'string' },
        { name: 'reputationScore', type: 'uint256' },
        { name: 'codeVerified', type: 'bool' },
        { name: 'lockbox', type: 'address' },
        { name: 'vault', type: 'address' },
        { name: 'registeredAt', type: 'uint256' },
        { name: 'externalToken', type: 'address' },
        { name: 'externalProtocolId', type: 'uint256' },
        { name: 'agentCategory', type: 'bytes32' },
      ],
    }],
    stateMutability: 'view',
    type: 'function',
  },
  { inputs: [{ name: 'agentId', type: 'uint256' }], name: 'isRegistered', outputs: [{ type: 'bool' }], stateMutability: 'view', type: 'function' },
] as const

const AGENT_VAULT_ABI = [
  { inputs: [], name: 'totalAssets', outputs: [{ type: 'uint256' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'totalBorrowed', outputs: [{ type: 'uint256' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'availableLiquidity', outputs: [{ type: 'uint256' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'utilizationRate', outputs: [{ type: 'uint256' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'frozen', outputs: [{ type: 'bool' }], stateMutability: 'view', type: 'function' },
  { inputs: [{ name: 'assets', type: 'uint256' }, { name: 'receiver', type: 'address' }], name: 'deposit', outputs: [{ type: 'uint256' }], stateMutability: 'nonpayable', type: 'function' },
  { inputs: [{ name: 'assets', type: 'uint256' }, { name: 'receiver', type: 'address' }, { name: 'owner', type: 'address' }], name: 'withdraw', outputs: [{ type: 'uint256' }], stateMutability: 'nonpayable', type: 'function' },
] as const

const AGENT_VAULT_FACTORY_ABI = [
  { inputs: [{ name: 'agentId', type: 'uint256' }], name: 'getVault', outputs: [{ type: 'address' }], stateMutability: 'view', type: 'function' },
  { inputs: [{ name: 'agentId', type: 'uint256' }, { name: '_frozen', type: 'bool' }], name: 'freezeVault', outputs: [], stateMutability: 'nonpayable', type: 'function' },
] as const

const ZK_VERIFIER_ABI = [
  {
    inputs: [{
      name: 'proofData',
      type: 'tuple',
      components: [
        { name: 'proof', type: 'bytes' },
        { name: 'revenueThreshold', type: 'uint64' },
        { name: 'registeredCodeHash', type: 'bytes32' },
        { name: 'minReputation', type: 'uint64' },
        { name: 'agentId', type: 'uint256' },
        { name: 'revenueTier', type: 'uint8' },
        { name: 'reputationBand', type: 'uint8' },
      ],
    }],
    name: 'verifyCredit',
    outputs: [{ type: 'bool' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  { inputs: [{ name: 'agentId', type: 'uint256' }], name: 'isProofValid', outputs: [{ type: 'bool' }], stateMutability: 'view', type: 'function' },
  { inputs: [{ name: 'agentId', type: 'uint256' }], name: 'getVerificationTimestamp', outputs: [{ type: 'uint256' }], stateMutability: 'view', type: 'function' },
  {
    inputs: [{ name: 'agentId', type: 'uint256' }],
    name: 'getLastProof',
    outputs: [{
      type: 'tuple',
      components: [
        { name: 'proof', type: 'bytes' },
        { name: 'revenueThreshold', type: 'uint64' },
        { name: 'registeredCodeHash', type: 'bytes32' },
        { name: 'minReputation', type: 'uint64' },
        { name: 'agentId', type: 'uint256' },
        { name: 'revenueTier', type: 'uint8' },
        { name: 'reputationBand', type: 'uint8' },
      ],
    }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { name: 'agentId', type: 'uint256' },
      { name: 'revenueThreshold', type: 'uint64' },
      { name: 'minReputation', type: 'uint64' },
    ],
    name: 'isCreditEligible',
    outputs: [{ type: 'bool' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const
