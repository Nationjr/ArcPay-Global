const STORAGE_KEY = 'arcpay_offline_queue'

export interface OfflinePayload {
  invoiceId: string
  merchant: string
  grossAmount: string
  supplier: string
  supplierShareBps: number
  taxShareBps: number
  timestamp: number
}

export const OfflineQueue = {
  enqueue(payload: OfflinePayload) {
    const queue = OfflineQueue.getAll()
    queue.push(payload)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(queue))
  },
  getAll(): OfflinePayload[] {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as OfflinePayload[]
    } catch { return [] }
  },
  clear() {
    localStorage.removeItem(STORAGE_KEY)
  },
  count(): number {
    return OfflineQueue.getAll().length
  },
}
