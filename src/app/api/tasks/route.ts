import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import type { AgentStep, PaymentGate, RoutineRunState, TaskDTO, TaskOrigin } from '@/lib/agent-types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Seed a small set of clearly-historical tasks so the workspace is never empty. */
async function ensureSeed() {
  const count = await db.task.count()
  if (count > 0) return
  const seeds = [
    {
      title: "Reconcile yesterday's settlements",
      projectId: 'p3',
      goal: 'Match card settlements to the ledger and flag mismatches',
      status: 'completed',
      messages: [
        {
          role: 'user',
          content:
            "Reconcile yesterday's card settlements against the processor report and flag anything that doesn't match the ledger.",
        },
        {
          role: 'agent',
          content:
            'Reconciliation complete. 4,981 captured transactions totalling $412,338.10 match the processor report within a 2¢ tolerance. I flagged 3 exceptions: 2 duplicate captures ($118.00) and 1 late-presentment fee ($0.45). Suggested ledger adjustments are in reconciliation-diff.csv — want me to apply them?',
          steps: [
            { label: 'fetch_processor_report(yesterday)', detail: '4,981 rows' },
            { label: 'match_ledger_entries(4,981 rows)', detail: '3 exceptions flagged' },
            { label: 'write reconciliation-diff.csv', detail: 'adjustments proposed' },
          ],
        },
      ],
    },
    {
      title: 'Pay supplier Kwame Motors 500 GHS before Friday',
      projectId: 'p4',
      goal: 'Pay 500 USD to Kwame Motors via cheapest eligible route before Friday',
      status: 'completed',
      messages: [
        { role: 'user', content: 'Send 500 USD to supplier Kwame Motors in GHS before Friday, cheapest eligible route.' },
        {
          role: 'agent',
          content:
            'Executed via the composed route (linked account → Wise FX → MTN MoMo). 500 USD converted at 15.3860 GHS/USD with a 32bps spread, fee $4.16. Beneficiary received **GHS 7,673.42**. Finality is rail-confirmed and the evidence pack (ack + settlement) is attached in Activity. The provider-native baseline was rejected: its 85bps correspondent spread exceeds your 60bps FX cap.',
          steps: [
            { label: 'discover_routes(500 USD → GHS, deadline Fri)', detail: '2 eligible / 3 candidates' },
            { label: 'get_quote(rt-composed)', detail: '15.3860 GHS/USD · guaranteed · 2m expiry' },
            { label: 'execute_route(rt-composed)', detail: 'Settled · finality evidenced (sandbox)' },
          ],
        },
      ],
    },
    {
      title: 'Fix 3DS webhook retry storms',
      projectId: 'p1',
      goal: 'Stop duplicated order confirmations from 3DS webhook redeliveries',
      status: 'completed',
      messages: [
        {
          role: 'user',
          content: 'Webhooks for 3DS completions are retrying in storms and duplicating order confirmations. Find the cause and fix it.',
        },
        {
          role: 'agent',
          content:
            'Root cause: the 3DS handler acknowledged before committing, so timeouts triggered redelivery. I added an idempotency key keyed on (intent_id, attempt) and moved the ack after commit. Replayed 1,204 sandbox events — zero duplicates, p99 ack time 41ms.',
          steps: [
            { label: 'trace webhook-events (24h)', detail: '1,204 redeliveries' },
            { label: 'patch handlers/threeds.ts (idempotency key)', detail: 'ack after commit' },
            { label: 'replay 1,204 events in sandbox', detail: '0 duplicates · p99 41ms' },
          ],
        },
      ],
    },
  ]

  for (const seed of seeds) {
    const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000)
    await db.task.create({
      data: {
        title: seed.title,
        projectId: seed.projectId,
        goal: seed.goal,
        status: seed.status,
        createdAt: daysAgo(1),
        messages: {
          create: seed.messages.map((m, i) => ({
            role: m.role,
            content: m.content,
            steps:
              'steps' in m && m.steps
                ? JSON.stringify(
                    (m.steps as Partial<AgentStep>[]).map((s, j) => ({
                      id: `s${i}${j}`,
                      label: s.label ?? '',
                      detail: s.detail,
                      status: 'done' as const,
                      kind: 'tool' as const,
                    })),
                  )
                : '[]',
            createdAt: daysAgo(1),
          })),
        },
      },
    })
  }
}

function toTaskDTO(task: {
  id: string
  title: string
  projectId: string | null
  status: string
  goal: string | null
  routineJson: string | null
  gatesJson: string | null
  originJson: string | null
  createdAt: Date
  messages: { id: string; role: string; content: string; steps: string; createdAt: Date }[]
}): TaskDTO {
  const routine = parseJson<RoutineRunState>(task.routineJson)
  const gates = parseJson<PaymentGate[]>(task.gatesJson)
  const origin = parseJson<TaskOrigin>(task.originJson)
  return {
    id: task.id,
    title: task.title,
    projectId: task.projectId,
    status: task.status as TaskDTO['status'],
    goal: task.goal,
    createdAt: task.createdAt.toISOString(),
    messages: task.messages.map((m) => ({
      id: m.id,
      role: m.role as 'user' | 'agent',
      content: m.content,
      steps: JSON.parse(m.steps || '[]') as AgentStep[],
      at: m.createdAt.toISOString(),
    })),
    routine: routine ?? null,
    gates: gates ?? undefined,
    origin: origin ?? null,
  }
}

function parseJson<T>(raw: string | null): T | null {
  if (!raw) return null
  try {
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

export async function GET() {
  await ensureSeed()
  const tasks = await db.task.findMany({
    orderBy: { createdAt: 'desc' },
    include: { messages: { orderBy: { createdAt: 'asc' } } },
  })
  return NextResponse.json({ tasks: tasks.map(toTaskDTO) })
}

export async function POST(request: Request) {
  const body = (await request.json()) as {
    title?: string
    projectId?: string | null
    message?: string
    origin?: TaskOrigin
  }
  const message = (body.message ?? '').trim()
  if (!message) return NextResponse.json({ error: 'message is required' }, { status: 400 })
  const title = (body.title ?? message).slice(0, 80)
  const origin =
    body.origin && body.origin.type === 'browser' && typeof body.origin.url === 'string'
      ? body.origin
      : null
  const task = await db.task.create({
    data: {
      title,
      projectId: body.projectId ?? null,
      status: 'running',
      goal: message.slice(0, 200),
      originJson: origin ? JSON.stringify(origin) : null,
      messages: { create: { role: 'user', content: message } },
    },
    include: { messages: { orderBy: { createdAt: 'asc' } } },
  })
  return NextResponse.json({ task: toTaskDTO(task) })
}
