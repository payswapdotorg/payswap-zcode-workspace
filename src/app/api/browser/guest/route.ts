import { isAllowedBrowserUrl, isLocalDevelopmentHost, normalizeBrowserUrl } from '@/lib/zcode/browser/embeddedBrowserHelpers'

/**
 * Guest page proxy for the ZCode browser port.
 *
 * The original ZCode browser renders pages in an Electron `<webview>` guest. The web
 * sandbox has no Electron, so the guest is an `<iframe>`; third-party documents cannot
 * be framed directly (X-Frame-Options / frame-ancestors), therefore the guest document
 * is fetched server-side and re-served from this route with framing headers stripped.
 *
 * Only the guest *document* is proxied — sub-resources (css/js/img) are absolute URLs
 * that the sandboxed iframe fetches directly from their origins, exactly like a normal
 * browser tab. Anchors and GET forms are rewritten so navigation stays inside the proxy.
 */

const GUEST_TIMEOUT_MS = 20_000
const MAX_DOCUMENT_BYTES = 8 * 1024 * 1024

const BROWSER_UA =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'

function isProxyableHost(hostname: string): boolean {
  // Block loopback / private ranges / link-local metadata to avoid SSRF.
  if (isLocalDevelopmentHost(hostname)) return false
  const host = hostname.toLowerCase().replace(/^\[(.*)]$/, '$1')
  if (host.endsWith('.internal') || host.endsWith('.local')) return false
  return true
}

function guestUrlFor(absoluteUrl: string): string {
  return `/api/browser/guest?url=${encodeURIComponent(absoluteUrl)}`
}

/** Escape a string for safe embedding into a double-quoted HTML attribute. */
function attr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function absoluteUrlOf(raw: string, base: string): string | null {
  try {
    const url = new URL(raw, base)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    if (!isProxyableHost(url.hostname)) return null
    url.hash = ''
    return url.toString()
  } catch {
    return null
  }
}

function rewriteHtml(html: string, baseUrl: string): string {
  let out = html

  // Remove CSP meta tags — they would block the injected bootstrap and cross-origin assets.
  out = out.replace(
    /<meta[^>]+http-equiv=["']?content-security-policy["']?[^>]*>/gi,
    '<!-- csp-meta-stripped -->',
  )
  // Remove <base> so relative resolution happens against the proxy URL (we rewrite absolutes anyway).
  out = out.replace(/<base\b[^>]*>/gi, '<!-- base-stripped -->')

  // Rewrite anchors: keep #fragments and javascript:/mailto: as-is; proxy http(s) targets.
  out = out.replace(/\shref\s*=\s*("([^"]*)"|'([^']*)')/gi, (match, _q, dq, sq) => {
    const raw = (dq ?? sq ?? '').trim()
    if (!raw || raw.startsWith('#') || /^(javascript|mailto|tel|data|blob):/i.test(raw)) return match
    const abs = absoluteUrlOf(raw, baseUrl)
    if (!abs) return match
    return ` href="${attr(guestUrlFor(abs))}"`
  })

  // Rewrite GET form actions so plain form submits stay proxied.
  out = out.replace(/\saction\s*=\s*("([^"]*)"|'([^']*)')/gi, (match, _q, dq, sq) => {
    const raw = (dq ?? sq ?? '').trim()
    if (!raw || /^(javascript|mailto|tel|data|blob):/i.test(raw)) return match
    const abs = absoluteUrlOf(raw, baseUrl)
    if (!abs) return match
    return ` action="${attr(guestUrlFor(abs))}"`
  })

  // Remove framebusting / target=_top escapes so navigation stays inside the guest.
  out = out.replace(/\starget\s*=\s*("_top"|'_top'|_blank)/gi, ' target="_self"')

  // Bootstrap: report the effective URL and runtime load failures to the host chrome.
  const bootstrap = [
    '<script>(function(){',
    `var finalUrl=${JSON.stringify(baseUrl)};`,
    'try{parent.postMessage({type:"psbx:guest-url",url:finalUrl},"*")}catch(e){}',
    'window.addEventListener("error",function(ev){',
    'try{parent.postMessage({type:"psbx:guest-runtime-error",message:String(ev.message||"script error"),url:finalUrl},"*")}catch(e){}',
    '},true);',
    '})();</script>',
  ].join('')
  if (/<head[^>]*>/i.test(out)) {
    out = out.replace(/<head([^>]*)>/i, `<head$1>${bootstrap}`)
  } else {
    out = bootstrap + out
  }
  return out
}

function errorPageHtml(message: string, detail: string): string {
  const safeMessage = message.replace(/</g, '&lt;')
  const safeDetail = detail.replace(/</g, '&lt;')
  return [
    '<!doctype html><html><head><meta charset="utf-8">',
    '<style>body{font-family:ui-sans-serif,system-ui;background:#fff;color:#102642;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}main{max-width:26rem;padding:2rem;text-align:center}h1{font-size:15px;font-weight:600}p{font-size:13px;color:#5a7189}code{font-family:ui-monospace,monospace;font-size:12px;color:#8ba0b3;word-break:break-all}</style>',
    '</head><body><main>',
    `<h1>${safeMessage}</h1>`,
    `<p><code>${safeDetail}</code></p>`,
    '</main>',
    '<script>try{parent.postMessage({type:"psbx:guest-load-error",message:' +
      JSON.stringify(safeMessage) +
      '},"*")}catch(e){}</script>',
    '</body></html>',
  ].join('')
}

export async function GET(request: Request): Promise<Response> {
  const requestUrl = new URL(request.url)
  const rawUrl = requestUrl.searchParams.get('url') ?? ''

  const normalized = normalizeBrowserUrl(rawUrl)
  if (!normalized || !isAllowedBrowserUrl(normalized)) {
    return new Response(
      errorPageHtml('This page could not be opened', 'Only http and https URLs are supported'),
      { status: 400, headers: { 'content-type': 'text/html; charset=utf-8' } },
    )
  }

  let parsed: URL
  try {
    parsed = new URL(normalized)
  } catch {
    return new Response(errorPageHtml('This page could not be opened', 'Invalid URL'), {
      status: 400,
      headers: { 'content-type': 'text/html; charset=utf-8' },
    })
  }
  if (!isProxyableHost(parsed.hostname)) {
    return new Response(
      errorPageHtml('This page could not be opened', 'Host is not reachable from the sandbox'),
      { status: 403, headers: { 'content-type': 'text/html; charset=utf-8' } },
    )
  }

  let upstream: Response
  try {
    upstream = await fetch(parsed.toString(), {
      redirect: 'follow',
      signal: AbortSignal.timeout(GUEST_TIMEOUT_MS),
      headers: {
        'user-agent': BROWSER_UA,
        accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'accept-language': 'en-US,en;q=0.9',
      },
    })
  } catch (error) {
    const detail =
      error instanceof Error
        ? error.name === 'TimeoutError'
          ? 'The site took too long to respond (timeout)'
          : error.message
        : 'Network request failed'
    return new Response(errorPageHtml('This site can’t be reached', detail), {
      status: 502,
      headers: { 'content-type': 'text/html; charset=utf-8' },
    })
  }

  const contentType = upstream.headers.get('content-type') ?? 'application/octet-stream'
  const isHtml = contentType.includes('text/html') || contentType.includes('xhtml')

  if (!isHtml) {
    // Non-document resources: stream through unchanged (framing headers irrelevant for sub-loads).
    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        'content-type': contentType,
        'cache-control': 'no-store',
      },
    })
  }

  const buffer = await upstream.arrayBuffer()
  if (buffer.byteLength > MAX_DOCUMENT_BYTES) {
    return new Response(errorPageHtml('This page could not be opened', 'Document too large'), {
      status: 413,
      headers: { 'content-type': 'text/html; charset=utf-8' },
    })
  }

  const charsetMatch = /charset=([\w-]+)/i.exec(contentType)
  const charset = (charsetMatch?.[1] ?? 'utf-8').toLowerCase()
  let html: string
  try {
    html = new TextDecoder(charset, { fatal: false }).decode(buffer)
  } catch {
    html = new TextDecoder('utf-8', { fatal: false }).decode(buffer)
  }

  // Redirects resolve to the final response URL — keep the address bar truthful.
  const finalUrl = upstream.url || parsed.toString()
  const rewritten = rewriteHtml(html, finalUrl)

  return new Response(rewritten, {
    status: upstream.status,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      'x-psbx-final-url': finalUrl,
    },
  })
}
