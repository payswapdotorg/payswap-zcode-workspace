import { NextResponse } from 'next/server'
import { labCompare, readSettings } from '@/server/finance'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const body = (await request.json()) as { corridor?: string; amount?: number; currency?: string }
  const corridor = (body.corridor ?? 'GHS').toUpperCase()
  const amount = Number(body.amount ?? 1000)
  const currency = (body.currency ?? 'USD').toUpperCase()
  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: 'amount must be positive' }, { status: 400 })
  }
  const settings = await readSettings()
  return NextResponse.json({ result: labCompare(corridor, amount, currency, settings) })
}
