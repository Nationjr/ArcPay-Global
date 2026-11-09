import { parseUsdc, formatUsdc } from '@/onchain-money'

/** A refund returns exactly what the customer paid, in one transfer. No fee is charged. */
export function planRefund(paidUsdc: number): { paidRaw: bigint } {
  return { paidRaw: parseUsdc(paidUsdc.toFixed(6)) }
}

export const fmtRaw = (raw: bigint) => Number(formatUsdc(raw)).toFixed(2)
