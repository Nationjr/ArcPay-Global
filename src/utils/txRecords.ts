const STORAGE_KEY = 'arcpay_records'

/** A refund: one full-amount transfer back to the customer, with no fee. */
export interface RefundState {
  customerTx?: string       // hash of the refund transfer
  completedAt?: number
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
  refund?: RefundState
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
  clear() {
    localStorage.removeItem(STORAGE_KEY)
  },
}
