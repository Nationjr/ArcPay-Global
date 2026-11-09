import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Loader2, RotateCcw } from 'lucide-react'
import { erc20Abi, isAddress, parseEventLogs } from 'viem'
import { useAccount, usePublicClient, useSwitchChain, useWriteContract } from 'wagmi'
import { toast } from 'sonner'
import { getUsdc } from '@/onchain-facts'
import { TxRecords, type TxRecord } from '../utils/txRecords'
import { fmtRaw, planRefund } from '../utils/refund'

const ARC_CHAIN_ID = 5042

interface Props {
  record: TxRecord
  onClose: () => void
  onChanged: () => void
}

const short = (a: string) => `${a.slice(0, 6)}...${a.slice(-4)}`

export function RefundDialog({ record, onClose, onChanged }: Props) {
  const { address: merchant, chainId } = useAccount()
  const publicClient = usePublicClient({ chainId: ARC_CHAIN_ID })
  const { switchChainAsync } = useSwitchChain()
  const { writeContractAsync } = useWriteContract()
  const usdc = getUsdc(ARC_CHAIN_ID)

  const plan = useMemo(() => planRefund(record.amount), [record.amount])
  const [customer, setCustomer] = useState<string>(record.customer ?? '')
  const [looking, setLooking] = useState(!record.customer && !!record.txHash)
  const [running, setRunning] = useState(false)

  // Work out who paid from the original transaction when it was not stored.
  useEffect(() => {
    if (customer || !record.txHash || !publicClient || !merchant || !usdc) return
    let cancelled = false
    void (async () => {
      try {
        const receipt = await publicClient.getTransactionReceipt({ hash: record.txHash as `0x${string}` })
        const logs = parseEventLogs({ abi: erc20Abi, eventName: 'Transfer', logs: receipt.logs })
        const hit = logs.find(
          l => l.address.toLowerCase() === usdc.address.toLowerCase() && l.args.to.toLowerCase() === merchant.toLowerCase(),
        )
        if (!cancelled && hit) setCustomer(hit.args.from)
      } catch {
        /* fall back to manual entry */
      } finally {
        if (!cancelled) setLooking(false)
      }
    })()
    return () => { cancelled = true }
  }, [customer, record.txHash, publicClient, merchant, usdc])

  const customerValid = isAddress(customer)

  const run = async () => {
    if (!merchant || !publicClient || !usdc) { toast.error('Connect your wallet first'); return }
    if (!customerValid) { toast.error('Enter a valid customer wallet address'); return }
    setRunning(true)
    try {
      if (chainId !== ARC_CHAIN_ID) await switchChainAsync({ chainId: ARC_CHAIN_ID })
      const hash = await writeContractAsync({
        address: usdc.address as `0x${string}`,
        abi: erc20Abi,
        functionName: 'transfer',
        args: [customer, plan.paidRaw],
        chainId: ARC_CHAIN_ID,
      })
      const receipt = await publicClient.waitForTransactionReceipt({ hash })
      if (receipt.status !== 'success') throw new Error('Transfer failed onchain')
      TxRecords.update(record.timestamp, { customer, refund: { customerTx: hash, completedAt: Date.now() } })
      onChanged()
      toast.success('Refund sent')
      onClose()
    } catch (e) {
      const msg = (e as { shortMessage?: string; message?: string }).shortMessage ?? (e as Error).message ?? 'Refund failed'
      toast.error(msg.length > 120 ? 'Refund was not completed' : msg)
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ pointerEvents: 'none' }}>
      {/* Invisible catcher: tapping outside closes the window, but nothing is dimmed */}
      <button
        aria-label="Close"
        className="fixed inset-0"
        style={{ pointerEvents: running ? 'none' : 'auto', background: 'transparent' }}
        onClick={onClose}
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="relative w-full max-w-[300px] rounded-2xl p-4"
        style={{ pointerEvents: 'auto', background: 'var(--surface-strong)', border: '1px solid var(--border)', boxShadow: '0 12px 40px rgba(18,45,69,0.28)' }}
      >
        <div className="flex items-center gap-2 mb-2">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'rgba(192,57,43,0.1)' }}>
            <RotateCcw size={14} style={{ color: '#c0392b' }} />
          </div>
          <div className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>Are you sure you want to refund?</div>
        </div>

        <div className="text-xs flex flex-col gap-1 mb-3 tabular-nums" style={{ color: 'var(--muted)' }}>
          <div className="flex justify-between font-semibold" style={{ color: 'var(--ink)' }}>
            <span>Customer receives</span><span>${fmtRaw(plan.paidRaw)} USDC</span>
          </div>
          <div className="flex justify-between"><span>Refund fee</span><span>None</span></div>
        </div>

        <div className="mb-3">
          <div className="text-xs mb-1" style={{ color: 'var(--muted)' }}>Refund to</div>
          {looking ? (
            <div className="text-xs flex items-center gap-1.5" style={{ color: 'var(--subtle)' }}>
              <Loader2 size={12} className="animate-spin" /> Finding the customer wallet...
            </div>
          ) : customerValid ? (
            <div className="text-xs font-mono" style={{ color: 'var(--ink)' }}>{short(customer)}</div>
          ) : (
            <input
              value={customer}
              onChange={e => setCustomer(e.target.value.trim())}
              placeholder="Customer wallet address (0x...)"
              className="w-full text-xs rounded-lg px-2.5 py-2 font-mono outline-none"
              style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)', color: 'var(--ink)' }}
            />
          )}
        </div>

        <div className="text-[11px] mb-3" style={{ color: 'var(--subtle)' }}>
          {running ? 'Confirm the transfer in your wallet...' : 'Your wallet will ask you to confirm 1 transfer.'}
        </div>

        <div className="flex gap-2">
          <button
            onClick={onClose}
            disabled={running}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-50"
            style={{ background: 'var(--surface-muted)', color: 'var(--ink)', border: '1px solid var(--border)' }}
          >
            Cancel
          </button>
          <button
            onClick={() => void run()}
            disabled={running || looking || !customerValid}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-1.5 disabled:opacity-50"
            style={{ background: '#c0392b', color: '#fff' }}
          >
            {running ? <Loader2 size={14} className="animate-spin" /> : null}
            {running ? 'Refunding' : 'Yes, refund'}
          </button>
        </div>
      </motion.div>
    </div>
  )
}
