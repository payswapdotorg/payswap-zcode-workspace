'use client'

import type { RunEvent } from '@/lib/agent-types'

/**
 * Streams agent run events (NDJSON) from POST /api/agent/run.
 * Relative URL only — the gateway proxies same-origin requests.
 */
export async function streamRun(opts: {
  taskId: string
  message?: string
  routineId?: string
  onEvent: (event: RunEvent) => void
}): Promise<void> {
  const res = await fetch('/api/agent/run', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ taskId: opts.taskId, message: opts.message, routineId: opts.routineId }),
  })
  if (!res.ok || !res.body) throw new Error(`agent run failed (${res.status})`)

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    let idx: number
    while ((idx = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, idx).trim()
      buffer = buffer.slice(idx + 1)
      if (!line) continue
      try {
        opts.onEvent(JSON.parse(line) as RunEvent)
      } catch {
        // ignore malformed lines
      }
    }
  }
}
