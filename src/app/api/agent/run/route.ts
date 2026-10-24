import { runAgent } from '@/server/agent-runtime'
import type { RunEvent } from '@/lib/agent-types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 600

/**
 * Streams agent run events as NDJSON. The run continues server-side even if
 * the client disconnects (results are persisted and re-hydrated on load).
 * Body: { taskId, message?, routineId? } — with routineId the agent executes
 * that routine (Phase B); without it, it matches routines against the goal
 * (Phase A) and either runs a single match or emits candidates and stops
 * without a done event (the surface re-calls with the chosen routineId).
 */
export async function POST(request: Request) {
  const body = (await request.json()) as { taskId?: string; message?: string; routineId?: string }
  const taskId = body.taskId
  if (!taskId) {
    return new Response(JSON.stringify({ error: 'taskId is required' }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    })
  }

  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false
      const safeEnqueue = (line: string) => {
        if (closed) return
        try {
          controller.enqueue(encoder.encode(line))
        } catch {
          closed = true
        }
      }
      const emit = (event: RunEvent) => safeEnqueue(`${JSON.stringify(event)}\n`)

      runAgent({ taskId, message: body.message, routineId: body.routineId, emit })
        .catch((err: unknown) => {
          emit({ type: 'error', taskId, message: err instanceof Error ? err.message : 'runtime failure' })
        })
        .finally(() => {
          closed = true
          try {
            controller.close()
          } catch {
            // already closed
          }
        })
    },
  })

  return new Response(stream, {
    headers: {
      'content-type': 'application/x-ndjson; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
    },
  })
}
