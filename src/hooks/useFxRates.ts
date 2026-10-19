import { useEffect, useRef, useState } from 'react'

export type FxRates = Record<string, number>

// Fallback rates used when the live fetch fails or before the first fetch completes
const FALLBACK_RATES: FxRates = {
  USD: 1,
  EUR: 0.92,
  NGN: 1650,
  ARS: 980,
  GBP: 0.79,
}

// Currencies the POS displays — fetched from the API, others ignored
const TRACKED = Object.keys(FALLBACK_RATES)

export type RateStatus = 'loading' | 'live' | 'stale' | 'offline'

interface UseFxRatesResult {
  rates: FxRates
  status: RateStatus
  updatedAt: Date | null
  refresh: () => void
}

const POLL_INTERVAL_MS = 60_000   // re-fetch every 60 seconds
const STALE_AFTER_MS   = 5 * 60_000  // mark stale if last update >5 min ago

// open.er-api.com: free, no key, updates every 24 h, base = USD
const API_URL = 'https://open.er-api.com/v6/latest/USD'

async function fetchRates(): Promise<FxRates> {
  const res = await fetch(API_URL, { signal: AbortSignal.timeout(8_000) })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const json = await res.json() as { result: string; rates: Record<string, number> }
  if (json.result !== 'success') throw new Error('API error')
  const out: FxRates = { USD: 1 }
  for (const sym of TRACKED) {
    if (sym === 'USD') continue
    if (typeof json.rates[sym] === 'number') out[sym] = json.rates[sym]
    else out[sym] = FALLBACK_RATES[sym]   // symbol missing — keep fallback
  }
  return out
}

export function useFxRates(): UseFxRatesResult {
  const [rates, setRates] = useState<FxRates>(FALLBACK_RATES)
  const [status, setStatus] = useState<RateStatus>('loading')
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const staleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const mountedRef = useRef(true)

  const doFetch = () => {
    fetchRates()
      .then(r => {
        if (!mountedRef.current) return
        setRates(r)
        setStatus('live')
        const now = new Date()
        setUpdatedAt(now)
        // Schedule stale transition
        if (staleTimerRef.current) clearTimeout(staleTimerRef.current)
        staleTimerRef.current = setTimeout(() => {
          if (mountedRef.current) setStatus('stale')
        }, STALE_AFTER_MS)
      })
      .catch(() => {
        if (!mountedRef.current) return
        // Keep last known rates; mark offline if we have never fetched, else stale
        setStatus(prev => prev === 'loading' ? 'offline' : 'stale')
      })
  }

  useEffect(() => {
    mountedRef.current = true
    doFetch()
    timerRef.current = setInterval(doFetch, POLL_INTERVAL_MS)
    return () => {
      mountedRef.current = false
      if (timerRef.current) clearInterval(timerRef.current)
      if (staleTimerRef.current) clearTimeout(staleTimerRef.current)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return { rates, status, updatedAt, refresh: doFetch }
}
