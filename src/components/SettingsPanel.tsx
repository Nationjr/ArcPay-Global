import React, { useState } from 'react'
import { ArrowLeft, Save, Zap } from 'lucide-react'
import { toast } from 'sonner'

interface Settings {
  supplierAddress: string
  supplierBps: number
  taxBps: number
  yieldEnabled: boolean
  merchantFeeRecipient: string
}

interface Props {
  settings: Settings
  onSave: (s: Settings) => void
  onBack: () => void
}

export function SettingsPanel({ settings, onSave, onBack }: Props) {
  const [local, setLocal] = useState<Settings>(settings)
  const netShare = 10000 - 50 - local.supplierBps - local.taxBps

  const handleSave = () => {
    if (local.supplierBps + local.taxBps > 9950) {
      toast.error('Split shares exceed 99.5% — leave room for platform fee and net revenue')
      return
    }
    onSave(local)
    toast.success('Settings saved')
    onBack()
  }

  return (
    <div className="flex flex-col gap-5 w-full max-w-sm mx-auto pb-6">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="p-2 rounded-xl hover:bg-[var(--surface-muted)] transition-colors" style={{ color: 'var(--muted)' }}>
          <ArrowLeft size={18} />
        </button>
        <div>
          <div className="display font-bold text-xl" style={{ color: 'var(--ink)' }}>Settings</div>
          <div className="text-xs" style={{ color: 'var(--muted)' }}>Configure your POS</div>
        </div>
      </div>

      {/* Fee recipient */}
      <div className="rounded-2xl p-5 space-y-3" style={{ background: 'var(--surface-strong)', border: '1px solid var(--border)' }}>
        <div>
          <div className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>Your Fee Recipient</div>
          <div className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>Receives your 40% share of the 0.5% platform fee. Defaults to your connected wallet.</div>
        </div>
        <input
          type="text"
          value={local.merchantFeeRecipient}
          onChange={e => setLocal(p => ({ ...p, merchantFeeRecipient: e.target.value }))}
          placeholder="0x... leave blank to use your wallet"
          className="w-full px-4 py-3 rounded-xl text-sm outline-none transition-colors mono"
          style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)', color: 'var(--ink)' }}
        />
      </div>

      {/* Supplier */}
      <div className="rounded-2xl p-5 space-y-3" style={{ background: 'var(--surface-strong)', border: '1px solid var(--border)' }}>
        <div className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>Supplier Wallet</div>
        <input
          type="text"
          value={local.supplierAddress}
          onChange={e => setLocal(p => ({ ...p, supplierAddress: e.target.value }))}
          placeholder="0x... supplier wallet address"
          className="w-full px-4 py-3 rounded-xl text-sm outline-none transition-colors mono"
          style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)', color: 'var(--ink)' }}
        />
      </div>

      {/* Split config */}
      <div className="rounded-2xl p-5 space-y-4" style={{ background: 'var(--surface-strong)', border: '1px solid var(--border)' }}>
        <div className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>Payment Split</div>

        <div className="space-y-1">
          <div className="flex justify-between text-xs" style={{ color: 'var(--muted)' }}>
            <span>Supplier share</span>
            <span className="tabular-nums">{(local.supplierBps / 100).toFixed(0)}%</span>
          </div>
          <input type="range" min="0" max="9000" step="100" value={local.supplierBps}
            onChange={e => setLocal(p => ({ ...p, supplierBps: +e.target.value }))}
            className="w-full" style={{ accentColor: 'var(--accent)' }} />
        </div>

        <div className="space-y-1">
          <div className="flex justify-between text-xs" style={{ color: 'var(--muted)' }}>
            <span>Tax reserve</span>
            <span className="tabular-nums">{(local.taxBps / 100).toFixed(0)}%</span>
          </div>
          <input type="range" min="0" max="5000" step="100" value={local.taxBps}
            onChange={e => setLocal(p => ({ ...p, taxBps: +e.target.value }))}
            className="w-full" style={{ accentColor: 'var(--accent)' }} />
        </div>

        {/* Visual split bar */}
        <div className="rounded-xl overflow-hidden flex h-5" style={{ border: '1px solid var(--border)' }}>
          {[
            { pct: 0.5, color: '#ba2b4c', label: 'Fee' },
            { pct: local.supplierBps / 100, color: '#1061a6', label: 'Supplier' },
            { pct: local.taxBps / 100, color: '#e8960d', label: 'Tax' },
            { pct: Math.max(0, netShare / 100), color: '#1a8047', label: 'Net' },
          ].map(({ pct, color, label }) => (
            <div key={label} style={{ width: `${pct}%`, background: color, minWidth: pct > 0 ? 2 : 0 }}
              title={`${label}: ${pct.toFixed(1)}%`} />
          ))}
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs" style={{ color: 'var(--muted)' }}>
          {[
            { dot: '#ba2b4c', label: 'Platform fee', val: '0.5%' },
            { dot: '#1061a6', label: 'Supplier', val: `${(local.supplierBps/100).toFixed(0)}%` },
            { dot: '#e8960d', label: 'Tax reserve', val: `${(local.taxBps/100).toFixed(0)}%` },
            { dot: '#1a8047', label: 'Your net', val: `${(netShare/100).toFixed(1)}%` },
          ].map(({ dot, label, val }) => (
            <div key={label} className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: dot }} />
              <span>{label}: <strong>{val}</strong></span>
            </div>
          ))}
        </div>
      </div>

      {/* Yield */}
      <div className="rounded-2xl p-5" style={{ background: 'var(--surface-strong)', border: '1px solid var(--border)' }}>
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold" style={{ color: 'var(--ink)' }}>
              <Zap size={14} className="text-amber-500" />
              EOD Yield Sweep (USYC)
            </div>
            <div className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>Auto-sweep idle balance to USYC vault at 11:59 PM</div>
          </div>
          <button
            onClick={() => setLocal(p => ({ ...p, yieldEnabled: !p.yieldEnabled }))}
            className={`w-10 h-6 rounded-full transition-colors flex items-center px-0.5 ${local.yieldEnabled ? 'bg-[var(--accent)]' : 'bg-gray-200'}`}
          >
            <div className={`w-5 h-5 rounded-full bg-white shadow transition-transform ${local.yieldEnabled ? 'translate-x-4' : 'translate-x-0'}`} />
          </button>
        </div>
      </div>

      <button onClick={handleSave}
        className="w-full py-4 rounded-2xl text-white font-semibold flex items-center justify-center gap-2 transition-colors"
        style={{ background: 'var(--accent)' }}>
        <Save size={18} /> Save Settings
      </button>
    </div>
  )
}
