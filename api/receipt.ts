import type { VercelRequest, VercelResponse } from '@vercel/node'
import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

interface ReceiptPayload {
  email: string
  invoiceId: string
  txHash: string
  amount: number
  fee: number
  net: number
  tax: number
  timestamp: number
  explorerBase: string
}

function buildHtml(r: ReceiptPayload): string {
  const date = new Date(r.timestamp).toLocaleString('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
  const txUrl = `${r.explorerBase}/tx/${r.txHash}`
  const hasRealHash = r.txHash && r.txHash !== 'qr-payment'

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>ArcPay Receipt</title>
</head>
<body style="margin:0;padding:0;background:#f4f6f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f9;padding:40px 16px;">
  <tr><td align="center">
    <table width="100%" style="max-width:480px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">
      <tr>
        <td style="background:#122d45;padding:32px 32px 24px;text-align:center;">
          <div style="display:inline-block;background:rgba(255,255,255,0.15);border-radius:12px;padding:10px 18px;">
            <span style="color:#ffffff;font-size:18px;font-weight:700;letter-spacing:-0.5px;">ArcPay Global POS</span>
          </div>
          <div style="color:rgba(255,255,255,0.7);font-size:13px;margin-top:10px;">Payment Receipt</div>
        </td>
      </tr>
      <tr>
        <td style="padding:28px 32px 0;text-align:center;">
          <div style="display:inline-flex;align-items:center;gap:8px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:999px;padding:8px 20px;">
            <span style="color:#16a34a;font-size:16px;">✓</span>
            <span style="color:#16a34a;font-size:14px;font-weight:600;">Payment Confirmed</span>
          </div>
        </td>
      </tr>
      <tr>
        <td style="padding:20px 32px 0;text-align:center;">
          <div style="font-size:44px;font-weight:800;color:#122d45;letter-spacing:-2px;font-variant-numeric:tabular-nums;">
            $${r.amount.toFixed(2)}
          </div>
          <div style="color:#6b7280;font-size:14px;margin-top:4px;">USDC · Arc Network</div>
        </td>
      </tr>
      <tr>
        <td style="padding:24px 32px 0;">
          <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;">
            ${[
              ['Invoice', `${r.invoiceId.slice(0, 10)}…`],
              ['Date', date],
              ['Platform fee (0.5%)', `$${r.fee.toFixed(4)} USDC`],
              ['Tax reserve', `$${r.tax.toFixed(4)} USDC`],
              ['Net revenue', `$${r.net.toFixed(2)} USDC`],
            ].map(([label, value], i) => `
            <tr style="background:${i % 2 === 0 ? '#f9fafb' : '#ffffff'};">
              <td style="padding:11px 16px;font-size:13px;color:#6b7280;">${label}</td>
              <td style="padding:11px 16px;font-size:13px;color:#111827;font-weight:600;text-align:right;font-variant-numeric:tabular-nums;">${value}</td>
            </tr>`).join('')}
          </table>
        </td>
      </tr>
      ${hasRealHash ? `
      <tr>
        <td style="padding:20px 32px 0;text-align:center;">
          <a href="${txUrl}" style="display:inline-block;background:#122d45;color:#ffffff;font-size:13px;font-weight:600;padding:12px 28px;border-radius:10px;text-decoration:none;">
            View on Arc Explorer →
          </a>
        </td>
      </tr>` : `
      <tr>
        <td style="padding:20px 32px 0;text-align:center;">
          <span style="display:inline-block;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:10px 20px;font-size:13px;color:#16a34a;font-weight:600;">
            ✓ Paid via QR wallet transfer
          </span>
        </td>
      </tr>`}
      <tr>
        <td style="padding:16px 32px 0;text-align:center;">
          <span style="display:inline-block;background:#eff6ff;border:1px solid #bfdbfe;border-radius:999px;padding:5px 14px;font-size:12px;color:#1d4ed8;">
            ⚡ Zero gas charged · Powered by Arc USDC
          </span>
        </td>
      </tr>
      <tr>
        <td style="padding:28px 32px 32px;text-align:center;border-top:1px solid #f3f4f6;margin-top:20px;">
          <div style="color:#9ca3af;font-size:12px;line-height:1.6;">
            This receipt was generated automatically by ArcPay Global POS.<br/>
            ${hasRealHash
              ? `Transaction hash: <span style="font-family:monospace;font-size:11px;">${r.txHash.slice(0, 18)}…</span>`
              : `Payment method: <span style="font-size:11px;">QR wallet transfer</span>`
            }
          </div>
        </td>
      </tr>
    </table>
  </td></tr>
</table>
</body>
</html>`
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Handle CORS preflight
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const payload = req.body as ReceiptPayload

  if (!payload?.email) return res.status(400).json({ error: 'Missing email' })
  if (!process.env.RESEND_API_KEY) return res.status(500).json({ error: 'RESEND_API_KEY not configured' })

  try {
    const { error } = await resend.emails.send({
      from: 'ArcPay Global POS <receipts@resend.dev>',
      to: [payload.email],
      subject: `Receipt — $${payload.amount.toFixed(2)} USDC payment confirmed`,
      html: buildHtml(payload),
    })
    if (error) throw new Error(error.message)
    res.status(200).json({ ok: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ error: message })
  }
}
