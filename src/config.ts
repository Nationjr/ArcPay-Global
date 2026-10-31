/**
 * wagmi configuration
 * Built with Arc Studio — https://studio.arc.io
 */

import { http, fallback, createConfig } from 'wagmi'
import { mainnet } from 'wagmi/chains'
import { defineChain } from 'viem'
import { createPublicClient, http as viemHttp } from 'viem'
import { injected } from 'wagmi/connectors'
import { registerChain as registerTraceChain } from './tracing'

// Arc Mainnet chain definition
export const arcMainnet = defineChain({
  id: 5042,
  name: 'Arc',
  nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://rpc.mainnet.arc.io'] },
  },
  blockExplorers: {
    default: { name: 'Arc Explorer', url: 'https://explorer.arc.io' },
  },
})

// Arc Mainnet RPC fallback transport
const ARC_MAINNET_RPCS = [
  'https://rpc.mainnet.arc.io',
] as const

const arcMainnetTransport = fallback(
  ARC_MAINNET_RPCS.map(url => http(url, { timeout: 10_000 })),
  { retryCount: 3, retryDelay: 1_000 },
)

// Pre-register primary RPC so trace events show the correct chain name immediately
registerTraceChain(arcMainnet.id, ARC_MAINNET_RPCS[0])

export const config = createConfig({
  chains: [arcMainnet, mainnet], // mainnet needed for ENS resolution
  connectors: [injected()],
  transports: {
    [arcMainnet.id]: arcMainnetTransport,
    [mainnet.id]: http(), // ENS resolution uses mainnet
  },
})

// Standalone viem public client — use this for one-off reads outside of wagmi hooks.
export const arcPublicClient = createPublicClient({
  chain: arcMainnet,
  transport: viemHttp('https://rpc.mainnet.arc.io', { timeout: 10_000 }),
})
