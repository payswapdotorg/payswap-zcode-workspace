import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import type { Opportunity, PaymentChoice, PaymentGate, PaymentReceipt } from '@/lib/agent-types'
import { readSettings } from '@/server/finance'
import { fillBidsAndAward } from '@/server/opportunities'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const SANDBOX_PREFIX = 'psbx_'

function ref8(): string {
  return Math.random().toString(36).slice(2, 10)
}

/** Sandbox rail pricing per checkout method kind (simulated, deterministic). */
const RAIL_TERMS: Record<string, { feeBps: number; etaMinutes: number }> = {
  momo: { feeBps: 150, etaMinutes: 2 },
  card: { feeBps: 290, etaMinutes: 15 },
  bank: { feeBps: 100, etaMinutes: 30 },
  wallet: { feeBps: 120, etaMinutes: 5 },
}

function persistGates(taskId: string, gates: PaymentGate[]): Promise<void> {
  return db.task.update({ where: { id: taskId }, data: { gatesJson: JSON.stringify(gates) } }).then(() => {})
}

function loadGates(taskId: string): Promise<PaymentGate[]> {
  return db.task
    .findUnique({ where: { id: taskId }, select: { gatesJson: true } })
    .then((t) => (t?.gatesJson ? (JSON.parse(t.gatesJson) as PaymentGate[]) : []))
    .catch(() => [] as PaymentGate[])
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * Sandbox hosted-checkout payment (capability 7) — two paths:
 *
 * 1. Legacy (no gateId in body): capture through the connected PSP instance
 *    and record the protocol lifecycle. Unchanged; view-checkout depends on it.
 * 2. Gate path { taskId, gateId, choice }: settle an agent-opened checkout
 *    gate. Simulated settle (1.5-3s), evidence ledger rows, and — when the
 *    choice is payswap_route — an Opportunity broadcast to nodes with
 *    immediate bids and an award of the lowest fee.
 */
export async function POST(request: Request) {
  const body = (await request.json()) as {
    amount?: number
    currency?: string
    method?: string
    reference?: string
    taskId?: string
    gateId?: string
    choice?: PaymentChoice
  }

  /* ---------------------------------------------------------------- */
  /* Legacy path — unchanged                                          */
  /* ---------------------------------------------------------------- */
  if (!body.gateId) {
    const amount = Number(body.amount ?? 0)
    const currency = (body.currency ?? 'USD').toUpperCase()
    const method = body.method ?? 'card'
    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: 'amount must be positive' }, { status: 400 })
    }
    const settings = await readSettings()
    if (settings.environment !== 'sandbox') {
      return NextResponse.json(
        { error: 'Checkout is enforced to sandbox while no live provider is certified.' },
        { status: 403 },
      )
    }

    const t = Date.now().toString(36)
    const fee = Math.round(amount * 290) / 10_000
    const ack = `${SANDBOX_PREFIX}ack_${t}`
    const rows = [
      { kind: 'obligation', amount, currency, rail: 'Hosted checkout', status: 'settled' },
      { kind: 'fee', amount: fee, currency, rail: 'Stripe (sandbox)', status: 'settled' },
      { kind: 'settlement', amount: Math.round((amount - fee) * 100) / 100, currency, rail: 'Stripe payout (T+2 sandbox)', status: 'processing' },
    ]

    const created: { id: string; kind: string; status: string; ref: string }[] = []
    for (const row of rows) {
      const dbRow = await db.ledgerEntry.create({
        data: {
          kind: row.kind,
          amount: row.amount,
          currency: row.currency,
          rail: row.rail,
          status: row.status,
          ref: `${SANDBOX_PREFIX}${row.kind.slice(0, 3)}_${t}`,
          evidenceJson: JSON.stringify([
            `provider acknowledgement · ${ack}`,
            'payment method · ' + method,
            body.reference ? `commerce reference · ${body.reference}` : 'commerce reference · (none)',
            'capture lifecycle · provider-acknowledged; settlement pending',
          ]),
        },
      })
      created.push({ id: dbRow.id, kind: dbRow.kind, status: dbRow.status, ref: dbRow.ref })
    }

    return NextResponse.json({
      receipt: {
        id: `csbx_${t}`,
        amount,
        currency,
        method,
        status: 'provider-acknowledged',
        note: 'Captured in sandbox. Settlement is a separate protocol step — see Activity for the T+2 payout record.',
        ledger: created,
      },
    })
  }

  /* ---------------------------------------------------------------- */
  /* Gate path — agent-opened checkout gate settlement                */
  /* ---------------------------------------------------------------- */
  const taskId = body.taskId ?? ''
  const gateId = body.gateId
  const choice = body.choice
  if (!taskId) return NextResponse.json({ error: 'taskId is required' }, { status: 400 })
  if (!choice || !['merchant_rail', 'connect_and_pay', 'payswap_route'].includes(choice.mode)) {
    return NextResponse.json({ error: 'choice.mode must be merchant_rail | connect_and_pay | payswap_route' }, { status: 400 })
  }
  const settings = await readSettings()
  if (settings.environment !== 'sandbox') {
    return NextResponse.json(
      { error: 'Checkout is enforced to sandbox while no live provider is certified.' },
      { status: 403 },
    )
  }

  const gates = await loadGates(taskId)
  const idx = gates.findIndex((g) => g.gateId === gateId)
  if (idx === -1) return NextResponse.json({ error: 'gate not found on task' }, { status: 404 })

  // Idempotency: already settled → return the recorded receipt.
  if (gates[idx].status === 'settled' && gates[idx].receipt) {
    const receipt = gates[idx].receipt!
    const opportunity = receipt.opportunityId ? await fetchOpportunity(receipt.opportunityId) : null
    return NextResponse.json(opportunity ? { receipt, opportunity } : { receipt })
  }

  const checkout = gates[idx].checkout
  gates[idx] = { ...gates[idx], status: 'processing' }
  await persistGates(taskId, gates)

  // Simulated rail settle time.
  await sleep(1500 + Math.round(Math.random() * 1500))

  const t = Date.now().toString(36)
  const ack = `${SANDBOX_PREFIX}ack_${t}`
  let opportunity: Opportunity | null = null
  let railLabel: string
  let feeBps: number
  let etaMinutes: number

  if (choice.mode === 'payswap_route') {
    railLabel = choice.preferredRailLabel ?? 'PaySwap node route'
    // Broadcast the routing intent and let nodes bid; lowest fee wins.
    opportunity = await createRoutingOpportunity(taskId, checkout)
    const awardedBid = opportunity?.bids.find((b) => b.node === opportunity?.awardedNodeId) ?? null
    feeBps = awardedBid?.feeBps ?? 18
    etaMinutes = awardedBid?.etaMinutes ?? 8
  } else {
    railLabel = choice.railLabel
    const methodKind = checkout.methods.find((m) => m.label === railLabel)?.kind ?? 'card'
    const terms = RAIL_TERMS[methodKind] ?? RAIL_TERMS.card
    feeBps = terms.feeBps
    etaMinutes = terms.etaMinutes
  }

  const fee = Math.round(((checkout.price * feeBps) / 1000) * 100) / 100

  const receipt: PaymentReceipt = {
    ref: `${SANDBOX_PREFIX}${ref8()}`,
    mode: choice.mode,
    railLabel,
    amount: checkout.price,
    currency: checkout.currency,
    fee,
    feeBps,
    etaMinutes,
    settledAt: new Date().toISOString(),
    ...(opportunity ? { opportunityId: opportunity.id, awardedNode: opportunity.awardedNodeId ?? undefined } : {}),
  }

  // Evidence ledger rows for the settled gate (mono refs + evidence strings).
  const evidence = [
    `provider acknowledgement · ${ack}`,
    `mode · ${receipt.mode} · rail ${railLabel}`,
    `item · ${checkout.item} @ ${checkout.store} (${checkout.url})`,
    'capture lifecycle · settled in sandbox; evidence retained',
  ]
  const ledgerRows = [
    { kind: 'obligation', amount: checkout.price, currency: checkout.currency, rail: railLabel, ref: `${SANDBOX_PREFIX}obl_${t}` },
    ...(choice.mode === 'payswap_route' && receipt.awardedNode
      ? [{ kind: 'funding', amount: checkout.price, currency: checkout.currency, rail: receipt.awardedNode, ref: `${SANDBOX_PREFIX}fnd_${t}` }]
      : []),
    { kind: 'payout', amount: Math.round((checkout.price - fee) * 100) / 100, currency: checkout.currency, rail: checkout.store, ref: `${SANDBOX_PREFIX}pay_${t}` },
    { kind: 'fee', amount: fee, currency: checkout.currency, rail: railLabel, ref: `${SANDBOX_PREFIX}fee_${t}` },
  ]
  for (const row of ledgerRows) {
    await db.ledgerEntry.create({
      data: {
        taskId,
        kind: row.kind,
        amount: row.amount,
        currency: row.currency,
        rail: row.rail,
        status: 'settled',
        ref: row.ref,
        evidenceJson: JSON.stringify(evidence),
      },
    })
  }

  gates[idx] = { ...gates[idx], status: 'settled', receipt, opportunityId: opportunity?.id }
  await persistGates(taskId, gates)

  return NextResponse.json(opportunity ? { receipt, opportunity } : { receipt })
}

async function fetchOpportunity(id: string): Promise<Opportunity | null> {
  const { getOpportunity } = await import('@/server/opportunities')
  return getOpportunity(id)
}

async function createRoutingOpportunity(
  taskId: string,
  checkout: PaymentGate['checkout'],
): Promise<Opportunity | null> {
  const { createOpportunity, fillBidsAndAward } = await import('@/server/opportunities')
  const opportunity = await createOpportunity({
    title: `Route ${checkout.price} ${checkout.currency} for ${checkout.item}`,
    kind: 'routing',
    intentSummary: `Merchant rails not used for ${checkout.store} checkout`,
    amount: checkout.price,
    currency: checkout.currency,
    rewardBps: 18,
    createdByTaskId: taskId,
  })
  return fillBidsAndAward(opportunity.id, 3)
}
