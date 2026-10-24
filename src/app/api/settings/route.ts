import { NextResponse } from 'next/server'
import { readSettings, writeSettings } from '@/server/finance'
import type { PaySettings } from '@/lib/agent-types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const settings = await readSettings()
  return NextResponse.json({ settings })
}

export async function PUT(request: Request) {
  const body = (await request.json()) as { settings?: Partial<PaySettings> }
  if (!body.settings || typeof body.settings !== 'object') {
    return NextResponse.json({ error: 'settings object required' }, { status: 400 })
  }
  const settings = await writeSettings(body.settings)
  return NextResponse.json({ settings })
}
