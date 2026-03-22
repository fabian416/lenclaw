/**
 * Lenclaw Lending Agent — OpenClaw + WDK Entry Point
 *
 * Autonomous lending agent that evaluates AI agent creditworthiness,
 * approves/denies credit lines, and monitors repayments on the
 * Lenclaw protocol using Tether WDK for wallet operations.
 */

import OpenClaw from 'openclaw'
import WDK from '@tetherto/wdk'
import { type Address, createPublicClient, http } from 'viem'
import { base } from 'viem/chains'

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const CONFIG = {
  agentId: process.env.AGENT_ID!,
  rpcUrl: process.env.BASE_RPC_URL || 'https://mainnet.base.org',
  soulPath: new URL('./SOUL.md', import.meta.url).pathname,
  contracts: {
    creditScorer: process.env.CREDIT_SCORER_ADDRESS as Address,
    agentCreditLine: process.env.AGENT_CREDIT_LINE_ADDRESS as Address,
    revenueLockbox: process.env.REVENUE_LOCKBOX_ADDRESS as Address,
    agentRegistry: process.env.AGENT_REGISTRY_ADDRESS as Address,
    agentVault: process.env.AGENT_VAULT_ADDRESS as Address,
    zkVerifier: process.env.ZK_VERIFIER_ADDRESS as Address,
    usdc: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as Address,
  },
  pollIntervalMs: 30_000,
  minScoreForApproval: 350,
}

// ---------------------------------------------------------------------------
// WDK Wallet Setup
// ---------------------------------------------------------------------------

async function initWallet() {
  const wdk = new WDK({ seed: process.env.WDK_SEED })
  const wallet = await wdk.createWallet({ chain: 'base' })

  console.log(`[lending-agent] WDK wallet ready: ${wallet.address}`)
  return { wdk, wallet }
}

// ---------------------------------------------------------------------------
// OpenClaw Agent Setup
// ---------------------------------------------------------------------------

async function initAgent(walletAddress: Address) {
  const agent = new OpenClaw({
    soul: CONFIG.soulPath,
    tools: {
      wdk_wallet: {
        description: 'Self-custodial wallet via Tether WDK',
        handler: async (action: string, params: Record<string, unknown>) => {
          // WDK wallet operations are handled by the runtime
          return { action, params, wallet: walletAddress }
        },
      },
      credit_scorer: {
        description: 'On-chain 5-factor credit assessment',
        handler: async (action: string, params: Record<string, unknown>) => {
          const client = createPublicClient({ chain: base, transport: http(CONFIG.rpcUrl) })
          if (action === 'score') {
            return client.readContract({
              address: CONFIG.contracts.creditScorer,
              abi: CREDIT_SCORER_ABI,
              functionName: 'calculateCompositeScore',
              args: [BigInt(params.agentId as string)],
            })
          }
          if (action === 'credit_line') {
            return client.readContract({
              address: CONFIG.contracts.creditScorer,
              abi: CREDIT_SCORER_ABI,
              functionName: 'calculateCreditLine',
              args: [BigInt(params.agentId as string)],
            })
          }
        },
      },
      revenue_monitor: {
        description: 'RevenueLockbox polling and analysis',
        handler: async (action: string, params: Record<string, unknown>) => {
          const client = createPublicClient({ chain: base, transport: http(CONFIG.rpcUrl) })
          return client.readContract({
            address: CONFIG.contracts.revenueLockbox,
            abi: REVENUE_LOCKBOX_ABI,
            functionName: action === 'stats' ? 'getStats' : 'pendingRepayment',
          })
        },
      },
      loan_manager: {
        description: 'AgentCreditLine drawdown/repayment lifecycle',
        handler: async (action: string, params: Record<string, unknown>) => {
          const client = createPublicClient({ chain: base, transport: http(CONFIG.rpcUrl) })
          if (action === 'status') {
            const [outstanding, status] = await Promise.all([
              client.readContract({
                address: CONFIG.contracts.agentCreditLine,
                abi: AGENT_CREDIT_LINE_ABI,
                functionName: 'outstandingDebt',
                args: [BigInt(params.agentId as string)],
              }),
              client.readContract({
                address: CONFIG.contracts.agentCreditLine,
                abi: AGENT_CREDIT_LINE_ABI,
                functionName: 'getStatus',
                args: [BigInt(params.agentId as string)],
              }),
            ])
            return { outstanding, status }
          }
        },
      },
      zk_verifier: {
        description: 'ZK credit proof verification',
        handler: async (action: string, params: Record<string, unknown>) => {
          const client = createPublicClient({ chain: base, transport: http(CONFIG.rpcUrl) })
          return client.readContract({
            address: CONFIG.contracts.zkVerifier,
            abi: ZK_VERIFIER_ABI,
            functionName: 'verifyProof',
            args: [params.proof],
          })
        },
      },
    },
  })

  return agent
}

// ---------------------------------------------------------------------------
// Main Loop — Credit Assessment & Monitoring
// ---------------------------------------------------------------------------

async function runLendingLoop(agent: InstanceType<typeof OpenClaw>) {
  console.log(`[lending-agent] Monitoring loop started (${CONFIG.pollIntervalMs}ms interval)`)

  const tick = async () => {
    try {
      // 1. Check for pending credit requests
      const pendingRequests = await agent.tool('loan_manager', 'status', {
        agentId: CONFIG.agentId,
      })

      // 2. Score the agent
      const score = await agent.tool('credit_scorer', 'score', {
        agentId: CONFIG.agentId,
      })

      // 3. Monitor revenue health
      const revenueStats = await agent.tool('revenue_monitor', 'stats', {})

      // 4. Let the agent reason about the data and decide
      await agent.think({
        context: { pendingRequests, score, revenueStats },
        prompt: 'Evaluate current credit positions. Flag any delinquencies. Report status.',
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

  const { wallet } = await initWallet()
  const agent = await initAgent(wallet.address as Address)

  console.log('[lending-agent] OpenClaw agent initialized with SOUL.md')
  console.log(`[lending-agent] Contracts: CreditScorer=${CONFIG.contracts.creditScorer}`)
  console.log(`[lending-agent] Min approval score: ${CONFIG.minScoreForApproval}/1000`)

  await runLendingLoop(agent)
}

main().catch((err) => {
  console.error('[lending-agent] Fatal:', err)
  process.exit(1)
})

// ---------------------------------------------------------------------------
// ABI stubs (minimal for type safety — full ABIs loaded from contract artifacts)
// ---------------------------------------------------------------------------

const CREDIT_SCORER_ABI = [
  { inputs: [{ name: 'agentId', type: 'uint256' }], name: 'calculateCompositeScore', outputs: [{ type: 'uint256' }], stateMutability: 'view', type: 'function' },
  { inputs: [{ name: 'agentId', type: 'uint256' }], name: 'calculateCreditLine', outputs: [{ type: 'uint256' }], stateMutability: 'view', type: 'function' },
] as const

const REVENUE_LOCKBOX_ABI = [
  { inputs: [], name: 'getStats', outputs: [{ type: 'tuple', components: [{ name: 'totalRevenueCaptured', type: 'uint256' }, { name: 'totalRepaid', type: 'uint256' }, { name: 'repaymentRateBps', type: 'uint256' }, { name: 'pendingRepayment', type: 'uint256' }, { name: 'currentEpoch', type: 'uint256' }] }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'pendingRepayment', outputs: [{ type: 'uint256' }], stateMutability: 'view', type: 'function' },
] as const

const AGENT_CREDIT_LINE_ABI = [
  { inputs: [{ name: 'agentId', type: 'uint256' }], name: 'outstandingDebt', outputs: [{ type: 'uint256' }], stateMutability: 'view', type: 'function' },
  { inputs: [{ name: 'agentId', type: 'uint256' }], name: 'getStatus', outputs: [{ type: 'uint8' }], stateMutability: 'view', type: 'function' },
] as const

const ZK_VERIFIER_ABI = [
  { inputs: [{ name: 'proof', type: 'bytes' }], name: 'verifyProof', outputs: [{ type: 'bool' }], stateMutability: 'view', type: 'function' },
] as const
