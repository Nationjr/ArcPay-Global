/**
 * ArcPayAgent — background agent for ArcPay Global POS
 *
 * Responsibilities:
 * 1. StableFX Hedging — monitor live FX rates, emit locked USDC quotes valid for 60 s
 * 2. EOD Yield Scheduler — cron at 23:59 to call sweepToYield(); unsweep at 06:00
 * 3. Payment event watcher — logs PaymentReceived events for x402 nanopayment hooks
 *
 * Run: bun run server/ArcPayAgent.ts
 *
 * Environment variables:
 *   RPC_PROXY_BASE_URL, RPC_PROXY_TOKEN, RPC_PROXY_CHAINS — Circle RPC proxy
 *   VITE_CONTRACT_ADDRESS — deployed ArcPayCore address
 *   AGENT_PRIVATE_KEY — optional; enables automated yield sweeps
 *   MERCHANT_ADDRESS — optional; merchant to schedule yield sweeps for
 */

import { createPublicClient, http, createWalletClient, parseAbi, type Address } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { requireChain } from '../src/onchain-facts'

// ---------------------------------------------------------------------------
// Chain + RPC config — reads from env proxy, falls back to chain registry
// ---------------------------------------------------------------------------
const ARC_TESTNET_CHAIN_ID = 5042002
const chainFact = requireChain(ARC_TESTNET_CHAIN_ID)

const proxyChains = (process.env.RPC_PROXY_CHAINS ?? '').split(',')
const arcTestnetProxyKey = 'Arc_Testnet'
const rpcUrl =
  process.env.RPC_PROXY_BASE_URL && proxyChains.includes(arcTestnetProxyKey)
    ? `${process.env.RPC_PROXY_BASE_URL}/api/rpc/${arcTestnetProxyKey}?_rpc_token=${process.env.RPC_PROXY_TOKEN}`
    : chainFact.rpcUrls[0]   // public RPC from the facts registry — no typed literal

const ARC_TESTNET_VIEM = {
  id: chainFact.chainId,
  name: chainFact.name,
  nativeCurrency: { name: chainFact.nativeCurrency.symbol, symbol: chainFact.nativeCurrency.symbol, decimals: chainFact.nativeCurrency.decimals },
  rpcUrls: { default: { http: [rpcUrl] } },
} as const

const publicClient = createPublicClient({ chain: ARC_TESTNET_VIEM, transport: http(rpcUrl) })

const CONTRACT_ADDRESS = (process.env.VITE_CONTRACT_ADDRESS ?? '') as Address

const ARCPAY_ABI = parseAbi([
  'function sweepToYield(address merchant) external',
  'function unsweepFromYield(address merchant, uint256 amount) external',
  'event PaymentReceived(bytes32 indexed invoiceId, address indexed merchant, uint256 grossAmount, uint256 platformFee, uint256 supplierShare, uint256 taxShare, uint256 netRevenue)',
  'function totalVolumeProcessed() view returns (uint256)',
])

// ---------------------------------------------------------------------------
// FX Rate Oracle (mock — replace with live feed e.g. Pyth/Chainlink in production)
// ---------------------------------------------------------------------------
const FX_CACHE: Record<string, { rate: number; expiresAt: number }> = {}

async function fetchFxRate(currency: string): Promise<number> {
  const now = Date.now()
  if (FX_CACHE[currency] && FX_CACHE[currency].expiresAt > now) {
    return FX_CACHE[currency].rate
  }
  // Stub — replace with real price feed call
  const MOCK_RATES: Record<string, number> = { NGN: 1650, ARS: 980, EUR: 0.92, GBP: 0.79, USD: 1 }
  const rate = MOCK_RATES[currency] ?? 1
  FX_CACHE[currency] = { rate, expiresAt: now + 60_000 } // 60-second lock
  return rate
}

function lockedUsdcQuote(localAmount: number, currency: string): { usdc: number; lockedUntil: number; currency: string } {
  const cached = FX_CACHE[currency]
  if (!cached || cached.expiresAt < Date.now()) {
    throw new Error(`No valid FX quote for ${currency} — call fetchFxRate first`)
  }
  return { usdc: localAmount / cached.rate, lockedUntil: cached.expiresAt, currency }
}

// ---------------------------------------------------------------------------
// EOD Yield Scheduler
// ---------------------------------------------------------------------------
function nextMs(h: number, m: number): number {
  const now = new Date()
  const target = new Date(now)
  target.setHours(h, m, 0, 0)
  if (target <= now) target.setDate(target.getDate() + 1)
  return target.getTime() - now.getTime()
}

async function scheduleSweep(merchant: Address) {
  const msUntilSweep = nextMs(23, 59)
  const msUntilUnsweep = nextMs(6, 0)
  console.log(`[ArcPayAgent] EOD sweep scheduled in ${Math.round(msUntilSweep / 60000)} min`)
  console.log(`[ArcPayAgent] Morning unsweep scheduled in ${Math.round(msUntilUnsweep / 60000)} min`)

  setTimeout(async () => {
    if (!process.env.AGENT_PRIVATE_KEY) { console.warn('[ArcPayAgent] No AGENT_PRIVATE_KEY — skipping sweep'); return }
    try {
      const account = privateKeyToAccount(process.env.AGENT_PRIVATE_KEY as `0x${string}`)
      const wc = createWalletClient({ chain: ARC_TESTNET_VIEM, transport: http(rpcUrl), account })
      const hash = await wc.writeContract({ address: CONTRACT_ADDRESS, abi: ARCPAY_ABI, functionName: 'sweepToYield', args: [merchant] })
      console.log(`[ArcPayAgent] sweepToYield tx: ${hash}`)
    } catch (e) { console.error('[ArcPayAgent] sweep error:', e) }
  }, msUntilSweep)

  setTimeout(async () => {
    if (!process.env.AGENT_PRIVATE_KEY) { console.warn('[ArcPayAgent] No AGENT_PRIVATE_KEY — skipping unsweep'); return }
    try {
      const account = privateKeyToAccount(process.env.AGENT_PRIVATE_KEY as `0x${string}`)
      const wc = createWalletClient({ chain: ARC_TESTNET_VIEM, transport: http(rpcUrl), account })
      const volume = await publicClient.readContract({ address: CONTRACT_ADDRESS, abi: ARCPAY_ABI, functionName: 'totalVolumeProcessed' }) as bigint
      const amount = volume / 2n
      const hash = await wc.writeContract({ address: CONTRACT_ADDRESS, abi: ARCPAY_ABI, functionName: 'unsweepFromYield', args: [merchant, amount] })
      console.log(`[ArcPayAgent] unsweepFromYield tx: ${hash}`)
    } catch (e) { console.error('[ArcPayAgent] unsweep error:', e) }
  }, msUntilUnsweep)
}

// ---------------------------------------------------------------------------
// Payment event watcher
// ---------------------------------------------------------------------------
async function watchPayments() {
  if (!CONTRACT_ADDRESS) {
    console.warn('[ArcPayAgent] VITE_CONTRACT_ADDRESS not set — skipping event watch')
    return
  }
  console.log(`[ArcPayAgent] Watching PaymentReceived on ${CONTRACT_ADDRESS}`)
  publicClient.watchContractEvent({
    address: CONTRACT_ADDRESS,
    abi: ARCPAY_ABI,
    eventName: 'PaymentReceived',
    onLogs: (logs) => {
      for (const log of logs) {
        const a = log.args as { invoiceId: string; merchant: string; grossAmount: bigint; platformFee: bigint; netRevenue: bigint }
        console.log(`[ArcPayAgent] Payment: invoice=${a.invoiceId} merchant=${a.merchant} gross=${a.grossAmount} fee=${a.platformFee} net=${a.netRevenue}`)
      }
    },
    onError: (err) => console.error('[ArcPayAgent] watch error:', err),
  })
}

// ---------------------------------------------------------------------------
// HTTP server — FX quotes + health
// ---------------------------------------------------------------------------
async function startServer() {
  const server = Bun.serve({
    port: 3001,
    async fetch(req) {
      const url = new URL(req.url)
      const cors = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' }
      if (req.method === 'OPTIONS') return new Response(null, { headers: cors })

      if (url.pathname === '/health') {
        return new Response(JSON.stringify({ status: 'ok', agent: 'ArcPayAgent', chainId: ARC_TESTNET_CHAIN_ID }), { headers: cors })
      }

      if (url.pathname === '/fx-quote') {
        const currency = url.searchParams.get('currency') ?? 'USD'
        const amount = parseFloat(url.searchParams.get('amount') ?? '1')
        try {
          await fetchFxRate(currency)
          const quote = lockedUsdcQuote(amount, currency)
          return new Response(JSON.stringify(quote), { headers: cors })
        } catch (e) {
          return new Response(JSON.stringify({ error: String(e) }), { status: 400, headers: cors })
        }
      }

      return new Response(JSON.stringify({ error: 'Not found' }), { status: 404, headers: cors })
    },
  })
  console.log(`[ArcPayAgent] HTTP server listening on :${server.port}`)
}

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------
;(async () => {
  console.log('[ArcPayAgent] Starting — chain:', chainFact.name, '| RPC:', proxyChains.includes(arcTestnetProxyKey) ? 'proxy' : 'public fallback')
  for (const c of ['USD', 'EUR', 'NGN', 'ARS', 'GBP']) await fetchFxRate(c)
  console.log('[ArcPayAgent] FX cache warmed')
  await watchPayments()
  await startServer()
  if (process.env.MERCHANT_ADDRESS) {
    await scheduleSweep(process.env.MERCHANT_ADDRESS as Address)
  }
})()
