import { sendReceipt, type ReceiptPayload } from './receipt'

const PORT = 3001

const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url)

    // CORS preflight
    if (req.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      })
    }

    if (req.method === 'POST' && url.pathname === '/receipt') {
      try {
        const body = await req.json() as ReceiptPayload

        if (!body.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)) {
          return json({ error: 'Invalid email address' }, 400)
        }
        if (!body.txHash || !body.invoiceId) {
          return json({ error: 'Missing required fields' }, 400)
        }

        await sendReceipt(body)
        return json({ ok: true })
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to send receipt'
        console.error('[receipt]', msg)
        return json({ error: msg }, 500)
      }
    }

    if (url.pathname === '/health') {
      return json({ ok: true })
    }

    return json({ error: 'Not found' }, 404)
  },
})

console.log(`Receipt server running on http://localhost:${server.port}`)

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  })
}
