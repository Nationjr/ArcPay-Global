import { useState, useCallback } from 'react'
import { useAccount, useSignTypedData, useWriteContract, usePublicClient } from 'wagmi'
import { erc20Abi, type Hex } from 'viem'
import { toast } from 'sonner'
import { getUsdc } from '@/onchain-facts'
import { OfflineQueue, type OfflinePayload } from '../utils/offlineQueue'
import { TxRecords } from '../utils/txRecords'
import arcPayArtifact from '../../contracts/out/ArcPayCore.sol/ArcPayCore.json'

const ARC_TESTNET_CHAIN_ID = 5042002
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const CONTRACT_ABI = arcPayArtifact.abi as any[]

// EIP-712 domain + types matching ArcPayCore.sol
const EIP712_DOMAIN = {
  name: 'ArcPayCore',
  version: '1',
  chainId: ARC_TESTNET_CHAIN_ID,
} as const

const EIP712_TYPES = {
  PaymentPayload: [
    { name: 'invoiceId',       type: 'bytes32'  },
    { name: 'merchant',        type: 'address'  },
    { name: 'grossAmount',     type: 'uint256'  },
    { name: 'supplier',        type: 'address'  },
    { name: 'supplierShareBps', type: 'uint256' },
    { name: 'taxShareBps',     type: 'uint256'  },
    { name: 'nonce',           type: 'uint256'  },
    { name: 'deadline',        type: 'uint256'  },
  ],
} as const

export type SettleStatus = 'idle' | 'approving' | 'signing' | 'submitting' | 'done' | 'error'

export function useSettleOffline(contractAddress: `0x${string}`) {
  const { address } = useAccount()
  const publicClient = usePublicClient({ chainId: ARC_TESTNET_CHAIN_ID })
  const { signTypedDataAsync } = useSignTypedData()
  const { writeContractAsync } = useWriteContract()

  const [status, setStatus] = useState<SettleStatus>('idle')

  const settle = useCallback(async () => {
    if (!address || !publicClient) { toast.error('Wallet not connected'); return }
    const queue = OfflineQueue.getAll()
    if (queue.length === 0) { toast.error('No queued payments'); return }

    const usdc = getUsdc(ARC_TESTNET_CHAIN_ID)
    if (!usdc) { toast.error('USDC not available'); return }

    try {
      // ── 1. Read current nonce from contract ──────────────────────────────
      const currentNonce = await publicClient.readContract({
        address: contractAddress,
        abi: CONTRACT_ABI,
        functionName: 'getNonce',
        args: [address],
      }) as bigint

      // ── 2. Build payloads + sign each one ────────────────────────────────
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600) // 1h window
      const payloads: {
        invoiceId: Hex; merchant: `0x${string}`; grossAmount: bigint
        supplier: `0x${string}`; supplierShareBps: bigint; taxShareBps: bigint
        nonce: bigint; deadline: bigint
      }[] = []
      const signatures: Hex[] = []

      setStatus('signing')
      for (let i = 0; i < queue.length; i++) {
        const item: OfflinePayload = queue[i]
        const nonce = currentNonce + BigInt(i)
        const payload = {
          invoiceId:       item.invoiceId as Hex,
          merchant:        item.merchant as `0x${string}`,
          grossAmount:     BigInt(item.grossAmount),
          supplier:        item.supplier as `0x${string}`,
          supplierShareBps: BigInt(item.supplierShareBps),
          taxShareBps:     BigInt(item.taxShareBps),
          nonce,
          deadline,
        }
        payloads.push(payload)

        toast.info(`Sign payment ${i + 1} of ${queue.length} in your wallet…`)
        const sig = await signTypedDataAsync({
          domain: { ...EIP712_DOMAIN, verifyingContract: contractAddress },
          types: EIP712_TYPES,
          primaryType: 'PaymentPayload',
          message: payload,
        })
        signatures.push(sig)
      }

      // ── 3. Approve USDC allowance for the total gross ────────────────────
      const totalGross = payloads.reduce((sum, p) => sum + p.grossAmount, 0n)
      setStatus('approving')
      toast.info('Approving USDC…')
      await writeContractAsync({
        address: usdc.address as `0x${string}`,
        abi: erc20Abi,
        functionName: 'approve',
        args: [contractAddress, totalGross],
        chainId: ARC_TESTNET_CHAIN_ID,
      })

      // ── 4. Submit batch ──────────────────────────────────────────────────
      setStatus('submitting')
      toast.info('Submitting batch to contract…')
      const txHash = await writeContractAsync({
        address: contractAddress,
        abi: CONTRACT_ABI,
        functionName: 'executeBatchOfflinePayments',
        args: [payloads, signatures],
        chainId: ARC_TESTNET_CHAIN_ID,
      })

      // ── 5. Save to Analytics + clear queue ───────────────────────────────
      for (const item of queue) {
        const gross = Number(item.grossAmount) / 1e6
        const fee   = gross * 50 / 10000
        const supp  = gross * item.supplierShareBps / 10000
        const tax   = gross * item.taxShareBps / 10000
        TxRecords.save({
          invoiceId: item.invoiceId,
          txHash,
          amount:    gross,
          fee,
          net:       gross - fee - supp - tax,
          tax,
          timestamp: item.timestamp,
        })
      }
      OfflineQueue.clear()
      setStatus('done')
      toast.success(`${queue.length} offline payment${queue.length > 1 ? 's' : ''} settled onchain!`)
      // Reset back to idle after a moment
      setTimeout(() => setStatus('idle'), 3000)
    } catch (err) {
      setStatus('error')
      const msg = err instanceof Error ? err.message : 'Unknown error'
      toast.error(`Batch settle failed: ${msg.slice(0, 120)}`)
      setTimeout(() => setStatus('idle'), 4000)
    }
  }, [address, publicClient, contractAddress, signTypedDataAsync, writeContractAsync])

  return { settle, status }
}
