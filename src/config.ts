/**
 * wagmi configuration
 * Built with Arc Studio — https://studio.arc.io
 */

import { http, fallback, createConfig } from 'wagmi'
import { mainnet } from 'wagmi/chains'
import { arcTestnet } from 'viem/chains'
import { createPublicClient, http as viemHttp } from 'viem'
import { injected } from 'wagmi/connectors'
import { registerChain as registerTraceChain } from './tracing'

// Arc Testnet RPC fallback chain — tried in order, each with a 10 s timeout.
const ARC_TESTNET_RPCS = [
  'https://rpc.solidrpc.io/public/evm/5042002',
  'https://arc-testnet.drpc.org',
  'https://5042002.rpc.thirdweb.com',
  'https://rpc.testnet.arc.network',
] as const

const arcTestnetTransport = fallback(
  ARC_TESTNET_RPCS.map(url => http(url, { timeout: 10_000 })),
  { retryCount: 3, retryDelay: 1_000 },
)

// Pre-register primary RPC so trace events show the correct chain name immediately
registerTraceChain(arcTestnet.id, ARC_TESTNET_RPCS[0])

export const config = createConfig({
  chains: [arcTestnet, mainnet], // mainnet needed for ENS resolution
  connectors: [injected()],
  transports: {
    [arcTestnet.id]: arcTestnetTransport,
    [mainnet.id]: http(), // ENS resolution uses mainnet
  },
})

// Standalone viem public client — use this for one-off reads outside of wagmi hooks.
export const arcPublicClient = createPublicClient({
  transport: viemHttp('https://rpc.testnet.arc.io', { timeout: 10_000 }),
})
