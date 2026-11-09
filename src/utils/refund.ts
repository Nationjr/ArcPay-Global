import { parseUsdc, formatUsdc } from '@/onchain-money'

/** Platform fee wallet: receives 60% of every fee. */
export const PLATFORM_FEE_RECIPIENT = '0x164C2cbF41832439e517a9605B5f12BE2e26E0Ef' as const

const FEE_BPS = 50n         // 0.5%
const PLATFORM_SHARE = 60n  // percent of the fee

export interface RefundPlan {
  paidRaw: bigint
  feeRaw: bigint            // 0.5% withheld
  customerRaw: bigint       // what the customer gets back
  platformRaw: bigint       // 60% of the fee
  feeRecipientRaw: bigint   // 40% of the fee
}

/** The customer gets back what they paid minus 0.5%. The withheld fee is split 60/40. */
export function planRefund(paidUsdc: number): RefundPlan {
  const paidRaw = parseUsdc(paidUsdc.toFixed(6))
  const feeRaw = (paidRaw * FEE_BPS) / 10_000n
  const platformRaw = (feeRaw * PLATFORM_SHARE) / 100n
  return {
    paidRaw,
    feeRaw,
    customerRaw: paidRaw - feeRaw,
    platformRaw,
    feeRecipientRaw: feeRaw - platformRaw,
  }
}

export const fmtRaw = (raw: bigint) => Number(formatUsdc(raw)).toFixed(4)
