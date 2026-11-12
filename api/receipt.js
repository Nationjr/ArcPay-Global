import nodemailer from 'nodemailer'

function getTransporter() {
  const user = process.env.GMAIL_USER
  const pass = process.env.GMAIL_APP_PASSWORD
  if (!user || !pass) throw new Error('Email service not configured')
  return nodemailer.createTransport({
    service: 'gmail',
    auth: { user, pass },
  })
}

// In-memory rate limiter — 5 requests per IP per minute
const rateLimitMap = new Map()

function isRateLimited(ip) {
  const now = Date.now()
  const windowMs = 60_000
  const maxRequests = 5
  const entry = rateLimitMap.get(ip) ?? { count: 0, resetAt: now + windowMs }
  if (now > entry.resetAt) {
    entry.count = 0
    entry.resetAt = now + windowMs
  }
  entry.count++
  rateLimitMap.set(ip, entry)
  // Evict old entries every 500 calls to prevent memory growth
  if (rateLimitMap.size > 500) {
    for (const [k, v] of rateLimitMap) {
      if (now > v.resetAt) rateLimitMap.delete(k)
    }
  }
  return entry.count > maxRequests
}

function sanitize(str, maxLen = 256) {
  if (typeof str !== 'string') return ''
  return str.slice(0, maxLen).replace(/[<>"'`]/g, '')
}

function isValidEmail(email) {
  return typeof email === 'string' &&
    email.length <= 254 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)
}

function isValidTxHash(hash) {
  return typeof hash === 'string' && (hash === '' || /^0x[0-9a-fA-F]{64}$/.test(hash))
}

export default async function handler(req, res) {
  // Security headers
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')

  // CORS — restrict to your own domain in production
  const allowedOrigins = [
    'https://arc-pay-global.vercel.app',
    'https://arc-studio-aaf0a5eb8fa74de79967d7b1.vercel.app',
    'http://localhost:5173',
  ]
  const origin = req.headers['origin'] ?? ''
  if (allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin)
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  res.setHeader('Vary', 'Origin')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  // Rate limiting
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() ?? req.socket?.remoteAddress ?? 'unknown'
  if (isRateLimited(ip)) {
    return res.status(429).json({ error: 'Too many requests — try again in a minute' })
  }

  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
    return res.status(500).json({ error: 'Email service not configured' })
  }

  // Strict input validation
  const body = req.body ?? {}
  if (!isValidEmail(body.email)) {
    return res.status(400).json({ error: 'Invalid email address' })
  }
  if (body.txHash !== undefined && !isValidTxHash(body.txHash)) {
    return res.status(400).json({ error: 'Invalid transaction hash' })
  }
  // Refund receipt: sent to the customer after a (partial) refund is confirmed
  if (body.type === 'refund') {
    const refundAmount = Number(body.refundAmount)
    const originalAmount = Number(body.originalAmount)
    const remaining = Number(body.remaining)
    const valid = [refundAmount, originalAmount, remaining].every(Number.isFinite) &&
      refundAmount > 0 && refundAmount <= 1_000_000 &&
      originalAmount > 0 && originalAmount <= 1_000_000 &&
      remaining >= 0 && remaining <= originalAmount
    if (!valid) return res.status(400).json({ error: 'Invalid refund amounts' })
    const refundTime = typeof body.timestamp === 'number' ? body.timestamp : Date.now()
    try {
      const transporter = getTransporter()
      await transporter.sendMail({
        from: `ArcPay Global POS <${process.env.GMAIL_USER}>`,
        to: sanitize(body.email, 254),
        subject: `Refund receipt: $${refundAmount.toFixed(2)} USDC refunded`,
        html: buildRefundHtml({
          txHash: sanitize(body.txHash ?? '', 66),
          refundAmount,
          originalAmount,
          remaining,
          items: sanitize(body.items ?? '', 140),
          timestamp: refundTime,
          explorerBase: safeExplorer(body.explorerBase),
        }),
      })
      return res.status(200).json({ ok: true })
    } catch (err) {
      return res.status(500).json({ error: err.message ?? 'Unknown error' })
    }
  }

  const amount = Number(body.amount)
  const fee = Number(body.fee)
  const net = Number(body.net)
  if (!isFinite(amount) || amount < 0 || amount > 1_000_000) {
    return res.status(400).json({ error: 'Invalid amount' })
  }
  if (!isFinite(fee) || !isFinite(net)) {
    return res.status(400).json({ error: 'Invalid fee or net amount' })
  }

  const email = sanitize(body.email, 254)
  const txHash = sanitize(body.txHash ?? '', 66)
  const explorerBase = safeExplorer(body.explorerBase)
  const invoiceId = sanitize(body.invoiceId ?? '', 66)
  const timestamp = typeof body.timestamp === 'number' ? body.timestamp : Date.now()

  try {
    const transporter = getTransporter()
    await transporter.sendMail({
      from: `ArcPay Global POS <${process.env.GMAIL_USER}>`,
      to: email,
      subject: `Receipt — $${amount.toFixed(2)} USDC payment confirmed`,
      html: buildHtml({ email, invoiceId, txHash, amount, fee, net, timestamp, explorerBase }),
    })
    res.status(200).json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: err.message ?? 'Unknown error' })
  }
}

function buildHtml({ invoiceId, txHash, amount, fee, net, timestamp, explorerBase }) {
  const date = new Date(timestamp).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })
  const hasRealHash = txHash && txHash !== 'qr-payment' && txHash !== '' && /^0x[0-9a-fA-F]{64}$/.test(txHash)
  const txUrl = hasRealHash ? `${explorerBase}/tx/${txHash}` : ''

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/><title>ArcPay Receipt</title></head>
<body style="margin:0;padding:0;background:#f4f6f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f9;padding:40px 16px;">
  <tr><td align="center">
    <table width="100%" style="max-width:480px;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">
      <tr><td style="background:#122d45;padding:32px 32px 24px;text-align:center;">
        <div style="display:inline-block;background:rgba(255,255,255,0.15);border-radius:12px;padding:10px 18px;">
          <span style="color:#fff;font-size:18px;font-weight:700;">ArcPay Global POS</span>
        </div>
        <div style="color:rgba(255,255,255,0.7);font-size:13px;margin-top:10px;">Payment Receipt</div>
      </td></tr>
      <tr><td style="padding:28px 32px 0;text-align:center;">
        <div style="display:inline-flex;align-items:center;gap:8px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:999px;padding:8px 20px;">
          <span style="color:#16a34a;font-size:16px;">&#10003;</span>
          <span style="color:#16a34a;font-size:14px;font-weight:600;">Payment Confirmed</span>
        </div>
      </td></tr>
      <tr><td style="padding:20px 32px 0;text-align:center;">
        <div style="font-size:44px;font-weight:800;color:#122d45;letter-spacing:-2px;">$${amount.toFixed(2)}</div>
        <div style="color:#6b7280;font-size:14px;margin-top:4px;">USDC &middot; Arc Network</div>
      </td></tr>
      <tr><td style="padding:24px 32px 0;">
        <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;">
          <tr style="background:#f9fafb;"><td style="padding:11px 16px;font-size:13px;color:#6b7280;">Date</td><td style="padding:11px 16px;font-size:13px;color:#111827;font-weight:600;text-align:right;">${date}</td></tr>
          <tr style="background:#fff;"><td style="padding:11px 16px;font-size:13px;color:#6b7280;">Amount</td><td style="padding:11px 16px;font-size:13px;color:#111827;font-weight:600;text-align:right;">$${amount.toFixed(2)} USDC</td></tr>
          <tr style="background:#f9fafb;"><td style="padding:11px 16px;font-size:13px;color:#6b7280;">Platform fee (0.5%)</td><td style="padding:11px 16px;font-size:13px;color:#111827;font-weight:600;text-align:right;">$${fee.toFixed(4)} USDC</td></tr>
          <tr style="background:#fff;"><td style="padding:11px 16px;font-size:13px;color:#6b7280;">Net revenue</td><td style="padding:11px 16px;font-size:13px;color:#111827;font-weight:600;text-align:right;">$${net.toFixed(2)} USDC</td></tr>
        </table>
      </td></tr>
      <tr><td style="padding:20px 32px 0;text-align:center;">
        ${hasRealHash
          ? `<a href="${txUrl}" style="display:inline-block;background:#122d45;color:#fff;font-size:13px;font-weight:600;padding:12px 28px;border-radius:10px;text-decoration:none;">View on Arc Explorer &#8594;</a>`
          : `<span style="display:inline-block;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:10px 20px;font-size:13px;color:#16a34a;font-weight:600;">&#10003; Paid via QR wallet transfer</span>`
        }
      </td></tr>
      <tr><td style="padding:16px 32px 0;text-align:center;">
        <span style="display:inline-block;background:#eff6ff;border:1px solid #bfdbfe;border-radius:999px;padding:5px 14px;font-size:12px;color:#1d4ed8;">&#9889; Zero gas charged &middot; Powered by Arc USDC</span>
      </td></tr>
      <tr><td style="padding:28px 32px 32px;text-align:center;border-top:1px solid #f3f4f6;margin-top:20px;">
        <div style="color:#9ca3af;font-size:12px;line-height:1.6;">
          This receipt was generated automatically by ArcPay Global POS.<br/>
          ${hasRealHash ? `Tx: <span style="font-family:monospace;font-size:11px;">${txHash.slice(0,18)}&#8230;</span>` : 'Payment method: QR wallet transfer'}
        </div>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`
}

// Only these explorer bases may appear as links in emails
const ALLOWED_EXPLORERS = ['https://explorer.arc.io', 'https://explorer.testnet.arc.io']
function safeExplorer(value) {
  return ALLOWED_EXPLORERS.includes(value) ? value : 'https://explorer.arc.io'
}

function buildRefundHtml({ txHash, refundAmount, originalAmount, remaining, items, timestamp, explorerBase }) {
  const date = new Date(timestamp).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })
  const hasRealHash = /^0x[0-9a-fA-F]{64}$/.test(txHash)
  const txUrl = hasRealHash ? `${explorerBase}/tx/${txHash}` : ''
  const totalRefunded = originalAmount - remaining
  const row = (label, value, bg) =>
    `<tr style="background:${bg};"><td style="padding:11px 16px;font-size:13px;color:#6b7280;">${label}</td><td style="padding:11px 16px;font-size:13px;color:#111827;font-weight:600;text-align:right;">${value}</td></tr>`

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/><title>ArcPay Refund Receipt</title></head>
<body style="margin:0;padding:0;background:#f4f6f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f9;padding:40px 16px;">
  <tr><td align="center">
    <table width="100%" style="max-width:480px;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">
      <tr><td style="background:#122d45;padding:32px 32px 24px;text-align:center;">
        <div style="display:inline-block;background:rgba(255,255,255,0.15);border-radius:12px;padding:10px 18px;">
          <span style="color:#fff;font-size:18px;font-weight:700;">ArcPay Global POS</span>
        </div>
        <div style="color:rgba(255,255,255,0.7);font-size:13px;margin-top:10px;">Refund Receipt</div>
      </td></tr>
      <tr><td style="padding:28px 32px 0;text-align:center;">
        <div style="display:inline-block;background:#eff6ff;border:1px solid #bfdbfe;border-radius:999px;padding:8px 20px;">
          <span style="color:#1d4ed8;font-size:14px;font-weight:600;">&#8617; Refund Sent</span>
        </div>
      </td></tr>
      <tr><td style="padding:20px 32px 0;text-align:center;">
        <div style="font-size:44px;font-weight:800;color:#122d45;letter-spacing:-2px;">$${refundAmount.toFixed(2)}</div>
        <div style="color:#6b7280;font-size:14px;margin-top:4px;">USDC refunded to your wallet &middot; Arc Network</div>
      </td></tr>
      <tr><td style="padding:24px 32px 0;">
        <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;">
          ${row('Date', date, '#f9fafb')}
          ${items ? row('Items / reason', items, '#fff') : ''}
          ${row('Original payment', `$${originalAmount.toFixed(2)} USDC`, items ? '#f9fafb' : '#fff')}
          ${row('This refund', `$${refundAmount.toFixed(2)} USDC`, items ? '#fff' : '#f9fafb')}
          ${row('Total refunded so far', `$${totalRefunded.toFixed(2)} USDC`, items ? '#f9fafb' : '#fff')}
          ${row('Left on original payment', `$${remaining.toFixed(2)} USDC`, items ? '#fff' : '#f9fafb')}
        </table>
      </td></tr>
      <tr><td style="padding:20px 32px 0;text-align:center;">
        ${hasRealHash
          ? `<a href="${txUrl}" style="display:inline-block;background:#122d45;color:#fff;font-size:13px;font-weight:600;padding:12px 28px;border-radius:10px;text-decoration:none;">View refund on Arc Explorer &#8594;</a>`
          : ''}
      </td></tr>
      <tr><td style="padding:28px 32px 32px;text-align:center;border-top:1px solid #f3f4f6;">
        <div style="color:#9ca3af;font-size:12px;line-height:1.6;">
          This refund receipt was generated automatically by ArcPay Global POS.<br/>
          ${hasRealHash ? `Tx: <span style="font-family:monospace;font-size:11px;">${txHash.slice(0,18)}&#8230;</span>` : ''}
        </div>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`
}
