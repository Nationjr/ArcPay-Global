const STORAGE_KEY = 'arcpay_records'

/** Legacy full-refund marker from the first version of refunds. Still read, never written. */
export interface RefundState {
  customerTx?: string
  completedAt?: number
}

export type RefundStatus = 'pending' | 'confirmed' | 'failed'

/** One refund transfer. Saved as 'pending' BEFORE the wallet is asked to send, so a retry
 *  after a timeout can never refund the same money twice. */
export interface RefundEntry {
  id: string
  amount: number          // USDC refunded in this transfer
  status: RefundStatus
  createdAt: number
  txHash?: string
  note?: string           // items / reason, shown on the customer's refund receipt
  emailedAt?: number      // set once the refund receipt email was sent
}

export interface TxRecord {
  invoiceId: string
  txHash: string
  amount: number   // USDC float: what the customer paid
  fee: number      // platform fee (0.5%)
  net: number      // merchant net
  tax: number      // tax reserve share
  timestamp: number
  customer?: string        // customer wallet that paid (used as the refund destination)
  email?: string           // customer email entered at checkout (kept on this device)
  refund?: RefundState     // legacy
  refunds?: RefundEntry[]
}

const toMicro = (n: number) => Math.round(n * 1e6)

/** All refunds on a sale, including a legacy full refund. */
export function getRefunds(r: TxRecord): RefundEntry[] {
  const list = r.refunds ?? []
  if (r.refund?.completedAt && list.length === 0) {
    return [{ id: 'legacy', amount: r.amount, status: 'confirmed', createdAt: r.refund.completedAt, txHash: r.refund.customerTx }]
  }
  return list
}

export interface RefundSummary {
  paid: number
  refunded: number         // confirmed refunds
  pending: number          // sent but not yet confirmed (counts against the balance)
  remaining: number        // still refundable
  remainingMicro: number
  hasPending: boolean
}

export function refundSummary(r: TxRecord): RefundSummary {
  const entries = getRefunds(r)
  const sum = (s: RefundStatus) => entries.filter(e => e.status === s).reduce((t, e) => t + toMicro(e.amount), 0)
  const paidMicro = toMicro(r.amount)
  const confirmed = sum('confirmed')
  const pending = sum('pending')
  const remainingMicro = Math.max(0, paidMicro - confirmed - pending)
  return {
    paid: r.amount,
    refunded: confirmed / 1e6,
    pending: pending / 1e6,
    remaining: remainingMicro / 1e6,
    remainingMicro,
    hasPending: entries.some(e => e.status === 'pending'),
  }
}

export const TxRecords = {
  getAll(): TxRecord[] {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as TxRecord[]
    } catch { return [] }
  },
  save(record: TxRecord) {
    const all = TxRecords.getAll()
    all.push(record)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all))
  },
  /** Merge a patch into the record with this timestamp. */
  update(timestamp: number, patch: Partial<TxRecord>) {
    const all = TxRecords.getAll().map(r => (r.timestamp === timestamp ? { ...r, ...patch } : r))
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all))
  },
  get(timestamp: number): TxRecord | undefined {
    return TxRecords.getAll().find(r => r.timestamp === timestamp)
  },
  /** Add a refund entry, or update the one with the same id. Reads fresh data every time. */
  upsertRefund(timestamp: number, entry: RefundEntry) {
    const rec = TxRecords.get(timestamp)
    if (!rec) return
    const list = rec.refunds ?? []
    const next = list.some(e => e.id === entry.id) ? list.map(e => (e.id === entry.id ? { ...e, ...entry } : e)) : [...list, entry]
    TxRecords.update(timestamp, { refunds: next })
  },
  clear() {
    localStorage.removeItem(STORAGE_KEY)
  },
}
