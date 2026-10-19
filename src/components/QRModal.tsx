import React, { useCallback, useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { X, Copy, CheckCircle, ExternalLink, Loader2, Wifi } from 'lucide-react'
import { useWatchContractEvent } from 'wagmi'
import { erc20Abi, parseUnits } from 'viem'
import { getUsdc } from '@/onchain-facts'
import { toast } from 'sonner'
import QRCode from 'qrcode'

const ARC_TESTNET_CHAIN_ID = 5042002
const ARC_EXPLORER_BASE = 'https://explorer.testnet.arc.io'

function buildEip681Uri(usdcAddress: string, recipient: string, amountRaw: bigint, chainId: number): string {
  return `ethereum:${usdcAddress}@${chainId}/transfer?address=${recipient}&uint256=${amountRaw.toString()}`
}

interface Props {
  invoiceId: `0x${string}`
  amount: number           // gross USDC float (merchant amount + fee)
  merchant: `0x${string}`
  onClose: () => void
  onSuccess: (txHash?: string) => void
}

type QrMode = 'address' | 'eip681'

export function QRModal({ invoiceId: _invoiceId, amount, merchant, onClose, onSuccess }: Props) {
  const [copied, setCopied] = useState(false)
  const [tipPct, setTipPct] = useState(0)
  const [receiptEmail, setReceiptEmail] = useState('')
  const [emailSending, setEmailSending] = useState(false)
  const [emailSent, setEmailSent] = useState(false)
  const [qrMode, setQrMode] = useState<QrMode>('address')
  const [detected, setDetected] = useState(false)
  const [incomingTxHash, setIncomingTxHash] = useState<string>('')
  const [nfcActive, setNfcActive] = useState(false)
  const [nfcStatus, setNfcStatus] = useState<'idle' | 'writing' | 'ready' | 'error'>('idle')
  const nfcAbortRef = useRef<AbortController | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const detectedRef = useRef(false)

  // Check if Web NFC is available (Chrome on Android only)
  const nfcSupported = typeof window !== 'undefined' && 'NDEFReader' in window

  const totalAmount = amount * (1 + tipPct / 100)
  const usdc = getUsdc(ARC_TESTNET_CHAIN_ID)
  const amountRaw = parseUnits(totalAmount.toFixed(6), 6)

  // QR encodes the merchant wallet address directly — customer sends USDC peer-to-peer
  const eip681Uri = usdc
    ? buildEip681Uri(usdc.address, merchant, amountRaw, ARC_TESTNET_CHAIN_ID)
    : ''
  const paymentUri = qrMode === 'address' ? merchant : eip681Uri

  // Watch for USDC Transfer to the merchant wallet
  useWatchContractEvent({
    address: usdc?.address as `0x${string}` | undefined,
    abi: erc20Abi,
    eventName: 'Transfer',
    chainId: ARC_TESTNET_CHAIN_ID,
    enabled: !!usdc && !detected,
    onLogs(logs) {
      for (const log of logs) {
        const { args } = log as { args?: { to?: string; value?: bigint } }
        if (!args) continue
        const toAddr = (args.to ?? '').toLowerCase()
        if (toAddr !== merchant.toLowerCase()) continue
        // Address mode: any non-zero transfer; EIP-681: within 2% of expected
        const received = Number(args.value ?? 0n) / 1e6
        if (qrMode === 'eip681') {
          if (totalAmount > 0 && Math.abs(received - totalAmount) / totalAmount > 0.02) continue
        } else {
          if (received <= 0) continue
        }
        if (detectedRef.current) return
        detectedRef.current = true
        const txLog = log as { transactionHash?: string }
        const txHash = txLog.transactionHash || undefined
        if (txHash) setIncomingTxHash(txHash)  // eslint-disable-line react/set-state-in-effect
        setDetected(true)  // eslint-disable-line react/set-state-in-effect
        toast.success('Payment detected!')
        // Send receipt then fire success — modal must stay mounted until receipt is dispatched
        void sendReceipt(txHash).then(() => onSuccess(txHash))
      }
    },
  })

  // Sends receipt email — returns a promise so callers can await before closing
  const sendReceipt = useCallback(async (txHash?: string): Promise<void> => {
    const email = receiptEmail.trim()
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return
    const fee = totalAmount * 0.005 / 1.005
    setEmailSending(true)
    try {
      const res = await fetch('/api/receipt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email, invoiceId: txHash ?? 'qr', txHash: txHash ?? '',
          amount: totalAmount, fee, net: totalAmount - fee, tax: 0,
          timestamp: Date.now(), explorerBase: ARC_EXPLORER_BASE,
        }),
      })
      const data = await res.json() as { ok?: boolean; error?: string }
      if (data.ok) { setEmailSent(true); toast.success(`Receipt sent to ${email}`) }
      else toast.error(`Receipt failed: ${data.error ?? 'unknown error'}`)
    } catch {
      toast.error('Could not send receipt email')
    } finally {
      setEmailSending(false)
    }
  }, [receiptEmail, totalAmount])

  // Render QR code
  useEffect(() => {
    if (!canvasRef.current || !paymentUri) return
    void QRCode.toCanvas(canvasRef.current, paymentUri, {
      width: 220,
      margin: 2,
      color: { dark: '#122d45', light: '#ffffff' },
      errorCorrectionLevel: 'M',
    })
  }, [paymentUri])

  const handleCopyUri = () => {
    void navigator.clipboard.writeText(paymentUri).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  const handleManualPaid = () => {
    void sendReceipt(undefined).then(() => {
      onSuccess(undefined)
      onClose()
    })
  }

  const handleNfc = async () => {
    if (!nfcSupported) {
      toast.error('NFC is not supported on this device. Use Chrome on Android.')
      return
    }
    if (nfcActive) {
      // Cancel active NFC session
      nfcAbortRef.current?.abort()
      nfcAbortRef.current = null
      setNfcActive(false)
      setNfcStatus('idle')
      return
    }
    const abort = new AbortController()
    nfcAbortRef.current = abort
    setNfcActive(true)
    setNfcStatus('writing')
    try {
      const reader = new NDEFReader()
      await reader.write(
        { records: [{ recordType: 'url', data: paymentUri }] },
        { signal: abort.signal }
      )
      setNfcStatus('ready')
      toast.success('NFC ready — customer can tap now')
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        setNfcStatus('idle')
      } else {
        setNfcStatus('error')
        toast.error(`NFC failed: ${(err as Error).message ?? 'unknown error'}`)
      }
      setNfcActive(false)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-40 flex items-end justify-center sm:items-center"
      style={{ background: 'rgba(18,45,69,0.6)', backdropFilter: 'blur(4px)' }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        initial={{ y: 60, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 60, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        className="w-full max-w-sm rounded-t-3xl sm:rounded-3xl p-6 space-y-4 overflow-y-auto max-h-[95dvh]"
        style={{ background: 'var(--surface-strong)', border: '1px solid var(--border)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <div className="display text-xl font-bold" style={{ color: 'var(--ink)' }}>Scan to Pay</div>
            <div className="text-sm" style={{ color: 'var(--muted)' }}>Customer scans with any wallet app</div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl transition-colors hover:opacity-70"
            style={{ background: 'var(--surface-muted)', color: 'var(--muted)' }}
          >
            <X size={18} />
          </button>
        </div>

        {/* QR mode toggle */}
        <div className="flex rounded-xl overflow-hidden border" style={{ borderColor: 'var(--border)' }}>
          {(['address', 'eip681'] as QrMode[]).map(mode => (
            <button
              key={mode}
              onClick={() => setQrMode(mode)}
              className="flex-1 py-2 text-xs font-medium transition-colors"
              style={{
                background: qrMode === mode ? 'var(--accent)' : 'var(--surface-muted)',
                color: qrMode === mode ? '#fff' : 'var(--muted)',
              }}
            >
              {mode === 'address' ? 'Address (universal)' : 'EIP-681 (pre-filled)'}
            </button>
          ))}
        </div>

        {/* Amount */}
        <div className="text-center">
          <div className="display text-3xl font-bold tabular-nums" style={{ color: 'var(--ink)' }}>
            ${totalAmount.toFixed(2)} <span className="text-lg font-normal" style={{ color: 'var(--muted)' }}>USDC</span>
          </div>
          <div className="text-xs mt-1" style={{ color: 'var(--subtle)' }}>
            includes 0.5% platform fee
          </div>
        </div>

        {/* Tip buttons */}
        <div className="flex gap-2 justify-center">
          {[0, 5, 10, 15].map(pct => (
            <button
              key={pct}
              onClick={() => setTipPct(pct)}
              className="flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors"
              style={{
                background: tipPct === pct ? 'var(--accent)' : 'var(--surface-muted)',
                color: tipPct === pct ? '#fff' : 'var(--muted)',
              }}
            >
              {pct === 0 ? 'No tip' : `+${pct}%`}
            </button>
          ))}
        </div>

        {/* QR code */}
        <div className="flex flex-col items-center gap-3">
          <div
            className="p-3 rounded-2xl"
            style={{ background: '#fff', border: '1px solid var(--border)' }}
          >
            <canvas ref={canvasRef} />
          </div>

          {/* Wallet compatibility note */}
          {qrMode === 'address' ? (
            <div className="text-xs text-center px-2" style={{ color: 'var(--muted)' }}>
              Works with <strong>all wallets</strong> — Rabby, MetaMask, Trust, Coinbase, Bybit, OKX.
              Customer selects USDC and enters the amount.
            </div>
          ) : (
            <div className="text-xs text-center px-2" style={{ color: 'var(--muted)' }}>
              Pre-fills amount. Works with MetaMask, Trust Wallet, Coinbase Wallet.
              <strong className="block mt-0.5" style={{ color: 'var(--danger)' }}>Rabby and Bybit do not support EIP-681.</strong>
            </div>
          )}

          {/* Merchant address */}
          <div className="w-full rounded-xl px-3 py-2 text-xs font-mono break-all text-center"
            style={{ background: 'var(--surface-muted)', color: 'var(--muted)' }}>
            {merchant}
          </div>

          {/* Copy address */}
          <button
            onClick={handleCopyUri}
            className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-medium transition-colors"
            style={{ background: 'var(--surface-muted)', color: 'var(--muted)' }}
          >
            {copied ? <CheckCircle size={14} /> : <Copy size={14} />}
            {copied ? 'Copied' : 'Copy address'}
          </button>

          {/* NFC tap button — shown only when supported or always visible as fallback hint */}
          <button
            onClick={() => void handleNfc()}
            className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-medium transition-colors"
            style={{
              background: nfcActive
                ? (nfcStatus === 'ready' ? 'rgba(22,163,74,0.12)' : 'rgba(99,102,241,0.12)')
                : 'var(--surface-muted)',
              color: nfcActive
                ? (nfcStatus === 'ready' ? 'var(--success)' : 'var(--accent)')
                : (nfcSupported ? 'var(--muted)' : 'var(--subtle)'),
              border: nfcActive ? `1px solid ${nfcStatus === 'ready' ? 'var(--success)' : 'var(--accent)'}` : '1px solid transparent',
              opacity: !nfcSupported ? 0.5 : 1,
            }}
          >
            {nfcStatus === 'writing'
              ? <Loader2 size={14} className="animate-spin" />
              : <Wifi size={14} />}
            {nfcStatus === 'ready'
              ? 'NFC ready — customer tap now'
              : nfcStatus === 'writing'
              ? 'Activating NFC…'
              : nfcActive
              ? 'Cancel NFC'
              : nfcSupported
              ? 'Accept via NFC tap'
              : 'NFC (Android Chrome only)'}
          </button>
        </div>

        {/* Waiting indicator / detected state */}
        {!detected ? (
          <div className="flex items-center justify-center gap-2 py-2">
            <Loader2 size={14} className="animate-spin" style={{ color: 'var(--muted)' }} />
            <span className="text-xs" style={{ color: 'var(--muted)' }}>Waiting for payment…</span>
          </div>
        ) : (
          <div className="rounded-xl p-3 text-center space-y-1"
            style={{ background: 'rgba(22,163,74,0.08)', border: '1px solid var(--success)' }}>
            <div className="font-semibold text-sm" style={{ color: 'var(--success)' }}>Payment detected!</div>
            {incomingTxHash && (
              <a
                href={`${ARC_EXPLORER_BASE}/tx/${incomingTxHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs"
                style={{ color: 'var(--accent)' }}
              >
                View on Arc Explorer <ExternalLink size={10} />
              </a>
            )}
          </div>
        )}

        {/* Receipt email */}
        <div className="space-y-1.5">
          <div className="text-xs font-medium" style={{ color: 'var(--muted)' }}>Send receipt (optional)</div>
          <div className="flex gap-2">
            <input
              type="email"
              value={receiptEmail}
              onChange={e => setReceiptEmail(e.target.value)}
              placeholder="customer@email.com"
              className="flex-1 rounded-xl px-3 py-2 text-sm outline-none"
              style={{
                background: 'var(--surface-muted)',
                border: '1px solid var(--border)',
                color: 'var(--ink)',
              }}
            />
            {emailSent ? (
              <div className="px-3 py-2 rounded-xl flex items-center" style={{ background: 'rgba(22,163,74,0.1)', color: 'var(--success)' }}>
                <CheckCircle size={16} />
              </div>
            ) : emailSending ? (
              <div className="px-3 py-2 rounded-xl flex items-center" style={{ background: 'var(--surface-muted)', color: 'var(--muted)' }}>
                <Loader2 size={16} className="animate-spin" />
              </div>
            ) : null}
          </div>
        </div>

        {/* Manual confirm — address mode only */}
        {qrMode === 'address' && (
          <button
            onClick={handleManualPaid}
            className="w-full py-2.5 rounded-xl text-sm font-medium transition-colors"
            style={{ background: 'var(--surface-muted)', color: 'var(--muted)', border: '1px solid var(--border)' }}
          >
            Mark as paid manually
          </button>
        )}
      </motion.div>
    </motion.div>
  )
}
