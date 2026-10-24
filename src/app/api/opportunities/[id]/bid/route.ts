import { NextResponse } from 'next/server'
import { addYourBid } from '@/server/opportunities'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Bid on an opportunity from the viewer's own node ("your-node": region
 * Local, feeBps 10, eta 5, rating 4.8). Body { node? } overrides the name.
 */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  let body: { node?: string } = {}
  try {
    body = (await request.json()) as { node?: string }
  } catch {
    // empty body is fine — defaults apply
  }
  const opportunity = await addYourBid(id, body.node)
  if (!opportunity) return NextResponse.json({ error: 'not found' }, { status: 404 })
  return NextResponse.json({ opportunity })
}
