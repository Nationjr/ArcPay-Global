import React, { useState, useCallback, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Delete, QrCode, Settings, CheckCircle, ChevronDown, RefreshCw } from 'lucide-react'
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { getUsdc, buildTxExplorerUrl } from '@/onchain-facts'
import { toast } from 'sonner'
import { QRModal } from './QRModal'
import { TxRecords } from '../utils/txRecords'
import { useFxRates } from '../hooks/useFxRates'

const ARC_TESTNET_CHAIN_ID = 5042002

interface Props {
  contractAddress: `0x${string}` | null
  contractAbi: readonly unknown[]
  supplierAddress: string
  taxBps: number
  supplierBps: number
  onNavigateSettings: () => void
}

export function POSKeypad({ contractAddress: _contractAddress, contractAbi: _contractAbi, supplierAddress: _supplierAddress, taxBps, supplierBps, onNavigateSettings }: Props) {
  void _contractAddress; void _contractAbi
  const { address, isConnected } = useAccount()
  const { rates: fxRates, status: fxStatus, updatedAt: fxUpdatedAt, refresh: fxRefresh } = useFxRates()
  const [display, setDisplay] = useState('0')
  const [currency, setCurrency] = useState<string>('USD')
  const [showQR, setShowQR] = useState(false)
  const [invoiceId, setInvoiceId] = useState<`0x${string}` | null>(null)
  const [showSuccess, setShowSuccess] = useState(false)
  const [currencyOpen, setCurrencyOpen] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const pendingTxRef = useRef<{ amount: number; fee: number; net: number; tax: number } | null>(null)

  const usdc = getUsdc(ARC_TESTNET_CHAIN_ID)

  const { writeContract: _writeContract, data: writeHash, isPending: _isPending } = useWriteContract()
  void _writeContract; void _isPending
  const { isLoading: _isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash: writeHash })
  void _isConfirming

  useEffect(() => {  // eslint-disable-line react/set-state-in-effect
    if (!isSuccess || !writeHash) return
    setShowSuccess(true)  // eslint-disable-line react/set-state-in-effect
    const audio = audioRef.current  // eslint-disable-line react/refs
    void audio?.play().catch(() => {})  // eslint-disable-line react/refs
    if ('vibrate' in navigator) navigator.vibrate([100, 50, 100])

    const snap = pendingTxRef.current  // eslint-disable-line react/refs
    if (snap) {
      TxRecords.save({
        invoiceId: invoiceId ?? writeHash,
        txHash: writeHash,
        amount: snap.amount,
        fee: snap.fee,
        net: snap.net,
        tax: snap.tax,
        timestamp: Date.now(),
      })
      pendingTxRef.current = null  // eslint-disable-line react/refs
    }
  }, [isSuccess, writeHash]) // eslint-disable-line react-hooks/exhaustive-deps

  const merchantAmount = parseFloat(display) / (fxRates[currency] ?? 1)
  const usdcAmount = merchantAmount > 0 ? merchantAmount * 1.005 : 0

  const pressKey = useCallback((key: string) => {
    setDisplay(prev => {
      if (key === '.') {
        if (prev.includes('.')) return prev
        return prev + '.'
      }
      if (key === 'C') return '0'
      if (prev === '0') return key
      if (prev.length >= 10) return prev
      return prev + key
    })
  }, [])

  const handleBackspace = useCallback(() => {
    setDisplay(prev => (prev.length <= 1 ? '0' : prev.slice(0, -1)))
  }, [])

  const generateInvoice = useCallback((): `0x${string}` => {
    const id = `0x${Date.now().toString(16).padStart(16, '0')}${Math.random().toString(16).slice(2, 18)}` as `0x${string}`
    setInvoiceId(id)
    return id
  }, [])

  const handleCharge = useCallback(() => {
    if (!isConnected || !address) { toast.error('Connect your wallet first'); return }
    if (parseFloat(display) <= 0) { toast.error('Enter an amount'); return }
    if (!usdc) { toast.error('USDC not available on this chain'); return }

    generateInvoice()
    setShowQR(true)
  }, [isConnected, address, display, usdc, generateInvoice]) // eslint-disable-line react-hooks/exhaustive-deps

  const keys = ['1','2','3','4','5','6','7','8','9','.','0','⌫']

  const platformFee = usdcAmount * 0.005 / 1.005
  const supplierShare = usdcAmount * supplierBps / 10000
  const taxShare = usdcAmount * taxBps / 10000
  const _netRevenue = usdcAmount - platformFee - supplierShare - taxShare
  const feePreview = merchantAmount > 0 ? [
    { label: 'You receive', val: merchantAmount, plus: false },
    { label: 'Platform fee (0.5% added)', val: platformFee, plus: true },
    ...(supplierBps > 0 ? [{ label: `Supplier (${(supplierBps / 100).toFixed(0)}%)`, val: supplierShare, plus: false }] : []),
    ...(taxBps > 0 ? [{ label: `Tax reserve (${(taxBps / 100).toFixed(0)}%)`, val: taxShare, plus: false }] : []),
    { label: 'Customer pays', val: usdcAmount, plus: false },
  ] : []

  return (
    <div className="flex flex-col gap-4 w-full max-w-sm mx-auto pb-6">
      <audio ref={audioRef} preload="none">
        <source src="data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAA..." type="audio/wav" />
      </audio>

      {/* Status bar */}
      <div className="flex items-center justify-between px-1">
        <div className="text-xs font-medium" style={{ color: 'var(--muted)' }}>ArcPay POS</div>
        <button onClick={onNavigateSettings} className="text-[var(--muted)] hover:text-[var(--ink)] transition-colors p-1 rounded-lg hover:bg-[var(--surface-muted)]">
          <Settings size={16} />
        </button>
      </div>

      {/* Amount display */}
      <div
        className="rounded-2xl p-6 text-center"
        style={{ background: 'var(--surface-strong)', border: '1px solid var(--border)', backdropFilter: 'blur(12px)' }}
      >
        {/* Currency selector */}
        <div className="relative inline-block mb-3">
          <button
            onClick={() => setCurrencyOpen(v => !v)}
            className="flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg transition-colors"
            style={{ background: 'var(--surface-muted)', color: 'var(--muted)' }}
          >
            {currency} <ChevronDown size={12} />
          </button>
          {currencyOpen && (
            <div className="absolute top-full left-0 mt-1 z-10 rounded-xl shadow-lg overflow-hidden" style={{ background: 'var(--surface-strong)', border: '1px solid var(--border)' }}>
              {Object.keys(fxRates).map(c => (
                <button key={c} onClick={() => { setCurrency(c); setCurrencyOpen(false) }}
                  className="block w-full text-left px-4 py-2 text-sm hover:bg-[var(--surface-muted)] transition-colors"
                  style={{ color: c === currency ? 'var(--accent)' : 'var(--ink)' }}>
                  {c}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="display text-5xl font-bold tabular-nums tracking-tight" style={{ color: 'var(--ink)', letterSpacing: '-0.04em' }}>
          {currency === 'USD' ? '$' : ''}{display}
          {currency !== 'USD' && <span className="ml-2 text-lg font-semibold" style={{ color: 'var(--muted)' }}>{currency}</span>}
        </div>

        {currency !== 'USD' && usdcAmount > 0 && (
          <div className="text-sm mt-1 tabular-nums" style={{ color: 'var(--muted)' }}>
            ≈ ${usdcAmount.toFixed(2)} USDC
          </div>
        )}

        {/* FX rate status indicator */}
        <div className="flex items-center justify-center gap-1.5 mt-2">
          {fxStatus === 'loading' && (
            <><div className="w-2 h-2 rounded-full bg-gray-400 animate-pulse" /><span className="text-xs" style={{ color: 'var(--subtle)' }}>Loading rates…</span></>
          )}
          {fxStatus === 'live' && (
            <><div className="w-2 h-2 rounded-full bg-green-500" /><span className="text-xs" style={{ color: 'var(--subtle)' }}>Live rates {fxUpdatedAt ? `· ${fxUpdatedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}</span></>
          )}
          {fxStatus === 'stale' && (
            <><div className="w-2 h-2 rounded-full bg-amber-400" /><span className="text-xs" style={{ color: 'var(--subtle)' }}>Rates may be stale</span><button onClick={fxRefresh} className="ml-1 hover:opacity-70 transition-opacity" title="Refresh rates"><RefreshCw size={10} style={{ color: 'var(--muted)' }} /></button></>
          )}
          {fxStatus === 'offline' && (
            <><div className="w-2 h-2 rounded-full bg-red-400" /><span className="text-xs" style={{ color: 'var(--subtle)' }}>Offline — using fallback rates</span><button onClick={fxRefresh} className="ml-1 hover:opacity-70 transition-opacity" title="Retry"><RefreshCw size={10} style={{ color: 'var(--muted)' }} /></button></>
          )}
        </div>

        {feePreview.length > 0 && (
          <div className="mt-4 space-y-1 text-xs" style={{ color: 'var(--muted)' }}>
            {feePreview.map((f, i) => {
              const isTotal = f.label === 'Customer pays'
              return (
                <div
                  key={f.label}
                  className={`flex justify-between ${isTotal ? 'pt-1 border-t font-semibold' : ''}`}
                  style={isTotal ? { borderColor: 'var(--border)', color: 'var(--ink)' } : {}}
                >
                  <span>{f.label}</span>
                  <span className="tabular-nums">
                    {i > 0 && !isTotal && f.label.startsWith('Platform') ? '+' : ''}${f.val.toFixed(2)}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Keypad */}
      <div className="grid grid-cols-3 gap-2.5">
        {keys.map(key => (
          <motion.button
            key={key}
            whileTap={{ scale: 0.94 }}
            onClick={() => key === '⌫' ? handleBackspace() : pressKey(key)}
            className="h-16 rounded-2xl text-2xl font-semibold flex items-center justify-center transition-colors select-none"
            style={{
              background: key === '⌫' ? 'var(--surface-muted)' : 'var(--surface-strong)',
              border: '1px solid var(--border)',
              color: key === '⌫' ? 'var(--muted)' : 'var(--ink)',
              fontFamily: key === '⌫' ? 'inherit' : "'Space Grotesk', sans-serif",
            }}
          >
            {key === '⌫' ? <Delete size={20} /> : key}
          </motion.button>
        ))}
      </div>

      {/* Charge button */}
      <motion.button
        whileTap={{ scale: 0.97 }}
        onClick={handleCharge}
        disabled={parseFloat(display) <= 0}
        className="w-full py-4 rounded-2xl text-white font-semibold text-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
        style={{ background: 'var(--accent)' }}
      >
        <QrCode size={20} /> Charge ${usdcAmount > 0 ? usdcAmount.toFixed(2) : '0.00'} USDC
      </motion.button>

      {/* QR Modal */}
      {showQR && invoiceId && address && (
        <QRModal
          invoiceId={invoiceId}
          amount={usdcAmount}
          merchant={address}
          onClose={() => setShowQR(false)}
          onSuccess={(txHash?: string) => {
            setShowQR(false)
            setShowSuccess(true)
            const _pf = usdcAmount * 0.005 / 1.005
            const _ts = usdcAmount * taxBps / 10000
            const _ss = usdcAmount * supplierBps / 10000
            TxRecords.save({
              invoiceId: invoiceId ?? 'qr',
              txHash: txHash ?? '',
              amount: usdcAmount,
              fee: _pf,
              net: usdcAmount - _pf - _ss - _ts,
              tax: _ts,
              timestamp: Date.now(),
            })
          }}
        />
      )}

      {/* Success overlay */}
      <AnimatePresence>
        {showSuccess && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex flex-col items-center justify-center"
            style={{ background: 'rgba(26,128,71,0.97)' }}
          >
            <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 300, damping: 20 }}>
              <CheckCircle size={96} strokeWidth={1.5} className="text-white" />
            </motion.div>
            <div className="display text-3xl font-bold text-white mt-6">Payment Received</div>
            <div className="text-white/80 text-sm mt-2">Sub-second Arc finality</div>
            {writeHash && (
              <a href={buildTxExplorerUrl(ARC_TESTNET_CHAIN_ID, writeHash)} target="_blank" rel="noopener noreferrer"
                className="mt-4 text-white/60 text-xs underline">View on explorer</a>
            )}
            <button
              onClick={() => { setShowSuccess(false); setDisplay('0') }}
              className="mt-8 px-12 py-3 rounded-2xl font-semibold text-black text-base"
              style={{ background: '#ffffff' }}
            >
              OK
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
