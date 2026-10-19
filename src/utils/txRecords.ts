const STORAGE_KEY = 'arcpay_records'

export interface TxRecord {
  invoiceId: string
  txHash: string
  amount: number   // USDC float
  fee: number      // platform fee (0.5%)
  net: number      // merchant net
  tax: number      // tax reserve share
  timestamp: number
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
  clear() {
    localStorage.removeItem(STORAGE_KEY)
  },
}
