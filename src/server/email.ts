/**
 * PaySwap receipt emails (Resend).
 *
 * Fire-and-forget notifications sent when a checkout gate settles. Strictly
 * non-blocking and non-fatal: if RESEND_API_KEY is missing, no recipient is
 * configured, or the API call fails, the settlement flow is untouched and the
 * outcome is only logged. Configure the destination via PAYSWAP_RECEIPT_EMAIL
 * (or the settings store key 'receiptEmail').
 */
const RESEND_API = 'https://api.resend.com/emails'

export interface ReceiptEmailInput {
  ref: string
  rail: string
  amount: number
  currency: string
  fee: number
  merchant: string
  url?: string
}

export type EmailOutcome =
  | { sent: false; reason: 'not-configured' | 'no-recipient' | 'api-error'; detail?: string }
  | { sent: true; id: string }

export function receiptEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY)
}

async function resolveRecipient(): Promise<string | null> {
  if (process.env.PAYSWAP_RECEIPT_EMAIL) return process.env.PAYSWAP_RECEIPT_EMAIL
  try {
    const { readSettings } = await import('@/server/finance')
    const settings = await readSettings()
    const value = (settings as unknown as Record<string, unknown>).receiptEmail
    return typeof value === 'string' && value.includes('@') ? value : null
  } catch {
    return null
  }
}

export async function sendReceiptEmail(input: ReceiptEmailInput): Promise<EmailOutcome> {
  if (!receiptEmailConfigured()) return { sent: false, reason: 'not-configured' }
  const to = await resolveRecipient()
  if (!to) return { sent: false, reason: 'no-recipient' }

  const money = (n: number) => `${input.currency} ${n.toFixed(2)}`
  const html = `
    <div style="font-family:ui-sans-serif,system-ui,sans-serif;max-width:520px;margin:0 auto;color:#0b2b3d">
      <h2 style="margin:0 0 4px">Payment settled</h2>
      <p style="margin:0 0 16px;color:#5c7482">Reference <strong>${input.ref}</strong></p>
      <table style="width:100%;border-collapse:collapse;font-size:14px">
        <tr><td style="padding:6px 0;color:#5c7482">Merchant</td><td style="text-align:right;font-weight:600">${input.merchant}</td></tr>
        <tr><td style="padding:6px 0;color:#5c7482">Rail</td><td style="text-align:right;font-weight:600">${input.rail}</td></tr>
        <tr><td style="padding:6px 0;color:#5c7482">Amount</td><td style="text-align:right;font-weight:600">${money(input.amount)}</td></tr>
        <tr><td style="padding:6px 0;color:#5c7482">Fee</td><td style="text-align:right;font-weight:600">${money(input.fee)}</td></tr>
      </table>
      ${input.url ? `<p style="margin-top:16px"><a href="${input.url}" style="color:#0b8b6c">Open the receipt in PaySwap</a></p>` : ''}
      <p style="margin-top:24px;font-size:12px;color:#8aa0ad">Sandbox simulation — no real funds moved.</p>
    </div>`

  try {
    const res = await fetch(RESEND_API, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'PaySwap <onboarding@resend.dev>',
        to: [to],
        subject: `Payment settled — ${input.ref} · ${money(input.amount)}`,
        html,
      }),
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) {
      const detail = await res.text()
      console.warn(`[email] resend rejected receipt for ${input.ref}: ${res.status} ${detail.slice(0, 200)}`)
      return { sent: false, reason: 'api-error', detail: detail.slice(0, 200) }
    }
    const data = (await res.json()) as { id?: string }
    console.log(`[email] receipt ${input.ref} sent to ${to} (id=${data.id ?? '?'})`)
    return { sent: true, id: data.id ?? '' }
  } catch (error) {
    console.warn(`[email] receipt send failed for ${input.ref}: ${error instanceof Error ? error.message : String(error)}`)
    return { sent: false, reason: 'api-error', detail: String(error).slice(0, 200) }
  }
}
