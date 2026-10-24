import { NextResponse } from 'next/server'
import { awardOpportunity } from '@/server/opportunities'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Award an opportunity: { bidId? } names the winning bid; when omitted the
 * lowest-fee bid wins. Returns the awarded opportunity.
 */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  let body: { bidId?: string } = {}
  try {
    body = (await request.json()) as { bidId?: string }
  } catch {
    // empty body is fine — lowest-fee wins
  }
  const opportunity = await awardOpportunity(id, body.bidId)
  if (!opportunity) return NextResponse.json({ error: 'not found' }, { status: 404 })
  return NextResponse.json({ opportunity })
}
