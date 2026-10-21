import React, { useState, useEffect } from 'react'
import { Download, TrendingUp, DollarSign, FileText, BarChart2, ExternalLink } from 'lucide-react'
import { useAccount, useReadContract } from 'wagmi'
import { Amount } from '@/onchain-money'
import { OfflineQueue } from '../utils/offlineQueue'
import { TxRecords, type TxRecord } from '../utils/txRecords'
import { buildTxExplorerUrl } from '@/onchain-facts'

const ARC_TESTNET_CHAIN_ID = 5042002

interface Props {
  contractAddress: `0x${string}` | null
  contractAbi: readonly unknown[]
}

export function AnalyticsTab({ contractAddress, contractAbi }: Props) {
  const { address } = useAccount()
  const [todayDateStr] = useState(() => new Date().toDateString())
  // Re-read from localStorage on every mount so new transactions appear immediately
  const [records, setRecords] = useState<TxRecord[]>([])

  useEffect(() => {  // eslint-disable-line react/set-state-in-effect
    const load = () => setRecords(TxRecords.getAll())  // eslint-disable-line react/set-state-in-effect
    load()
    // Re-read whenever the tab regains focus so new payments appear immediately
    window.addEventListener('focus', load)
    document.addEventListener('visibilitychange', load)
    return () => {
      window.removeEventListener('focus', load)
      document.removeEventListener('visibilitychange', load)
    }
  }, [])

  const { data: totalVolume } = useReadContract({
    address: contractAddress ?? undefined,
    abi: contractAbi as never[],
    functionName: 'totalVolumeProcessed',
    chainId: ARC_TESTNET_CHAIN_ID,
    query: { enabled: !!contractAddress, refetchInterval: 10_000, refetchOnWindowFocus: true },
  }) as { data: bigint | undefined }

  const { data: totalFees } = useReadContract({
    address: contractAddress ?? undefined,
    abi: contractAbi as never[],
    functionName: 'totalPlatformFeesCollected',
    chainId: ARC_TESTNET_CHAIN_ID,
    query: { enabled: !!contractAddress, refetchInterval: 10_000, refetchOnWindowFocus: true },
  }) as { data: bigint | undefined }

  const { data: liquidBalance } = useReadContract({
    address: contractAddress ?? undefined,
    abi: contractAbi as never[],
    functionName: 'merchantLiquidBalance',
    args: address ? [address] : undefined,
    chainId: ARC_TESTNET_CHAIN_ID,
    query: { enabled: !!contractAddress && !!address, refetchInterval: 10_000, refetchOnWindowFocus: true },
  }) as { data: bigint | undefined }

  const { data: taxReserve } = useReadContract({
    address: contractAddress ?? undefined,
    abi: contractAbi as never[],
    functionName: 'merchantTaxReserve',
    args: address ? [address] : undefined,
    chainId: ARC_TESTNET_CHAIN_ID,
    query: { enabled: !!contractAddress && !!address, refetchInterval: 10_000, refetchOnWindowFocus: true },
  }) as { data: bigint | undefined }

  const [lastRefresh, setLastRefresh] = useState<Date | null>(null)
  useEffect(() => {  // eslint-disable-line react/set-state-in-effect
    setLastRefresh(new Date())  // eslint-disable-line react/set-state-in-effect
  }, [totalVolume, totalFees, liquidBalance, taxReserve]) // eslint-disable-line react-hooks/exhaustive-deps

  const fmt = (v: bigint | undefined) =>
    v !== undefined ? `$${Amount.fromRaw(v, 6).toFixed(2)}` : '—'

  const todayRecords = records.filter(r => new Date(r.timestamp).toDateString() === todayDateStr) // eslint-disable-line react/purity

  const dailyTotal = todayRecords.reduce((s, r) => s + r.amount, 0)
  const dailyFees = todayRecords.reduce((s, r) => s + r.fee, 0)
  const dailyNet = todayRecords.reduce((s, r) => s + r.net, 0)

  const exportCSV = () => {
    const rows = [
      ['Invoice ID', 'Tx Hash', 'Amount USDC', 'Platform Fee', 'Net Revenue', 'Tax Reserve', 'Timestamp'],
      ...records.map(r => [r.invoiceId, r.txHash ?? '', r.amount.toFixed(6), r.fee.toFixed(6), r.net.toFixed(6), r.tax.toFixed(6), new Date(r.timestamp).toISOString()]),
    ]
    const csv = rows.map(r => r.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `arcpay_export_${Date.now()}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const stats = [
    { icon: DollarSign, label: 'Total Volume', value: totalVolume !== undefined ? fmt(totalVolume) : `$${dailyTotal.toFixed(2)}`, sub: 'All-time onchain' },
    { icon: TrendingUp, label: 'Net Revenue', value: fmt(liquidBalance), sub: 'Your liquid balance' },
    { icon: FileText, label: 'Tax Reserve', value: fmt(taxReserve), sub: 'Collected for taxes' },
    { icon: BarChart2, label: 'Platform Fees', value: totalFees !== undefined ? fmt(totalFees) : `$${dailyFees.toFixed(4)}`, sub: '0.5% collected all-time' },
  ]

  return (
    <div className="flex flex-col gap-4 w-full max-w-sm mx-auto pb-6">
      <div className="flex items-center justify-between">
        <div className="display text-2xl font-bold" style={{ color: 'var(--ink)' }}>Analytics</div>
        {lastRefresh && (
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
            <span className="text-xs" style={{ color: 'var(--subtle)' }}>
              Updated {lastRefresh.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
          </div>
        )}
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-3">
        {stats.map(({ icon: Icon, label, value, sub }) => (
          <div key={label} className="rounded-2xl p-4" style={{ background: 'var(--surface-strong)', border: '1px solid var(--border)' }}>
            <div className="flex items-center gap-2 mb-2">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'var(--surface-muted)' }}>
                <Icon size={14} style={{ color: 'var(--accent)' }} />
              </div>
              <span className="text-xs font-medium" style={{ color: 'var(--muted)' }}>{label}</span>
            </div>
            <div className="display text-xl font-bold tabular-nums" style={{ color: 'var(--ink)' }}>{value}</div>
            <div className="text-xs mt-0.5" style={{ color: 'var(--subtle)' }}>{sub}</div>
          </div>
        ))}
      </div>

      {/* Today summary */}
      <div className="rounded-2xl p-5" style={{ background: 'var(--surface-strong)', border: '1px solid var(--border)' }}>
        <div className="text-sm font-semibold mb-3" style={{ color: 'var(--ink)' }}>Today</div>
        {[
          { label: 'Total processed', val: `$${dailyTotal.toFixed(2)}` },
          { label: 'Net profit', val: `$${dailyNet.toFixed(2)}` },
          { label: 'Platform fees sent', val: `$${dailyFees.toFixed(4)}` },
          { label: 'Pending offline', val: `${OfflineQueue.count()} payments` },
        ].map(({ label, val }) => (
          <div key={label} className="flex justify-between py-2 text-sm" style={{ borderBottom: '1px solid var(--border)' }}>
            <span style={{ color: 'var(--muted)' }}>{label}</span>
            <span className="font-semibold tabular-nums" style={{ color: 'var(--ink)' }}>{val}</span>
          </div>
        ))}
      </div>

      {/* Transaction history */}
      <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--surface-strong)', border: '1px solid var(--border)' }}>
        <div className="px-5 pt-4 pb-3 flex items-center justify-between">
          <div className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>Transaction History</div>
          <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: 'var(--surface-muted)', color: 'var(--muted)' }}>
            {records.length} total
          </span>
        </div>
        {records.length === 0 ? (
          <div className="px-5 pb-5 text-sm" style={{ color: 'var(--muted)' }}>
            No transactions yet. Complete a payment to see it here.
          </div>
        ) : (
          <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
            {[...records].reverse().slice(0, 20).map((r, i) => (
              <div key={i} className="px-5 py-3 flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="font-semibold tabular-nums text-sm" style={{ color: 'var(--ink)' }}>
                      ${r.amount.toFixed(2)} USDC
                    </span>
                    {r.txHash && (
                      <a
                        href={buildTxExplorerUrl(ARC_TESTNET_CHAIN_ID, r.txHash)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-shrink-0"
                      >
                        <ExternalLink size={11} style={{ color: 'var(--accent)' }} />
                      </a>
                    )}
                  </div>
                  <div className="text-xs mt-0.5 tabular-nums" style={{ color: 'var(--muted)' }}>
                    Fee ${r.fee.toFixed(4)} · Net ${r.net.toFixed(2)}
                  </div>
                </div>
                <div className="text-xs tabular-nums flex-shrink-0 text-right" style={{ color: 'var(--subtle)' }}>
                  {new Date(r.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  <div>{new Date(r.timestamp).toLocaleDateString([], { month: 'short', day: 'numeric' })}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Export */}
      <button
        onClick={exportCSV}
        className="w-full py-4 rounded-2xl font-semibold flex items-center justify-center gap-2 transition-colors text-sm"
        style={{ background: 'var(--surface-strong)', border: '1px solid var(--border)', color: 'var(--ink)' }}
      >
        <Download size={16} /> Export CSV for Tax Accounting
      </button>
    </div>
  )
}
