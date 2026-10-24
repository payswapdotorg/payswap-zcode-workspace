'use client'

import { useState } from 'react'
import { Check, Copy, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { formatMoney } from '@/lib/paydata'
import { C, Money, SectionLabel, StatusPill } from './bits'

interface CheckoutViewProps {
  environment: 'sandbox' | 'live'
}

interface PayReceiptLedgerEntry {
  id: string
  kind: string
  status: string
  ref: string
}

interface PayReceipt {
  id: string
  amount: number
  currency: string
  method: string
  status: string
  note: string
  ledger: PayReceiptLedgerEntry[]
}

const METHODS = [
  { id: 'card', label: 'Card', sub: 'visa •••• 4242' },
  { id: 'apple_pay', label: 'Apple Pay', sub: 'wallet · device token' },
  { id: 'mpesa', label: 'M-Pesa', sub: 'stk push · shortcode 4123890' },
  { id: 'usdc_base', label: 'USDC on Base', sub: 'usdc · base mainnet' },
] as const

type MethodId = (typeof METHODS)[number]['id']

interface PayLink {
  id: string
  memo: string
  amount: number
  currency: string
  status: 'paid' | 'awaiting payment'
  ago: string
}

const SEED_LINKS: PayLink[] = [
  {
    id: 'plink_9f2',
    memo: 'Kwame Motors · Invoice #INV-2479',
    amount: 1250,
    currency: 'USD',
    status: 'paid',
    ago: '2h ago',
  },
  {
    id: 'plink_8c4',
    memo: 'Naa Adjei · retainer',
    amount: 4800,
    currency: 'GHS',
    status: 'awaiting payment',
    ago: 'sent 1d ago',
  },
]

const LINK_CURRENCIES = ['USD', 'GHS', 'KES', 'EUR'] as const

const CURL_SNIPPET = `curl https://api.payswap.dev/v1/checkout/sessions \\
  -H "Authorization: Bearer psbx_test_••••" \\
  -d '{ "amount": 1250, "currency": "USD", "methods": ["card","apple_pay","mpesa","usdc_base"] }'`

const NODE_SNIPPET = `const res = await fetch('https://api.payswap.dev/v1/checkout/sessions', {
  method: 'POST',
  headers: {
    Authorization: 'Bearer psbx_test_••••',
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    amount: 1250,
    currency: 'USD',
    methods: ['card', 'apple_pay', 'mpesa', 'usdc_base'],
  }),
})
const session = await res.json()`

const LIFECYCLE = [
  { label: 'Requested', state: 'done' as const, sub: 'Intent recorded with an idempotency key' },
  { label: 'Provider acknowledged', state: 'done' as const, sub: 'Sandbox PSP accepted the capture' },
  { label: 'Settlement T+2', state: 'processing' as const, sub: 'Payout leg processing on the rail' },
  { label: 'Beneficiary credited', state: 'pending' as const, sub: 'Awaiting protocol finality' },
] as const

function formatCurrency(value: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(value)
  } catch {
    return `${currency} ${value.toFixed(2)}`
  }
}

export function CheckoutView({ environment }: CheckoutViewProps) {
  /* Hosted checkout */
  const [method, setMethod] = useState<MethodId>('card')
  const [pending, setPending] = useState(false)
  const [receipt, setReceipt] = useState<PayReceipt | null>(null)
  const [payError, setPayError] = useState<string | null>(null)

  /* Payment links */
  const [links, setLinks] = useState<PayLink[]>(SEED_LINKS)
  const [linkAmount, setLinkAmount] = useState('')
  const [linkCurrency, setLinkCurrency] = useState<(typeof LINK_CURRENCIES)[number]>('USD')
  const [linkMemo, setLinkMemo] = useState('')
  const [copiedId, setCopiedId] = useState<string | null>(null)

  async function pay() {
    setPending(true)
    setPayError(null)
    try {
      const res = await fetch('/api/checkout/pay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: 1250, currency: 'USD', method, reference: 'INV-2481' }),
      })
      if (!res.ok) throw new Error(`checkout failed with status ${res.status}`)
      const data = (await res.json()) as { receipt: PayReceipt }
      setReceipt(data.receipt)
    } catch {
      setPayError(
        'Payment could not be captured — the provider did not acknowledge the request. Check connection health and try again.',
      )
    } finally {
      setPending(false)
    }
  }

  function createLink() {
    const amount = Number(linkAmount)
    if (!Number.isFinite(amount) || amount <= 0 || !linkMemo.trim()) return
    const link: PayLink = {
      id: `plink_${Math.random().toString(36).slice(2, 6)}`,
      memo: linkMemo.trim(),
      amount,
      currency: linkCurrency,
      status: 'awaiting payment',
      ago: 'just now',
    }
    setLinks((prev) => [link, ...prev])
    setLinkAmount('')
    setLinkMemo('')
  }

  function copyLink(id: string) {
    const url = `https://pay.payswap.dev/l/${id}`
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(url).catch(() => undefined)
    }
    setCopiedId(id)
    window.setTimeout(() => setCopiedId((cur) => (cur === id ? null : cur)), 1600)
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 px-4 py-6 lg:px-8">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-lg font-semibold text-[#102642]">Checkout</h1>
            <StatusPill tone={environment === 'sandbox' ? 'teal' : 'amber'}>
              {environment === 'sandbox' ? 'Sandbox enforced' : 'Live'}
            </StatusPill>
          </div>
          <p className="mt-1 max-w-2xl text-[13px] text-[#5a7189]">
            Hosted sessions, payment links and the integration surface. The UI acknowledges
            provider state — it never declares finality on its own.
          </p>
        </div>
      </header>

      <Tabs defaultValue="checkout">
        <TabsList className="h-9 rounded-full border border-[#dce5e9] bg-white p-1">
          <TabsTrigger value="checkout" className="rounded-full px-3.5 text-[12.5px]">
            Hosted checkout
          </TabsTrigger>
          <TabsTrigger value="links" className="rounded-full px-3.5 text-[12.5px]">
            Payment links
          </TabsTrigger>
          <TabsTrigger value="integrate" className="rounded-full px-3.5 text-[12.5px]">
            Integrate
          </TabsTrigger>
        </TabsList>

        {/* Hosted checkout */}
        <TabsContent value="checkout" className="mt-4">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.1fr_1fr]">
            <section className="rounded-2xl border border-[#dce5e9] bg-white p-5">
              <SectionLabel>Checkout preview</SectionLabel>
              <div className="mt-3 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[14px] font-semibold text-[#102642]">Kwame Motors Ltd</p>
                  <p className="mt-0.5 text-[13px] text-[#5a7189]">Invoice #INV-2481</p>
                </div>
                <Money value={1250} className="text-[15px] font-semibold text-[#102642]" />
              </div>

              <RadioGroup
                value={method}
                onValueChange={(v) => setMethod(v as MethodId)}
                className="mt-4 gap-2"
                aria-label="Payment method"
              >
                {METHODS.map((m) => (
                  <Label
                    key={m.id}
                    htmlFor={`method-${m.id}`}
                    className="flex cursor-pointer items-center gap-3 rounded-xl border border-[#dce5e9] px-3 py-2.5 font-normal hover:bg-[#f6f9fa] has-[button[data-state=checked]]:border-[#bfe5d8] has-[button[data-state=checked]]:bg-[#f6fbf9]"
                  >
                    <RadioGroupItem id={`method-${m.id}`} value={m.id} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13px] font-medium text-[#102642]">{m.label}</span>
                      <span className="block truncate font-mono text-[11px] text-[#8ba0b3]">{m.sub}</span>
                    </span>
                  </Label>
                ))}
              </RadioGroup>

              <Button
                onClick={pay}
                disabled={pending}
                className="mt-4 w-full rounded-full text-white"
                style={{ background: C.green }}
              >
                {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
                {pending ? 'Processing…' : `Pay ${formatMoney(1250)}`}
              </Button>

              {payError ? (
                <p className="mt-3 text-[12px]" style={{ color: C.amber }} role="alert">
                  {payError}
                </p>
              ) : null}

              {receipt ? (
                <div className="mt-4 rounded-xl border border-[#bfe5d8] bg-[#f4fbf8] p-3.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusPill tone="green">provider-acknowledged</StatusPill>
                    <span className="font-mono text-[10.5px] text-[#8ba0b3]">{receipt.id}</span>
                  </div>
                  <ul className="mt-2.5 space-y-1">
                    {receipt.ledger.map((entry) => (
                      <li key={entry.id} className="flex items-center justify-between gap-2 text-[11px]">
                        <span className="text-[#5a7189]">{entry.kind}</span>
                        <span className="truncate font-mono text-[10.5px] text-[#102642]">{entry.ref}</span>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2.5 text-[11.5px] text-[#5a7189]">{receipt.note}</p>
                  <p className="mt-1.5 text-[11.5px] text-[#5a7189]">
                    Settlement is a separate protocol step — see Activity.
                  </p>
                </div>
              ) : null}
            </section>

            <section className="rounded-2xl border border-[#dce5e9] bg-white p-5">
              <SectionLabel>Payment lifecycle</SectionLabel>
              <ol className="relative ml-2 mt-4 space-y-5 border-l border-[#eef2f5] pl-5">
                {LIFECYCLE.map((step) => (
                  <li key={step.label} className="relative">
                    <span
                      className="absolute -left-[28px] top-0 flex h-4 w-4 items-center justify-center rounded-full"
                      style={{
                        background: step.state === 'done' ? '#e2f4ed' : '#ffffff',
                        border: step.state === 'pending' ? '1px solid #c3d0da' : 'none',
                      }}
                      aria-hidden="true"
                    >
                      {step.state === 'done' ? (
                        <Check className="h-2.5 w-2.5" strokeWidth={3} style={{ color: C.greenDeep }} aria-hidden="true" />
                      ) : null}
                      {step.state === 'processing' ? (
                        <span className="relative flex h-2 w-2">
                          <span
                            className="absolute h-2 w-2 animate-ping rounded-full opacity-60"
                            style={{ background: C.amberDot }}
                          />
                          <span className="h-2 w-2 rounded-full" style={{ background: C.amberDot }} />
                        </span>
                      ) : null}
                    </span>
                    <p className="text-[13px] font-medium text-[#102642]">{step.label}</p>
                    <p className="mt-0.5 text-[11px] text-[#8ba0b3]">{step.sub}</p>
                  </li>
                ))}
              </ol>
              <p className="mt-5 border-t border-[#eef2f5] pt-3 text-[11.5px] leading-relaxed text-[#8ba0b3]">
                A provider acknowledgement is not a beneficiary credit. Finality is decided by the
                protocol, not the UI.
              </p>
            </section>
          </div>
        </TabsContent>

        {/* Payment links */}
        <TabsContent value="links" className="mt-4 space-y-4">
          <section className="rounded-2xl border border-[#dce5e9] bg-white p-4">
            <SectionLabel>Create a payment link</SectionLabel>
            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-[120px_100px_1fr_auto]">
              <Input
                type="number"
                min="1"
                inputMode="decimal"
                value={linkAmount}
                onChange={(e) => setLinkAmount(e.target.value)}
                placeholder="Amount"
                aria-label="Link amount"
                className="border-[#dce5e9]"
              />
              <Select value={linkCurrency} onValueChange={(v) => setLinkCurrency(v as (typeof LINK_CURRENCIES)[number])}>
                <SelectTrigger aria-label="Link currency" className="w-full border-[#dce5e9]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LINK_CURRENCIES.map((cur) => (
                    <SelectItem key={cur} value={cur}>
                      {cur}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                value={linkMemo}
                onChange={(e) => setLinkMemo(e.target.value)}
                placeholder="Memo — e.g. Invoice #INV-2482"
                aria-label="Link memo"
                className="border-[#dce5e9]"
              />
              <Button
                className="rounded-full text-white"
                style={{ background: C.green }}
                disabled={!linkMemo.trim() || !(Number(linkAmount) > 0)}
                onClick={createLink}
              >
                Create link
              </Button>
            </div>
          </section>

          <section className="overflow-hidden rounded-2xl border border-[#dce5e9] bg-white" aria-label="Payment links">
            <ul className="divide-y divide-[#eef2f5]">
              {links.map((link) => (
                <li key={link.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium text-[#102642]">{link.memo}</p>
                    <p className="mt-0.5 font-mono text-[10.5px] text-[#8ba0b3]">{link.id}</p>
                  </div>
                  <span className="font-mono text-[13px] tabular-nums text-[#102642]">
                    {formatCurrency(link.amount, link.currency)}
                  </span>
                  <StatusPill tone={link.status === 'paid' ? 'green' : 'slate'}>{link.status}</StatusPill>
                  <span className="text-[11px] text-[#8ba0b3]">{link.ago}</span>
                  <Button
                    variant="outline"
                    size="sm"
                    aria-label={`Copy payment link ${link.id}`}
                    className="rounded-full border-[#dce5e9] text-[11.5px] text-[#102642]"
                    onClick={() => copyLink(link.id)}
                  >
                    {copiedId === link.id ? (
                      <Check className="h-3.5 w-3.5" style={{ color: C.greenDeep }} aria-hidden="true" />
                    ) : (
                      <Copy className="h-3.5 w-3.5 text-[#5a7189]" aria-hidden="true" />
                    )}
                    {copiedId === link.id ? 'Copied' : 'Copy'}
                  </Button>
                </li>
              ))}
            </ul>
          </section>
        </TabsContent>

        {/* Integrate */}
        <TabsContent value="integrate" className="mt-4 space-y-4">
          <section className="rounded-2xl border border-[#dce5e9] bg-white p-5">
            <SectionLabel>Create a checkout session</SectionLabel>
            <Tabs defaultValue="curl" className="mt-3">
              <TabsList className="h-8 rounded-full border border-[#dce5e9] bg-white p-0.5">
                <TabsTrigger value="curl" className="rounded-full px-3 font-mono text-[11.5px]">
                  curl
                </TabsTrigger>
                <TabsTrigger value="node" className="rounded-full px-3 font-mono text-[11.5px]">
                  node
                </TabsTrigger>
              </TabsList>
              <TabsContent value="curl" className="mt-3">
                <pre className="overflow-x-auto rounded-xl bg-[#0b2b3d] p-4 font-mono text-[12px] leading-relaxed text-[#d7e4ec]">
                  {CURL_SNIPPET}
                </pre>
              </TabsContent>
              <TabsContent value="node" className="mt-3">
                <pre className="overflow-x-auto rounded-xl bg-[#0b2b3d] p-4 font-mono text-[12px] leading-relaxed text-[#d7e4ec]">
                  {NODE_SNIPPET}
                </pre>
              </TabsContent>
            </Tabs>
          </section>

          <div className="rounded-2xl border border-dashed border-[#dce5e9] bg-white p-4">
            <p className="text-[12px] leading-relaxed text-[#5a7189]">
              Surface contracts are framework-independent: the same authorization, idempotency and
              reconciliation rules apply on web, desktop, mobile, extension and external agents.
            </p>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
