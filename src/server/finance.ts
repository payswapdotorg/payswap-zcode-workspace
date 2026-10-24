/**
 * PaySwap sandbox financial engine — the "financial authority" side of the
 * product. The agent (ZCode runtime) proposes; this engine disposes:
 * route discovery, quotes, policy checks, approval gating and the ledger.
 *
 * Everything here is deterministic and clearly sandbox-scoped (PaySwap
 * invariant: sandbox/live are explicit and enforced).
 */

import { db } from '@/lib/db'
import type {
  ApprovalPayload,
  ApprovalView,
  LedgerRow,
  PaySettings,
  QuotePayload,
  RouteCandidate,
  RouteLeg,
} from '@/lib/agent-types'
import { DEFAULT_SETTINGS } from '@/lib/agent-types'
import { CONNECTIONS, type ConnectionInstance } from '@/lib/connections'

/* ------------------------------------------------------------------ */
/* Settings                                                            */
/* ------------------------------------------------------------------ */

export async function readSettings(): Promise<PaySettings> {
  const rows = await db.appSetting.findMany()
  const merged: PaySettings = { ...DEFAULT_SETTINGS }
  for (const row of rows) {
    try {
      const parsed = JSON.parse(row.value)
      const key = row.key as keyof PaySettings
      if (key in merged) (merged as unknown as Record<string, unknown>)[key] = parsed
    } catch {
      // ignore malformed rows
    }
  }
  return merged
}

export async function writeSettings(patch: Partial<PaySettings>): Promise<PaySettings> {
  const current = await readSettings()
  const next = { ...current, ...patch }
  await Promise.all(
    Object.entries(patch).map(([key, value]) =>
      db.appSetting.upsert({
        where: { key },
        create: { key, value: JSON.stringify(value) },
        update: { value: JSON.stringify(value) },
      }),
    ),
  )
  void current
  return next
}

/* ------------------------------------------------------------------ */
/* Connected capability instances (capability model analogue)          */
/* ------------------------------------------------------------------ */


/* ------------------------------------------------------------------ */
/* FX + corridor pricing (deterministic sandbox rates)                 */
/* ------------------------------------------------------------------ */

const FX: Record<string, number> = {
  USD: 1,
  GHS: 15.4,
  NGN: 1480,
  KES: 129,
  EUR: 0.92,
  GBP: 0.79,
  USDC: 1,
}

export function fxRate(from: string, to: string): number {
  const f = FX[from] ?? 1
  const t = FX[to] ?? 1
  return t / f
}

const CORRIDOR_ETA: Record<string, number> = { GHS: 8, NGN: 14, KES: 6, EUR: 12, GBP: 20, USD: 10, USDC: 2 }

function isModeAllowed(mode: RouteCandidate['mode'], s: PaySettings): boolean {
  if (mode === 'PASS_THROUGH_NATIVE') return s.modeNative
  if (mode === 'COMPOSED_PAYSWAP') return s.modeComposed
  return s.modeOptimized
}

/* ------------------------------------------------------------------ */
/* Route discovery (capability 5 + 6)                                  */
/* ------------------------------------------------------------------ */

export interface RouteQuery {
  amount: number
  currency: string
  destinationCurrency?: string
  deadlineMinutes?: number
  beneficiary?: string
}

export function discoverRoutes(q: RouteQuery, s: PaySettings): RouteCandidate[] {
  const dest = q.destinationCurrency && FX[q.destinationCurrency] ? q.destinationCurrency : q.currency
  const converting = dest !== q.currency
  const rate = converting ? fxRate(q.currency, dest) : 1

  const candidates: RouteCandidate[] = []

  /* --- Mode 1: provider-native baseline --------------------------- */
  const stripe = CONNECTIONS.find((c) => c.id === 'cn-stripe')!
  const nativeHops = 1 + (converting ? 1 : 0)
  const nativeRejected: string[] = []
  if (!isModeAllowed('PASS_THROUGH_NATIVE', s)) nativeRejected.push('Mode disabled in Payments settings')
  if (nativeHops > s.maxRouteHops) nativeRejected.push(`Exceeds max route hops (${s.maxRouteHops})`)
  const nativeEta = stripe.etaMinutes + (converting ? 45 : 0) + (CORRIDOR_ETA[dest] ?? 10)
  if (q.deadlineMinutes && nativeEta > q.deadlineMinutes)
    nativeRejected.push(`ETA ${nativeEta}m exceeds deadline ${q.deadlineMinutes}m`)
  const nativeFee = Math.round(((q.amount * stripe.feeBps) / 10_000) * 100) / 100
  const nativeSpread = converting ? 85 : 0
  if (nativeSpread > s.fxSpreadCapBps) nativeRejected.push(`FX spread ${nativeSpread}bps above cap ${s.fxSpreadCapBps}bps`)
  candidates.push({
    id: 'rt-native',
    mode: 'PASS_THROUGH_NATIVE',
    label: `Stripe direct${converting ? ' + correspondent FX' : ''}`,
    legs: [
      { kind: 'payout', rail: 'Stripe (card rails)', detail: `Provider-native execution${converting ? ` with correspondent-bank FX to ${dest}` : ''}`, status: 'pending' },
      ...(converting
        ? [{ kind: 'conversion' as const, rail: 'Correspondent FX', detail: `Indicative spread ~${nativeSpread}bps`, status: 'pending' as const }]
        : []),
    ],
    fee: nativeFee,
    fxSpreadBps: nativeSpread,
    etaMinutes: nativeEta,
    eligible: nativeRejected.length === 0,
    rejectedReason: nativeRejected[0],
    totalOut: Math.round((q.amount - nativeFee) * rate * 100) / 100,
  })

  /* --- Mode 2: PaySwap-composed ----------------------------------- */
  const wise = CONNECTIONS.find((c) => c.id === 'cn-wise')!
  const rail =
    dest === 'KES'
      ? CONNECTIONS.find((c) => c.id === 'cn-mpesa')!
      : dest === 'GHS' || dest === 'NGN'
        ? CONNECTIONS.find((c) => c.id === 'cn-mtn')!
        : CONNECTIONS.find((c) => c.id === 'cn-sepa')!
  const composedHops = 1 + (converting ? 1 : 0) + 1
  const composedRejected: string[] = []
  if (!isModeAllowed('COMPOSED_PAYSWAP', s)) composedRejected.push('Mode disabled in Payments settings')
  if (composedHops > s.maxRouteHops) composedRejected.push(`Exceeds max route hops (${s.maxRouteHops})`)
  const composedEta = 5 + (converting ? wise.etaMinutes : 0) + (CORRIDOR_ETA[dest] ?? 10)
  if (q.deadlineMinutes && composedEta > q.deadlineMinutes)
    composedRejected.push(`ETA ${composedEta}m exceeds deadline ${q.deadlineMinutes}m`)
  const composedFee = Math.round(((q.amount * (wise.feeBps + rail.feeBps)) / 10_000) * 100) / 100
  const composedSpread = converting ? 32 : 0
  if (composedSpread > s.fxSpreadCapBps)
    composedRejected.push(`FX spread ${composedSpread}bps above cap ${s.fxSpreadCapBps}bps`)
  candidates.push({
    id: 'rt-composed',
    mode: 'COMPOSED_PAYSWAP',
    label: converting
      ? `Linked account → Wise FX → ${rail.provider}`
      : `PaySwap composed via ${rail.provider}`,
    legs: [
      { kind: 'funding', rail: 'Linked account', detail: `Fund ${q.amount.toLocaleString()} ${q.currency}`, status: 'pending' },
      ...(converting
        ? [{ kind: 'conversion' as const, rail: `Wise FX (${wise.accountRef})`, detail: `Guaranteed quote · spread ~${composedSpread}bps`, status: 'pending' as const }]
        : []),
      { kind: 'payout', rail: rail.provider, detail: `Deliver ${dest} to beneficiary`, status: 'pending' },
    ],
    fee: composedFee,
    fxSpreadBps: composedSpread,
    etaMinutes: composedEta,
    eligible: composedRejected.length === 0,
    rejectedReason: composedRejected[0],
    totalOut: Math.round((q.amount - composedFee) * rate * 100) / 100,
  })

  /* --- Mode 3: optimized multi-provider (stablecoin bridge) -------- */
  const chain = CONNECTIONS.find((c) => c.id === 'cn-railgun')!
  const optHops = 2 + (converting && dest !== 'USDC' ? 1 : 0)
  const optRejected: string[] = []
  if (!isModeAllowed('OPTIMIZED_MULTI_PROVIDER', s)) optRejected.push('Mode disabled in Payments settings')
  if (optHops > s.maxRouteHops) optRejected.push(`Exceeds max route hops (${s.maxRouteHops})`)
  const optEta = chain.etaMinutes + (dest === 'USDC' ? 0 : 9)
  if (q.deadlineMinutes && optEta > q.deadlineMinutes)
    optRejected.push(`ETA ${optEta}m exceeds deadline ${q.deadlineMinutes}m`)
  const optFee = Math.round(((q.amount * (chain.feeBps + 65)) / 10_000) * 100) / 100
  const optSpread = converting ? 18 : 0
  if (optSpread > s.fxSpreadCapBps) optRejected.push(`FX spread ${optSpread}bps above cap ${s.fxSpreadCapBps}bps`)
  candidates.push({
    id: 'rt-optimized',
    mode: 'OPTIMIZED_MULTI_PROVIDER',
    label: converting ? 'USDC on Base → off-ramp' : 'USDC transfer on Base',
    legs: [
      { kind: 'conversion', rail: 'DEX (Base)', detail: 'Swap to USDC · simulate before sign', status: 'pending' },
      { kind: 'payout', rail: 'Base (USDC)', detail: 'Onchain transfer · non-custodial signer', status: 'pending' },
      ...(dest !== 'USDC'
        ? [{ kind: 'settlement' as const, rail: 'Local off-ramp', detail: `Off-ramp to ${dest} bank/mobile rail`, status: 'pending' as const }]
        : []),
    ],
    fee: optFee,
    fxSpreadBps: optSpread,
    etaMinutes: optEta,
    eligible: optRejected.length === 0,
    rejectedReason: optRejected[0],
    totalOut: Math.round((q.amount - optFee) * rate * 100) / 100,
  })

  return candidates.sort((a, b) => {
    if (a.eligible !== b.eligible) return a.eligible ? -1 : 1
    return b.totalOut - a.totalOut
  })
}

/* ------------------------------------------------------------------ */
/* Quotes (capability 4)                                               */
/* ------------------------------------------------------------------ */

export function getQuote(route: RouteCandidate, q: RouteQuery, dest: string): QuotePayload {
  const rate = fxRate(q.currency, dest)
  return {
    routeId: route.id,
    mode: route.mode,
    amount: q.amount,
    currency: q.currency,
    destinationCurrency: dest,
    rate: Math.round(rate * 10000) / 10000,
    fee: route.fee,
    fxSpreadBps: route.fxSpreadBps,
    guaranteed: route.mode !== 'PASS_THROUGH_NATIVE',
    expiresAt: new Date(Date.now() + 2 * 60_000).toISOString(),
    source:
      route.mode === 'PASS_THROUGH_NATIVE'
        ? 'Stripe correspondent desk'
        : route.mode === 'COMPOSED_PAYSWAP'
          ? 'Wise Platform quote'
          : 'Base DEX aggregate',
    version: 'q-v1.4.2',
  }
}

/* ------------------------------------------------------------------ */
/* Approvals (capability 15 + 22 + 24)                                 */
/* ------------------------------------------------------------------ */

export function needsApproval(amount: number, s: PaySettings): boolean {
  return amount > s.autoApproveLimit
}

export async function createApproval(input: {
  taskId: string
  stepId?: string
  summary: string
  payload: ApprovalPayload
}): Promise<ApprovalView> {
  const row = await db.approval.create({
    data: {
      taskId: input.taskId,
      stepId: input.stepId ?? null,
      summary: input.summary,
      payloadJson: JSON.stringify(input.payload),
      status: 'pending',
    },
  })
  return {
    id: row.id,
    taskId: row.taskId,
    stepId: row.stepId,
    summary: row.summary,
    payload: input.payload,
    status: 'pending',
    createdAt: row.createdAt.toISOString(),
  }
}

export async function waitForApproval(
  id: string,
  timeoutMs = 240_000,
): Promise<'approved' | 'denied' | 'expired'> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const row = await db.approval.findUnique({ where: { id } })
    if (!row) return 'expired'
    if (row.status === 'approved') return 'approved'
    if (row.status === 'denied') return 'denied'
    await new Promise((r) => setTimeout(r, 1200))
  }
  await db.approval.update({ where: { id }, data: { status: 'expired' } }).catch(() => {})
  return 'expired'
}

export async function decideApproval(
  id: string,
  decision: 'approved' | 'denied',
): Promise<ApprovalView | null> {
  const row = await db.approval
    .update({ where: { id }, data: { status: decision, decidedAt: new Date() } })
    .catch(() => null)
  if (!row) return null
  return {
    id: row.id,
    taskId: row.taskId,
    stepId: row.stepId,
    summary: row.summary,
    payload: JSON.parse(row.payloadJson) as ApprovalPayload,
    status: row.status as ApprovalView['status'],
    createdAt: row.createdAt.toISOString(),
    decidedAt: row.decidedAt?.toISOString() ?? null,
  }
}

export async function listApprovals(status?: string): Promise<ApprovalView[]> {
  const rows = await db.approval.findMany({
    where: status ? { status } : undefined,
    orderBy: { createdAt: 'desc' },
    take: 60,
  })
  return rows.map((row) => ({
    id: row.id,
    taskId: row.taskId,
    stepId: row.stepId,
    summary: row.summary,
    payload: JSON.parse(row.payloadJson) as ApprovalPayload,
    status: row.status as ApprovalView['status'],
    createdAt: row.createdAt.toISOString(),
    decidedAt: row.decidedAt?.toISOString() ?? null,
  }))
}

/* ------------------------------------------------------------------ */
/* Execution + ledger (capability 2/12/14)                             */
/* ------------------------------------------------------------------ */

export interface ExecuteResult {
  ok: boolean
  reason?: string
  legs: RouteLeg[]
  ledger: LedgerRow[]
  finality: string
}

const SANDBOX_PREFIX = 'psbx_'

export async function executeRoute(input: {
  taskId: string
  route: RouteCandidate
  amount: number
  currency: string
  dest: string
  approvalId?: string
  s: PaySettings
}): Promise<ExecuteResult> {
  const { route, amount, currency, dest, approvalId, s } = input

  // Policy gate 1: environment enforcement (hard BLOCK, cannot be downgraded).
  if (s.environment !== 'sandbox') {
    return {
      ok: false,
      reason:
        'Environment is set to LIVE but no live provider instances are certified. Execution blocked by policy (hard BLOCK).',
      legs: route.legs,
      ledger: [],
      finality: 'blocked',
    }
  }

  // Policy gate 2: mandate/approval check — server-side, outside the agent.
  if (needsApproval(amount, s)) {
    if (!approvalId) {
      return {
        ok: false,
        reason: `Amount ${amount.toLocaleString()} ${currency} exceeds the auto-approve limit (${s.autoApproveLimit.toLocaleString()} ${currency}). An approved mandate is required before execution.`,
        legs: route.legs,
        ledger: [],
        finality: 'blocked',
      }
    }
    const approval = await db.approval.findUnique({ where: { id: approvalId } })
    if (!approval || approval.status !== 'approved') {
      return {
        ok: false,
        reason: 'No current approved mandate covers this execution. Authorization stale or missing.',
        legs: route.legs,
        ledger: [],
        finality: 'blocked',
      }
    }
  }

  // Compose the Economic Execution Graph legs with sandbox references.
  const t = Date.now()
  const legs: RouteLeg[] = route.legs.map((leg, i) => ({
    ...leg,
    status: 'settled',
    ref: `${SANDBOX_PREFIX}${leg.kind.slice(0, 3)}_${t.toString(36)}${i}`,
  }))

  const evidence = (kind: string) => [
    `provider acknowledgement · ${SANDBOX_PREFIX}ack_${t.toString(36)}`,
    `${kind} finality · rail-confirmed`,
    `evidence retained ${s.evidenceRetentionDays}d · sandbox`,
  ]

  const rows: { kind: LedgerRow['kind']; amount: number; currency: string; rail: string }[] = [
    { kind: 'obligation', amount, currency, rail: 'PaySwap protocol' },
    ...(route.legs.some((l) => l.kind === 'conversion')
      ? [
          {
            kind: 'conversion' as const,
            amount: Math.round((amount - route.fee) * fxRate(currency, dest) * 100) / 100,
            currency: dest,
            rail: legs.find((l) => l.kind === 'conversion')!.rail,
          },
        ]
      : []),
    { kind: 'payout', amount: route.totalOut, currency: dest, rail: legs[legs.length - 1].rail },
    { kind: 'fee', amount: route.fee, currency, rail: route.label },
  ]

  const created: LedgerRow[] = []
  for (const row of rows) {
    const dbRow = await db.ledgerEntry.create({
      data: {
        taskId: input.taskId,
        approvalId: approvalId ?? null,
        kind: row.kind,
        amount: row.amount,
        currency: row.currency,
        rail: row.rail,
        status: 'settled',
        ref: `${SANDBOX_PREFIX}${row.kind.slice(0, 3)}_${t.toString(36)}_${row.kind}`,
        evidenceJson: JSON.stringify(evidence(row.kind)),
      },
    })
    created.push({
      id: dbRow.id,
      kind: dbRow.kind as LedgerRow['kind'],
      amount: dbRow.amount,
      currency: dbRow.currency,
      rail: dbRow.rail,
      status: dbRow.status as LedgerRow['status'],
      ref: dbRow.ref,
      evidence: JSON.parse(dbRow.evidenceJson ?? '[]') as string[],
      createdAt: dbRow.createdAt.toISOString(),
    })
  }

  return {
    ok: true,
    legs,
    ledger: created,
    finality: s.requireSettlementProof
      ? 'Settled · finality evidenced at rail level (sandbox). Provider acknowledgement and beneficiary credit are recorded separately.'
      : 'Settled · provider-acknowledged (sandbox). Settlement proof not required by policy.',
  }
}

export async function listLedger(taskId?: string): Promise<LedgerRow[]> {
  const rows = await db.ledgerEntry.findMany({
    where: taskId ? { taskId } : undefined,
    orderBy: { createdAt: 'desc' },
    take: 80,
  })
  return rows.map((row) => ({
    id: row.id,
    kind: row.kind as LedgerRow['kind'],
    amount: row.amount,
    currency: row.currency,
    rail: row.rail,
    status: row.status as LedgerRow['status'],
    ref: row.ref,
    evidence: JSON.parse(row.evidenceJson ?? '[]') as string[],
    createdAt: row.createdAt.toISOString(),
  }))
}

/** Deterministic sandbox Reality-Lab comparison (capability 19). */
export function labCompare(corridor: string, amount: number, currency: string, s: PaySettings) {
  const q: RouteQuery = { amount, currency, destinationCurrency: corridor }
  const routes = discoverRoutes(q, s).filter((r) => r.eligible || r.mode === 'PASS_THROUGH_NATIVE')
  const runs = routes.map((r, i) => ({
    mode: r.mode,
    label: r.label,
    totalCost: Math.round((r.fee + (amount * r.fxSpreadBps) / 10_000) * 100) / 100,
    etaMinutes: r.etaMinutes,
    successRate: r.mode === 'PASS_THROUGH_NATIVE' ? 99.1 : r.mode === 'COMPOSED_PAYSWAP' ? 99.4 : 98.8,
    canary: i === 2,
  }))
  const winner = runs.reduce((best, r) => (r.totalCost < best.totalCost ? r : best), runs[0])
  return {
    corridor,
    amount,
    currency,
    runs,
    winner: winner?.mode ?? ('COMPOSED_PAYSWAP' as const),
    note: 'Shadow/canary evaluation over replayed sandbox facts. Results are advisory — a simulation never becomes production financial authority.',
  }
}
