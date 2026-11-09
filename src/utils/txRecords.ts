const STORAGE_KEY = 'arcpay_records'

/** Progress of a refund. Each field holds the hash of a completed transfer, so a
 *  refund that is interrupted part-way can be resumed without paying anyone twice. */
export interface RefundState {
  customerTx?: string       // refund sent to the customer
  platformTx?: string       // 60% of the withheld fee, sent to the platform
  feeRecipientTx?: string   // 40% of the withheld fee, sent to the merchant fee address
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
