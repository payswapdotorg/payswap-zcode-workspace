import { NextResponse } from 'next/server'
import type { RoutineCategory, RoutinePublishInput } from '@/lib/agent-types'
import { listRoutines, publishRoutine } from '@/server/routines'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const CATEGORIES: RoutineCategory[] = [
  'Shopping',
  'Payments',
  'Investing',
  'Lending',
  'Merchant',
  'Bills',
  'Savings',
  'FX',
]

export async function GET() {
  const routines = await listRoutines()
  return NextResponse.json({ routines })
}

export async function POST(request: Request) {
  let body: Partial<RoutinePublishInput>
  try {
    body = (await request.json()) as Partial<RoutinePublishInput>
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 })
  }
  const name = (body.name ?? '').trim()
  const category = body.category
  if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 })
  if (!category || !CATEGORIES.includes(category)) {
    return NextResponse.json(
      { error: `category must be one of: ${CATEGORIES.join(', ')}` },
      { status: 400 },
    )
  }
  if (!Array.isArray(body.steps) || body.steps.length === 0) {
    return NextResponse.json({ error: 'steps must be a non-empty array' }, { status: 400 })
  }
  const input: RoutinePublishInput = {
    name,
    description: (body.description ?? '').trim(),
    category,
    merchant: Boolean(body.merchant),
    publisher: body.publisher,
    steps: body.steps,
  }
  const routine = await publishRoutine(input)
  return NextResponse.json({ routine }, { status: 201 })
}
