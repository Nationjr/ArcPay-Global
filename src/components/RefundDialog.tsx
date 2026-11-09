import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Loader2, RotateCcw } from 'lucide-react'
import { erc20Abi, isAddress, parseEventLogs } from 'viem'
import { useAccount, usePublicClient, useSwitchChain, useWriteContract } from 'wagmi'
import { toast } from 'sonner'
import { getUsdc } from '@/onchain-facts'
import { TxRecords, type RefundState, type TxRecord } from '../utils/txRecords'
import { PLATFORM_FEE_RECIPIENT, fmtRaw, planRefund } from '../utils/refund'

const ARC_CHAIN_ID = 5042

interface Props {
  record: TxRecord
  /** The merchant's fee address (gets 40% of the withheld fee). Empty means the merchant wallet. */
  merchantFeeRecipient: string
  onClose: () => void
  onChanged: () => void
}

const short = (a: string) => `${a.slice(0, 6)}...${a.slice(-4)}`

export function RefundDialog({ record, merchantFeeRecipient, onClose, onChanged }: Props) {
  const { address: merchant, chainId } = useAccount()
  const publicClient = usePublicClient({ chainId: ARC_CHAIN_ID })
  const { switchChainAsync } = useSwitchChain()
  const { writeContractAsync } = useWriteContract()
  const usdc = getUsdc(ARC_CHAIN_ID)

  const plan = useMemo(() => planRefund(record.amount), [record.amount])
  const [customer, setCustomer] = useState<string>(record.customer ?? '')
  const [looking, setLooking] = useState(!record.customer && !!record.txHash)
  const [running, setRunning] = useState(false)
  const [stepLabel, setStepLabel] = useState('')
  const [refund, setRefund] = useState<RefundState>(record.refund ?? {})

  // Where the 40% goes. If it is the merchant's own wallet there is nothing to send.
  const feeRecipient = isAddress(merchantFeeRecipient) ? merchantFeeRecipient : (merchant ?? '')
  const feeRecipientIsSelf = !!merchant && feeRecipient.toLowerCase() === merchant.toLowerCase()

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

  const steps = [
    { key: 'customerTx' as const, label: 'Sending refund to customer', to: customer, amount: plan.customerRaw, needed: !refund.customerTx },
    { key: 'platformTx' as const, label: 'Sending platform fee share', to: PLATFORM_FEE_RECIPIENT as string, amount: plan.platformRaw, needed: !refund.platformTx && plan.platformRaw > 0n },
    { key: 'feeRecipientTx' as const, label: 'Sending your fee share', to: feeRecipient, amount: plan.feeRecipientRaw, needed: !refund.feeRecipientTx && plan.feeRecipientRaw > 0n && !feeRecipientIsSelf },
  ]
  const pending = steps.filter(s => s.needed)
  const resuming = !!refund.customerTx && pending.length > 0
  const customerValid = isAddress(customer)

  const run = async () => {
    if (!merchant || !publicClient || !usdc) { toast.error('Connect your wallet first'); return }
    if (!customerValid && !refund.customerTx) { toast.error('Enter a valid customer wallet address'); return }
    setRunning(true)
    try {
      if (chainId !== ARC_CHAIN_ID) await switchChainAsync({ chainId: ARC_CHAIN_ID })
      let state = refund
      for (const [i, s] of pending.entries()) {
        setStepLabel(`Step ${i + 1} of ${pending.length}: ${s.label}`)
        const hash = await writeContractAsync({
          address: usdc.address as `0x${string}`,
          abi: erc20Abi,
          functionName: 'transfer',
          args: [s.to as `0x${string}`, s.amount],
          chainId: ARC_CHAIN_ID,
        })
        const receipt = await publicClient.waitForTransactionReceipt({ hash })
        if (receipt.status !== 'success') throw new Error('Transfer failed onchain')
        // Save after every transfer so an interrupted refund can resume without paying twice
        state = { ...state, [s.key]: hash }
        setRefund(state)
        TxRecords.update(record.timestamp, { customer, refund: state })
        onChanged()
      }
      state = { ...state, completedAt: Date.now() }
      TxRecords.update(record.timestamp, { customer, refund: state })
      onChanged()
      toast.success('Refund sent')
      onClose()
    } catch (e) {
      const msg = (e as { shortMessage?: string; message?: string }).shortMessage ?? (e as Error).message ?? 'Refund failed'
      toast.error(msg.length > 120 ? 'Refund was not completed' : msg)
      setStepLabel('')
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
          <div className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>
            {resuming ? 'Finish this refund?' : 'Are you sure you want to refund?'}
          </div>
        </div>

        <div className="text-xs flex flex-col gap-1 mb-3 tabular-nums" style={{ color: 'var(--muted)' }}>
          <div className="flex justify-between"><span>Customer paid</span><span style={{ color: 'var(--ink)' }}>${fmtRaw(plan.paidRaw)}</span></div>
          <div className="flex justify-between"><span>0.5% fee withheld</span><span style={{ color: 'var(--ink)' }}>-${fmtRaw(plan.feeRaw)}</span></div>
          <div className="flex justify-between font-semibold" style={{ color: 'var(--ink)' }}><span>Customer receives</span><span>${fmtRaw(plan.customerRaw)}</span></div>
          <div className="flex justify-between pt-1"><span>Fee: platform (60%)</span><span>${fmtRaw(plan.platformRaw)}</span></div>
          <div className="flex justify-between"><span>Fee: your address (40%)</span><span>${fmtRaw(plan.feeRecipientRaw)}</span></div>
        </div>

        {!refund.customerTx && (
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
        )}

        <div className="text-[11px] mb-3" style={{ color: 'var(--subtle)' }}>
          {running
            ? stepLabel
            : `Your wallet will ask you to confirm ${pending.length} transfer${pending.length === 1 ? '' : 's'}.`}
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
            disabled={running || looking || (!customerValid && !refund.customerTx)}
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
