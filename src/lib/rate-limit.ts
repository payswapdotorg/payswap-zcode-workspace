/**
 * Distributed rate limiting for PaySwap API routes.
 *
 * Primary backend: Upstash Redis over REST (INCR + PEXPIRE, fixed window) —
 * works across serverless/desktop instances. When Upstash is not configured or
 * unreachable, falls back to an in-process fixed-window counter so the app
 * never hard-fails on rate limiting infrastructure. Both backends share the
 * same result contract.
 */
import { NextResponse } from 'next/server'

export interface RateLimitResult {
  ok: boolean
  limit: number
  remaining: number
  resetMs: number
  backend: 'upstash' | 'memory'
}

const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN

/** In-memory fallback: key -> { count, windowStart }. */
const memory = new Map<string, { count: number; windowStart: number }>()

/** Circuit breaker: after a failed Upstash call, skip REST for 60s (keeps latency flat). */
let upstashDownUntil = 0

function upstashCommand(commands: string[][]): Promise<string[] | null> {
  if (!UPSTASH_URL || !UPSTASH_TOKEN) return Promise.resolve(null)
  if (Date.now() < upstashDownUntil) return Promise.resolve(null)
  return fetch(`${UPSTASH_URL}/pipeline`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${UPSTASH_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(commands.map((c) => [c[0], ...c.slice(1)])),
    signal: AbortSignal.timeout(2500),
  })
    .then(async (res) => {
      if (!res.ok) return null
      const data = (await res.json()) as Array<{ result: string }>
      return data.map((d) => String(d.result))
    })
    .catch(() => {
      upstashDownUntil = Date.now() + 60_000
      return null
    })
}

export function clientIp(request: Request): string {
  const fwd = request.headers.get('x-forwarded-for')
  if (fwd) return fwd.split(',')[0].trim()
  return request.headers.get('x-real-ip') ?? 'local'
}

/**
 * Fixed-window limiter. Returns ok:false once `limit` requests have been seen
 * inside `windowMs` for the given key.
 */
export async function checkRateLimit(
  key: string,
  opts: { limit: number; windowMs: number },
): Promise<RateLimitResult> {
  const { limit, windowMs } = opts
  const bucket = Math.floor(Date.now() / windowMs)
  const resetMs = (bucket + 1) * windowMs - Date.now()
  const redisKey = `ratelimit:${key}:${bucket}`

  const results = await upstashCommand([
    ['INCR', redisKey],
    ['PEXPIRE', redisKey, String(Math.ceil(windowMs / 1000) + 1)],
  ])
  if (results) {
    const count = Number(results[0] ?? 0)
    return { ok: count <= limit, limit, remaining: Math.max(0, limit - count), resetMs, backend: 'upstash' }
  }

  // Memory fallback (no Upstash config, or REST unreachable).
  const now = Date.now()
  const entry = memory.get(key)
  if (!entry || now - entry.windowStart >= windowMs) {
    memory.set(key, { count: 1, windowStart: now })
    return { ok: true, limit, remaining: limit - 1, resetMs: windowMs, backend: 'memory' }
  }
  entry.count += 1
  return { ok: entry.count <= limit, limit, remaining: Math.max(0, limit - entry.count), resetMs, backend: 'memory' }
}

/** Standard 429 response with Retry-After. */
export function tooManyRequests(result: RateLimitResult): NextResponse {
  return NextResponse.json(
    { error: 'rate_limited', detail: `Too many requests — retry in ${Math.ceil(result.resetMs / 1000)}s`, backend: result.backend },
    {
      status: 429,
      headers: {
        'Retry-After': String(Math.max(1, Math.ceil(result.resetMs / 1000))),
        'X-RateLimit-Limit': String(result.limit),
        'X-RateLimit-Remaining': '0',
      },
    },
  )
}

/** One-call guard for route handlers: returns a 429 response when limited, else null. */
export async function rateGuard(
  request: Request,
  scope: string,
  opts: { limit: number; windowMs: number },
): Promise<NextResponse | null> {
  const result = await checkRateLimit(`${scope}:${clientIp(request)}`, opts)
  if (result.ok) return null
  console.warn(`[rate-limit] blocked ${scope} from ${clientIp(request)} (backend=${result.backend})`)
  return tooManyRequests(result)
}
