import { NextResponse } from 'next/server'
import { decideApproval } from '@/server/finance'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  const body = (await request.json()) as { decision?: 'approved' | 'denied' }
  if (body.decision !== 'approved' && body.decision !== 'denied') {
    return NextResponse.json({ error: 'decision must be approved|denied' }, { status: 400 })
  }
  const approval = await decideApproval(id, body.decision)
  if (!approval) return NextResponse.json({ error: 'not found' }, { status: 404 })
  return NextResponse.json({ approval })
}
