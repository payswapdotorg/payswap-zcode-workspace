import { NextResponse } from 'next/server'
import { patchRoutine } from '@/server/routines'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Install/uninstall a routine and/or leave a user rating (1-5). */
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  let body: { installed?: boolean; userScore?: number }
  try {
    body = (await request.json()) as { installed?: boolean; userScore?: number }
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 })
  }
  if (body.installed === undefined && body.userScore === undefined) {
    return NextResponse.json(
      { error: 'nothing to update: send installed and/or userScore' },
      { status: 400 },
    )
  }
  if (
    body.userScore !== undefined &&
    (!Number.isFinite(body.userScore) || body.userScore < 1 || body.userScore > 5)
  ) {
    return NextResponse.json({ error: 'userScore must be between 1 and 5' }, { status: 400 })
  }
  const routine = await patchRoutine(id, {
    installed: body.installed,
    userScore: body.userScore,
  })
  if (!routine) return NextResponse.json({ error: 'not found' }, { status: 404 })
  return NextResponse.json({ routine })
}
