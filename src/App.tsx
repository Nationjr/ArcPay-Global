import { useState, useEffect } from 'react'
import { ConnectKitButton } from 'connectkit'
import { motion, AnimatePresence } from 'framer-motion'
import { SplashScreen } from './components/SplashScreen'
import { ShoppingBag, BarChart2 } from 'lucide-react'
import { TokenUSDC } from '@web3icons/react'
import { POSKeypad } from './components/POSKeypad'
import { SettingsPanel } from './components/SettingsPanel'
import { AnalyticsTab } from './components/AnalyticsTab'

// Contract wiring
import arcPayArtifact from '../contracts/out/ArcPayCore.sol/ArcPayCore.json'
const CONTRACT_ADDRESS = '0x31d5428d1981332db5ccc47f54db86b45e86bc15' as `0x${string}`
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const CONTRACT_ABI = arcPayArtifact.abi as any[]

const SETTINGS_KEY = 'arcpay_settings'

interface AppSettings {
  supplierAddress: string
  supplierBps: number
  taxBps: number
  yieldEnabled: boolean
}

const defaultSettings: AppSettings = {
  supplierAddress: '',
  supplierBps: 7000,
  taxBps: 1000,
  yieldEnabled: false,
}

type Tab = 'pos' | 'analytics'
type View = 'main' | 'settings'

export default function App() {
  const [splash, setSplash] = useState(true)
  const [tab, setTab] = useState<Tab>('pos')
  const [view, setView] = useState<View>('main')

  useEffect(() => {
    const t = setTimeout(() => setSplash(false), 2500)
    return () => clearTimeout(t)
  }, [])
  const [settings, setSettings] = useState<AppSettings>(() => {
    try {
      return { ...defaultSettings, ...(JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}') as AppSettings) }
    } catch { return defaultSettings }
  })

  const saveSettings = (s: AppSettings) => {
    setSettings(s)
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s))
  }

  return (
    <>
    <AnimatePresence>
      {splash && <SplashScreen key="splash" />}
    </AnimatePresence>
    <div className="min-h-dvh flex flex-col" style={{ background: 'var(--bg-gradient)' }}>
      {/* Header */}
      <header className="sticky top-0 z-20 px-4 py-3 flex items-center justify-between" style={{ background: 'var(--surface-strong)', borderBottom: '1px solid var(--border)', backdropFilter: 'blur(12px)' }}>
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'var(--accent)' }}>
            <TokenUSDC variant="mono" size={16} className="brightness-[100]" style={{ filter: 'invert(1)' }} />
          </div>
          <span className="display font-bold text-sm tracking-tight" style={{ color: 'var(--ink)' }}>ArcPay Global POS</span>
        </div>
        <ConnectKitButton />
      </header>

      {/* Content */}
      <main className="flex-1 px-4 pt-5">
        <AnimatePresence mode="wait">
          {view === 'settings' ? (
            <motion.div key="settings" initial={{ x: 40, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: -40, opacity: 0 }} transition={{ duration: 0.2 }}>
              <SettingsPanel settings={settings} onSave={saveSettings} onBack={() => setView('main')} />
            </motion.div>
          ) : tab === 'pos' ? (
            <motion.div key="pos" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
              <POSKeypad
                contractAddress={CONTRACT_ADDRESS}
                contractAbi={CONTRACT_ABI}
                supplierAddress={settings.supplierAddress}
                taxBps={settings.taxBps}
                supplierBps={settings.supplierBps}
                onNavigateSettings={() => setView('settings')}
              />
            </motion.div>
          ) : (
            <motion.div key="analytics" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
              <AnalyticsTab contractAddress={CONTRACT_ADDRESS} contractAbi={CONTRACT_ABI} />
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Bottom nav */}
      {view === 'main' && (
        <nav className="sticky bottom-0 flex items-center px-6 py-3 gap-2 z-10" style={{ background: 'var(--surface-strong)', borderTop: '1px solid var(--border)', backdropFilter: 'blur(12px)' }}>
          {([
            { id: 'pos', icon: ShoppingBag, label: 'POS' },
            { id: 'analytics', icon: BarChart2, label: 'Analytics' },
          ] as const).map(({ id, icon: Icon, label }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className="flex-1 flex flex-col items-center gap-1 py-2 rounded-xl transition-colors text-xs font-medium"
              style={{
                color: tab === id ? 'var(--accent)' : 'var(--muted)',
                background: tab === id ? 'rgba(18,45,69,0.07)' : 'transparent',
              }}
            >
              <Icon size={20} />
              {label}
            </button>
          ))}
        </nav>
      )}
    </div>
    </>
  )
}
