import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { ExternalLink, Loader2, RotateCcw } from 'lucide-react'
import { erc20Abi, isAddress, parseAbiItem, parseEventLogs } from 'viem'
import { useAccount, usePublicClient, useSwitchChain, useWriteContract } from 'wagmi'
import { toast } from 'sonner'
import { buildTxExplorerUrl, getUsdc } from '@/onchain-facts'
import { parseUsdc } from '@/onchain-money'
import { TxRecords, getRefunds, refundSummary, type RefundEntry, type TxRecord } from '../utils/txRecords'

const ARC_CHAIN_ID = 5042
const EXPLORER_BASE = 'https://explorer.arc.io'
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
const TRANSFER = parseAbiItem('event Transfer(address indexed from, address indexed to, uint256 value)')

const short = (a: string) => `${a.slice(0, 6)}...${a.slice(-4)}`
/** 12 -> "12.00", 12.345 -> "12.345" */
const money = (n: number) => {
  const [i, d = ''] = n.toFixed(6).replace(/0+$/, '').split('.')
  return `${i}.${d.padEnd(2, '0')}`
}
const nowMs = () => Date.now()
const newId = () => `${nowMs().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

interface Props {
  record: TxRecord
  onClose: () => void
  onChanged: () => void
}

export function RefundDialog({ record, onClose, onChanged }: Props) {
  const { address: merchant, chainId } = useAccount()
  const publicClient = usePublicClient({ chainId: ARC_CHAIN_ID })
  const { switchChainAsync } = useSwitchChain()
  const { writeContractAsync } = useWriteContract()
  const usdc = getUsdc(ARC_CHAIN_ID)
  const ts = record.timestamp

  const [rec, setRec] = useState<TxRecord>(record)
  const summary = useMemo(() => refundSummary(rec), [rec])
  const entries = getRefunds(rec)
  const pendingEntry = entries.find(e => e.status === 'pending')
  const lastConfirmed = [...entries].reverse().find(e => e.status === 'confirmed')

  const [customer, setCustomer] = useState<string>(record.customer ?? '')
  const [looking, setLooking] = useState(!record.customer && !!record.txHash)
  const [amountStr, setAmountStr] = useState(() => money(refundSummary(record).remaining))
  const [note, setNote] = useState('')
  const [email, setEmail] = useState(record.email ?? '')
  const [running, setRunning] = useState(false)
  const [checking, setChecking] = useState(false)
  const [unsure, setUnsure] = useState(false)

  const customerValid = isAddress(customer)
  const emailValid = EMAIL_RE.test(email.trim())

  const reload = () => {
    const fresh = TxRecords.get(ts)
    if (fresh) setRec(fresh)
    onChanged()
  }

  const patchEntry = (id: string, patch: Partial<RefundEntry>) => {
    const current = (TxRecords.get(ts)?.refunds ?? []).find(e => e.id === id)
    if (current) TxRecords.upsertRefund(ts, { ...current, ...patch })
    reload()
  }

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

  // Email the customer a refund receipt. Never blocks or undoes the refund.
  const sendEmail = async (entry: RefundEntry, to: string) => {
    const cur = TxRecords.get(ts) ?? rec
    const left = Math.max(0, cur.amount - refundSummary(cur).refunded)
    try {
      const res = await fetch('/api/receipt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'refund',
          email: to,
          refundAmount: entry.amount,
          originalAmount: cur.amount,
          remaining: Math.min(left, cur.amount),
          items: entry.note ?? '',
          txHash: entry.txHash ?? '',
          timestamp: nowMs(),
          explorerBase: EXPLORER_BASE,
        }),
      })
      const data = await res.json() as { ok?: boolean; error?: string }
      if (data.ok) {
        patchEntry(entry.id, { emailedAt: nowMs() })
        toast.success(`Refund receipt sent to ${to}`)
      } else {
        toast.error(`Refund sent, but the receipt email failed: ${data.error ?? 'unknown error'}`)
      }
    } catch {
      toast.error('Refund sent, but the receipt email could not be sent')
    }
  }

  const run = async () => {
    if (!merchant || !publicClient || !usdc) { toast.error('Connect your wallet first'); return }
    if (summary.hasPending) { toast.error('A refund is still waiting for confirmation'); return }
    if (!customerValid) { toast.error('Enter a valid customer wallet address'); return }
    let raw: bigint
    try { raw = parseUsdc(amountStr.trim()) } catch { toast.error('Enter a valid amount, up to 6 decimals'); return }
    if (raw <= 0n) { toast.error('Enter an amount above 0'); return }
    if (Number(raw) > summary.remainingMicro) { toast.error(`You can refund at most $${money(summary.remaining)}`); return }
    const to = email.trim()
    if (to && !EMAIL_RE.test(to)) { toast.error('Enter a valid customer email or leave it empty'); return }

    setRunning(true)
    // Save the refund as pending BEFORE the wallet is asked, so a retry cannot double refund
    const entry: RefundEntry = { id: newId(), amount: Number(raw) / 1e6, status: 'pending', createdAt: nowMs(), note: note.trim() || undefined }
    TxRecords.update(ts, { customer, email: to || undefined })
    TxRecords.upsertRefund(ts, entry)
    reload()

    let hash: `0x${string}`
    try {
      if (chainId !== ARC_CHAIN_ID) await switchChainAsync({ chainId: ARC_CHAIN_ID })
      hash = await writeContractAsync({
        address: usdc.address as `0x${string}`,
        abi: erc20Abi,
        functionName: 'transfer',
        args: [customer, raw],
        chainId: ARC_CHAIN_ID,
      })
    } catch (e) {
      // The wallet never produced a transaction, so nothing was sent
      patchEntry(entry.id, { status: 'failed' })
      const msg = (e as { shortMessage?: string }).shortMessage ?? (e as Error).message ?? 'Refund failed'
      toast.error(msg.length > 120 ? 'Refund was not sent' : msg)
      setRunning(false)
      return
    }

    patchEntry(entry.id, { txHash: hash })
    try {
      const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 120_000 })
      if (receipt.status !== 'success') {
        patchEntry(entry.id, { status: 'failed' })
        toast.error('The refund failed onchain. Nothing was sent.')
        setRunning(false)
        return
      }
    } catch {
      toast('Still confirming. Tap "Check status" before trying again.')
      setRunning(false)
      return
    }

    patchEntry(entry.id, { status: 'confirmed' })
    toast.success('Refund sent')
    if (to) await sendEmail({ ...entry, status: 'confirmed', txHash: hash }, to)
    setRunning(false)
    onClose()
  }

  // Look for the transfer when the app did not get to save its hash
  const findTransfer = async (entry: RefundEntry): Promise<string | undefined> => {
    if (!merchant || !usdc || !publicClient || !customerValid) return undefined
    try {
      const latest = await publicClient.getBlockNumber()
      const logs = await publicClient.getLogs({
        address: usdc.address as `0x${string}`,
        event: TRANSFER,
        args: { from: merchant, to: customer },
        fromBlock: latest > 20_000n ? latest - 20_000n : 0n,
        toBlock: latest,
      })
      const want = parseUsdc(entry.amount.toFixed(6))
      const used = new Set(entries.map(e => e.txHash?.toLowerCase()))
      return [...logs].reverse().find(l => l.args.value === want && !used.has(l.transactionHash.toLowerCase()))?.transactionHash
    } catch {
      return undefined
    }
  }

  const checkStatus = async () => {
    if (!pendingEntry || !publicClient) return
    setChecking(true)
    try {
      if (pendingEntry.txHash) {
        try {
          const r = await publicClient.getTransactionReceipt({ hash: pendingEntry.txHash as `0x${string}` })
          if (r.status === 'success') { patchEntry(pendingEntry.id, { status: 'confirmed' }); toast.success('Refund confirmed') }
          else { patchEntry(pendingEntry.id, { status: 'failed' }); toast('That refund failed onchain. Nothing was sent, you can try again.') }
        } catch {
          toast('Not confirmed yet. Try again in a moment.')
        }
        return
      }
      const found = await findTransfer(pendingEntry)
      if (found) { patchEntry(pendingEntry.id, { status: 'confirmed', txHash: found }); toast.success('Found the refund and marked it as sent') }
      else setUnsure(true)
    } finally {
      setChecking(false)
    }
  }

  const resendReceipt = async () => {
    if (!lastConfirmed || !emailValid) return
    setRunning(true)
    TxRecords.update(ts, { email: email.trim() })
    await sendEmail(lastConfirmed, email.trim())
    setRunning(false)
  }

  const inputCls = 'w-full text-xs rounded-lg px-2.5 py-2 outline-none'
  const inputStyle = { background: 'var(--surface-muted)', border: '1px solid var(--border)', color: 'var(--ink)' }
  const canRefund = summary.remaining > 0 && !summary.hasPending

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
        className="relative w-full max-w-[320px] max-h-[85vh] overflow-y-auto rounded-2xl p-4"
        style={{ pointerEvents: 'auto', background: 'var(--surface-strong)', border: '1px solid var(--border)', boxShadow: '0 12px 40px rgba(18,45,69,0.28)' }}
      >
        <div className="flex items-center gap-2 mb-2">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'rgba(192,57,43,0.1)' }}>
            <RotateCcw size={14} style={{ color: '#c0392b' }} />
          </div>
          <div className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>
            {canRefund ? 'Are you sure you want to refund?' : 'Refund details'}
          </div>
        </div>

        <div className="text-xs flex flex-col gap-1 mb-3 tabular-nums" style={{ color: 'var(--muted)' }}>
          <div className="flex justify-between"><span>Customer paid</span><span style={{ color: 'var(--ink)' }}>${money(summary.paid)}</span></div>
          <div className="flex justify-between"><span>Already refunded</span><span style={{ color: 'var(--ink)' }}>${money(summary.refunded)}</span></div>
          {summary.pending > 0 && (
            <div className="flex justify-between"><span>Waiting for confirmation</span><span style={{ color: '#b45309' }}>${money(summary.pending)}</span></div>
          )}
          <div className="flex justify-between font-semibold" style={{ color: 'var(--ink)' }}><span>Can still refund</span><span>${money(summary.remaining)}</span></div>
        </div>

        {pendingEntry && (
          <div className="mb-3 rounded-lg p-2.5 text-xs" style={{ background: 'rgba(180,83,9,0.08)', color: '#b45309' }}>
            A refund of ${money(pendingEntry.amount)} has not been confirmed yet. Check it before refunding again, so the customer is not refunded twice.
            <div className="flex gap-2 mt-2">
              <button
                onClick={() => void checkStatus()}
                disabled={checking}
                className="flex-1 py-2 rounded-lg font-semibold flex items-center justify-center gap-1.5 disabled:opacity-50"
                style={{ background: '#b45309', color: '#fff' }}
              >
                {checking ? <Loader2 size={12} className="animate-spin" /> : null} Check status
              </button>
            </div>
            {unsure && (
              <div className="mt-2" style={{ color: 'var(--muted)' }}>
                Could not find it automatically. Check your wallet history, then choose:
                <div className="flex gap-2 mt-1.5">
                  <button onClick={() => { patchEntry(pendingEntry.id, { status: 'confirmed' }); setUnsure(false) }} className="flex-1 py-1.5 rounded-lg font-semibold" style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)', color: 'var(--ink)' }}>It was sent</button>
                  <button onClick={() => { patchEntry(pendingEntry.id, { status: 'failed' }); setUnsure(false) }} className="flex-1 py-1.5 rounded-lg font-semibold" style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)', color: 'var(--ink)' }}>It was not sent</button>
                </div>
              </div>
            )}
          </div>
        )}

        {canRefund && (
          <div className="flex flex-col gap-2.5 mb-3">
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs" style={{ color: 'var(--muted)' }}>Refund amount (USDC)</span>
                <button onClick={() => setAmountStr(money(summary.remaining))} className="text-[11px] font-semibold" style={{ color: 'var(--accent)' }}>Full refund</button>
              </div>
              <input value={amountStr} onChange={e => setAmountStr(e.target.value)} inputMode="decimal" className={`${inputCls} tabular-nums`} style={inputStyle} />
            </div>
            <div>
              <div className="text-xs mb-1" style={{ color: 'var(--muted)' }}>Items / reason (shown on the receipt)</div>
              <input value={note} onChange={e => setNote(e.target.value.slice(0, 140))} placeholder="e.g. Blue shirt returned" className={inputCls} style={inputStyle} />
            </div>
            <div>
              <div className="text-xs mb-1" style={{ color: 'var(--muted)' }}>Customer email for the refund receipt (optional)</div>
              <input value={email} onChange={e => setEmail(e.target.value)} placeholder="customer@email.com" inputMode="email" className={inputCls} style={inputStyle} />
            </div>
            <div>
              <div className="text-xs mb-1" style={{ color: 'var(--muted)' }}>Refund to</div>
              {looking ? (
                <div className="text-xs flex items-center gap-1.5" style={{ color: 'var(--subtle)' }}>
                  <Loader2 size={12} className="animate-spin" /> Finding the customer wallet...
                </div>
              ) : customerValid ? (
                <div className="text-xs font-mono" style={{ color: 'var(--ink)' }}>{short(customer)}</div>
              ) : (
                <input value={customer} onChange={e => setCustomer(e.target.value.trim())} placeholder="Customer wallet address (0x...)" className={`${inputCls} font-mono`} style={inputStyle} />
              )}
            </div>
          </div>
        )}

        {entries.filter(e => e.status !== 'failed').length > 0 && (
          <div className="mb-3 text-[11px] flex flex-col gap-1" style={{ color: 'var(--muted)' }}>
            <div className="font-semibold" style={{ color: 'var(--ink)' }}>Refunds so far</div>
            {entries.filter(e => e.status !== 'failed').map(e => (
              <div key={e.id} className="flex items-center justify-between gap-2 tabular-nums">
                <span className="truncate">${money(e.amount)}{e.note ? ` · ${e.note}` : ''}{e.status === 'pending' ? ' · pending' : ''}{e.emailedAt ? ' · emailed' : ''}</span>
                {e.txHash && (
                  <a href={buildTxExplorerUrl(ARC_CHAIN_ID, e.txHash)} target="_blank" rel="noopener noreferrer" className="flex-shrink-0">
                    <ExternalLink size={11} style={{ color: 'var(--accent)' }} />
                  </a>
                )}
              </div>
            ))}
          </div>
        )}

        {!pendingEntry && lastConfirmed && !lastConfirmed.emailedAt && (
          <div className="mb-3">
            {!canRefund && (
              <input value={email} onChange={e => setEmail(e.target.value)} placeholder="customer@email.com" inputMode="email" className={`${inputCls} mb-2`} style={inputStyle} />
            )}
            <button
              onClick={() => void resendReceipt()}
              disabled={running || !emailValid}
              className="w-full py-2 rounded-lg text-xs font-semibold disabled:opacity-50"
              style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)', color: 'var(--ink)' }}
            >
              Email refund receipt for the last refund
            </button>
          </div>
        )}

        {canRefund && (
          <div className="text-[11px] mb-3" style={{ color: 'var(--subtle)' }}>
            {running ? 'Confirm the transfer in your wallet...' : 'Your wallet will ask you to confirm 1 transfer. No fee is charged on refunds.'}
          </div>
        )}

        <div className="flex gap-2">
          <button
            onClick={onClose}
            disabled={running}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-50"
            style={{ background: 'var(--surface-muted)', color: 'var(--ink)', border: '1px solid var(--border)' }}
          >
            {canRefund ? 'Cancel' : 'Close'}
          </button>
          {canRefund && (
            <button
              onClick={() => void run()}
              disabled={running || looking || !customerValid}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-1.5 disabled:opacity-50"
              style={{ background: '#c0392b', color: '#fff' }}
            >
              {running ? <Loader2 size={14} className="animate-spin" /> : null}
              {running ? 'Refunding' : 'Yes, refund'}
            </button>
          )}
        </div>
      </motion.div>
    </div>
  )
}
