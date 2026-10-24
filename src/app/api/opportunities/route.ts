import { NextResponse } from 'next/server'
import type { OpportunityKind } from '@/lib/agent-types'
import { createOpportunity, listOpportunities } from '@/server/opportunities'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const KINDS: OpportunityKind[] = ['routing', 'liquidity', 'fx', 'payout']

export async function GET() {
  const opportunities = await listOpportunities()
  return NextResponse.json({ opportunities })
}

export async function POST(request: Request) {
  let body: {
    title?: string
    kind?: string
    intentSummary?: string
    amount?: number
    currency?: string
    rewardBps?: number
    createdByTaskId?: string
  }
  try {
    body = (await request.json()) as typeof body
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 })
  }
  const title = (body.title ?? '').trim()
  const intentSummary = (body.intentSummary ?? '').trim()
  const amount = Number(body.amount)
  if (!title) return NextResponse.json({ error: 'title is required' }, { status: 400 })
  if (!intentSummary) return NextResponse.json({ error: 'intentSummary is required' }, { status: 400 })
  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: 'amount must be a positive number' }, { status: 400 })
  }
  const kind = (body.kind ?? 'routing') as OpportunityKind
  if (!KINDS.includes(kind)) {
    return NextResponse.json({ error: `kind must be one of: ${KINDS.join(', ')}` }, { status: 400 })
  }
  const opportunity = await createOpportunity({
    title,
    kind,
    intentSummary,
    amount,
    currency: (body.currency ?? 'GHS').toUpperCase(),
    rewardBps: Math.max(0, Math.round(Number(body.rewardBps ?? 15))),
    createdByTaskId: body.createdByTaskId ?? null,
  })
  return NextResponse.json({ opportunity }, { status: 201 })
}
