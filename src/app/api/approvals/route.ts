import { NextResponse } from 'next/server'
import { listApprovals } from '@/server/finance'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const status = url.searchParams.get('status') ?? undefined
  const approvals = await listApprovals(status ?? undefined)
  return NextResponse.json({ approvals })
}
