import express from 'express'
import cors from 'cors'
import WDK from '@tetherto/wdk'
import WalletManagerEvm from '@tetherto/wdk-wallet-evm'

const app = express()
app.use(cors())
app.use(express.json())

const PORT = process.env.WDK_API_PORT || 3002
const BASE_RPC = process.env.BASE_RPC || 'https://mainnet.base.org'
const USDC_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'

// In-memory WDK instances keyed by session (for demo purposes)
const sessions = new Map()

async function getOrCreateWDK(seedPhrase) {
  const existing = sessions.get(seedPhrase)
  if (existing) return existing

  const wdk = new WDK(seedPhrase)
  wdk.registerWallet('base', WalletManagerEvm, { provider: BASE_RPC })
  sessions.set(seedPhrase, wdk)
  return wdk
}

// POST /api/wdk/create — Generate new wallet
app.post('/api/wdk/create', async (req, res) => {
  try {
    const seedPhrase = WDK.getRandomSeedPhrase()
    const wdk = await getOrCreateWDK(seedPhrase)
    const account = await wdk.getAccount('base', 0)
    const address = await account.getAddress()

    res.json({ address, seedPhrase })
  } catch (err) {
    console.error('[WDK] Create error:', err)
    res.status(500).json({ error: err.message || 'Failed to create wallet' })
  }
})

// POST /api/wdk/restore — Restore wallet from seed
app.post('/api/wdk/restore', async (req, res) => {
  try {
    const { seedPhrase } = req.body
    if (!seedPhrase) return res.status(400).json({ error: 'seedPhrase is required' })

    if (!WDK.isValidSeed(seedPhrase)) {
      return res.status(400).json({ error: 'Invalid seed phrase' })
    }

    const wdk = await getOrCreateWDK(seedPhrase)
    const account = await wdk.getAccount('base', 0)
    const address = await account.getAddress()

    res.json({ address, seedPhrase })
  } catch (err) {
    console.error('[WDK] Restore error:', err)
    res.status(500).json({ error: err.message || 'Failed to restore wallet' })
  }
})

// POST /api/wdk/validate — Check if seed phrase is valid
app.post('/api/wdk/validate', async (req, res) => {
  try {
    const { seedPhrase } = req.body
    if (!seedPhrase) return res.status(400).json({ valid: false })
    const valid = WDK.isValidSeed(seedPhrase)
    res.json({ valid })
  } catch {
    res.json({ valid: false })
  }
})

// POST /api/wdk/balance — Get balances for a wallet
app.post('/api/wdk/balance', async (req, res) => {
  try {
    const { seedPhrase } = req.body
    if (!seedPhrase) return res.status(400).json({ error: 'seedPhrase is required' })

    const wdk = await getOrCreateWDK(seedPhrase)
    const account = await wdk.getAccount('base', 0)
    const address = await account.getAddress()

    let ethBalance = '0'
    let usdcBalance = '0'

    try {
      const eth = await account.getBalance()
      ethBalance = eth.toString()
    } catch { /* provider may be unavailable */ }

    try {
      const usdc = await account.getTokenBalance(USDC_ADDRESS)
      usdcBalance = usdc.toString()
    } catch { /* provider may be unavailable */ }

    res.json({ address, ethBalance, usdcBalance })
  } catch (err) {
    console.error('[WDK] Balance error:', err)
    res.status(500).json({ error: err.message || 'Failed to fetch balances' })
  }
})

// Health check
app.get('/api/wdk/health', (req, res) => {
  res.json({ status: 'ok', runtime: 'node' })
})

app.listen(PORT, () => {
  console.log(`[WDK API] Running on http://localhost:${PORT}`)
  console.log(`[WDK API] Base RPC: ${BASE_RPC}`)
})
