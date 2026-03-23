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
  createWalletClient,
  http,
  encodeFunctionData,
  formatUnits,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
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
    usdc: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as Address,
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
            const [ethBalance, usdcBalance] = await Promise.all([
              publicClient.getBalance({ address: target }),
              publicClient.readContract({
                address: CONFIG.contracts.usdc,
                abi: ERC20_ABI,
                functionName: 'balanceOf',
                args: [target],
              }),
            ])
            return {
              eth: formatUnits(ethBalance, 18),
              usdc: formatUnits(usdcBalance as bigint, 6),
              rawEth: ethBalance.toString(),
              rawUsdc: (usdcBalance as bigint).toString(),
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
            // Approve + transfer USDC
            const transferData = encodeFunctionData({
              abi: ERC20_ABI,
              functionName: 'transfer',
              args: [to, amount],
            })
            const txHash = await wallet.account.sendTransaction({
              to: CONFIG.contracts.usdc,
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
            // Check lockbox USDC balance to see if new revenue has arrived
            const lockboxBalance = await publicClient.readContract({
              address: CONFIG.contracts.usdc,
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
              return { approved: false, reason: 'BELOW_MIN_DRAWDOWN', minimum: '10 USDC' }
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
                    revenueTier: (proofData as any)?.revenueTier,
                    reputationBand: (proofData as any)?.reputationBand,
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
      console.log(`[lending-agent] Status: ${loanStatus.status} | Outstanding: ${loanStatus.outstanding} USDC`)

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
        console.log(`[lending-agent] Repayment: ${repayment.repaymentPct} of ${repayment.totalBorrowed} USDC`)
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
