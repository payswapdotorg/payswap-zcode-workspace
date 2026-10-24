import { NextResponse } from 'next/server'
import { listApprovals, listLedger } from '@/server/finance'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const taskId = url.searchParams.get('taskId') ?? undefined
  const [ledger, approvals] = await Promise.all([listLedger(taskId), listApprovals()])
  return NextResponse.json({ ledger, approvals })
}
