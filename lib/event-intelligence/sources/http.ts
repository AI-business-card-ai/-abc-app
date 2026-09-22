import { lookup } from 'node:dns/promises'
import {
  ALLOW_ALL,
  DISALLOW_ALL,
  parseRobots,
  robotsDecision,
  type RobotsPolicy,
} from '@/lib/event-intelligence/sources/robots'

/**
 * The one way the Event Data Engine and the website reader touch the network.
 *
 * Polite by construction, and there is no switch that makes it otherwise:
 *
 *   * **Public hosts only.** http/https, no credentials in the URL, and never a
 *     loopback, private, link-local or otherwise internal address — checked on
 *     the literal and again on what the name resolves to, on every redirect
 *     hop. An owner can hand ABC a website address; that must never become a
 *     way to make ABC's servers fetch something inside a network.
 *   * **robots.txt is obeyed.** Read once per origin. Missing (404/410) means
 *     no rules; forbidden (401/403) or unreadable (5xx, timeout) means ABC does
 *     not crawl that origin at all. Crawl-delay is honoured in full.
 *   * **Slow.** One request at a time per host, spaced by the larger of a
 *     minimum interval and the site's crawl-delay.
 *   * **Bounded.** A timeout over headers and body together, a byte ceiling
 *     read as a stream, a content-type allowlist, a redirect ceiling.
 *   * **It stops when told to.** 401, 403, 429 or a challenge page stops every
 *     further request to that host for the life of this fetcher. No retry, no
 *     second user agent, no proxy, no header games — ABC does not get past a
 *     door that was closed on purpose.
 *
 * It identifies itself honestly: one User-Agent, configurable, never rotated.
 *
 * Every failure is a code. Nothing here returns or logs a message that could
 * carry a URL's query string or a response body.
 */

export type Transport = (url: string, init: RequestInit) => Promise<Response>

export type FetchFailure =
  | 'invalid_url'
  | 'unsupported_scheme'
  | 'credentials_in_url'
  | 'private_address'
  | 'dns_failed'
  | 'out_of_scope'
  | 'robots_disallowed'
  | 'robots_ai_opt_out'
  | 'robots_unavailable'
  | 'host_stopped'
  | 'timeout'
  | 'network_error'
  | 'access_denied'
  | 'rate_limited'
  | 'protected'
  | 'not_found'
  | 'http_error'
  | 'unsupported_content_type'
  | 'too_large'
  | 'too_many_redirects'

export type Accept = 'html' | 'json' | 'text'

export type FetchPolicy = {
  userAgent: string
  timeoutMs: number
  maxBytes: number
  maxRedirects: number
  /** Floor between two requests to one host. Crawl-delay raises it, never lowers it. */
  minIntervalMs: number
}

export const DEFAULT_USER_AGENT = 'ABCEventIntelligence/1.0'

export function defaultFetchPolicy(env: Record<string, string | undefined> = process.env): FetchPolicy {
  const agent = (env.ABC_CRAWLER_USER_AGENT ?? '').trim()
  return {
    userAgent: agent || DEFAULT_USER_AGENT,
    timeoutMs: 8000,
    maxBytes: 1_500_000,
    maxRedirects: 3,
    minIntervalMs: 1000,
  }
}

const CONTENT_TYPES: Record<Accept, (type: string) => boolean> = {
  html: (t) => t === 'text/html' || t === 'application/xhtml+xml',
  json: (t) => t === 'application/json' || t === 'text/json' || t.endsWith('+json'),
  text: (t) => t === 'text/plain',
}

export type FetchOk = {
  ok: true
  url: string
  finalUrl: string
  status: number
  contentType: string
  body: string
  bytes: number
  retrievedAt: string
}

export type FetchFail = { ok: false; url: string; code: FetchFailure; status?: number }

export type FetchOutcome = FetchOk | FetchFail

/**
 * Whether robots.txt applies to a request.
 *
 * `obey` for anything a crawler would fetch — pages, directories, public JSON.
 * `api_terms` only for an authenticated API ABC has agreed terms with (an
 * organiser's licensed feed, a provider's account API), where robots.txt is
 * not the instrument that governs access and the agreement is. An adapter has
 * to declare it; nothing defaults to it.
 */
export type RobotsMode = 'obey' | 'api_terms'

export type RequestOptions = {
  /** Every hop, including redirects, must satisfy this, or the request stops. */
  scope?: (url: URL) => boolean
  headers?: Record<string, string>
  robots?: RobotsMode
}

export type FetcherStats = {
  requests: number
  robotsRequests: number
  refusedByRobots: number
  stoppedHosts: string[]
}

export type RobotsStatus = 'ok' | 'missing' | 'forbidden' | 'unavailable'

export interface PoliteFetcher {
  get(url: string, accept: Accept, options?: RequestOptions): Promise<FetchOutcome>
  /** Whether a URL may be fetched, and why — reads robots.txt, fetches nothing else. */
  checkRobots(url: string): Promise<{ allowed: boolean; status: RobotsStatus; rule: string | null; aiOptOut?: boolean }>
  readonly stats: FetcherStats
  readonly productToken: string
}

// ── Addresses ────────────────────────────────────────────────────

function ipv4Private(ip: string): boolean {
  const parts = ip.split('.').map(Number)
  if (parts.length !== 4 || parts.some((p) => !Number.isInteger(p) || p < 0 || p > 255)) return false
  const [a, b] = parts
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0 && parts[2] === 0) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  )
}

/** Loopback, private, link-local, CGNAT, multicast, reserved — anything not the public internet. */
export function isPrivateAddress(address: string): boolean {
  const ip = address.trim().toLowerCase().replace(/^\[|\]$/g, '')
  if (/^\d+\.\d+\.\d+\.\d+$/.test(ip)) return ipv4Private(ip)
  if (!ip.includes(':')) return false
  if (ip === '::' || ip === '::1') return true
  const mapped = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)
  if (mapped) return ipv4Private(mapped[1])
  if (/^f[cd]/.test(ip)) return true // fc00::/7 unique local
  if (/^fe[89ab]/.test(ip)) return true // fe80::/10 link-local
  if (/^ff/.test(ip)) return true // multicast
  return false
}

const INTERNAL_SUFFIXES = ['.local', '.localhost', '.internal', '.lan', '.home', '.corp', '.intranet']

/** Why a hostname is refused before anything is resolved, or null. */
export function hostRefusal(hostname: string): FetchFailure | null {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '')
  if (!host) return 'invalid_url'
  if (host === 'localhost') return 'private_address'
  if (INTERNAL_SUFFIXES.some((suffix) => host.endsWith(suffix))) return 'private_address'
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host) || host.includes(':')) return isPrivateAddress(host) ? 'private_address' : null
  // A name with no dot is a machine on somebody's network, not a website.
  if (!host.includes('.')) return 'private_address'
  return null
}

async function systemResolve(hostname: string): Promise<string[]> {
  const found = await lookup(hostname, { all: true, verbatim: true })
  return found.map((entry) => entry.address)
}

/** A URL ABC will fetch, or why not. */
export function checkUrl(raw: string): { ok: true; url: URL } | { ok: false; code: FetchFailure } {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return { ok: false, code: 'invalid_url' }
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return { ok: false, code: 'unsupported_scheme' }
  if (url.username || url.password) return { ok: false, code: 'credentials_in_url' }
  const refused = hostRefusal(url.hostname)
  if (refused) return { ok: false, code: refused }
  return { ok: true, url }
}

/**
 * A URL as it may be recorded: no fragment, and no query parameter whose name
 * suggests a credential. Provenance keeps where a fact came from, never a key
 * that let somebody read it.
 */
export function redactUrl(raw: string): string {
  try {
    const url = new URL(raw)
    url.hash = ''
    url.username = ''
    url.password = ''
    for (const name of [...url.searchParams.keys()]) {
      if (/token|key|secret|signature|sig|auth|password|pass|session|sid|credential/i.test(name)) url.searchParams.delete(name)
    }
    return url.toString()
  } catch {
    return ''
  }
}

// ── Challenge pages ──────────────────────────────────────────────

const CHALLENGE =
  /cf-chl|challenge-platform|verify (that )?you are (a )?human|are you a robot|captcha-delivery|px-captcha|ddos-guard|just a moment\.\.\./i

/** A page whose purpose is to keep automated readers out. ABC stops at it. */
export function looksLikeChallenge(status: number, body: string): boolean {
  if (CHALLENGE.test(body.slice(0, 20_000))) return true
  return (status === 403 || status === 429 || status === 503) && /captcha/i.test(body.slice(0, 20_000))
}

// ── Reading a body within a ceiling ──────────────────────────────

async function readCapped(response: Response, maxBytes: number, charset: string): Promise<{ text: string; bytes: number } | null> {
  const declared = Number(response.headers.get('content-length') ?? '')
  if (Number.isFinite(declared) && declared > maxBytes) return null
  if (!response.body) return { text: '', bytes: 0 }

  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let bytes = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    bytes += value.byteLength
    if (bytes > maxBytes) {
      await reader.cancel().catch(() => undefined)
      return null
    }
    chunks.push(value)
  }
  const all = new Uint8Array(bytes)
  let offset = 0
  for (const chunk of chunks) {
    all.set(chunk, offset)
    offset += chunk.byteLength
  }
  let decoder: TextDecoder
  try {
    decoder = new TextDecoder(charset || 'utf-8')
  } catch {
    decoder = new TextDecoder('utf-8')
  }
  return { text: decoder.decode(all), bytes }
}

// ── The fetcher ──────────────────────────────────────────────────

export type FetcherOptions = {
  transport?: Transport
  resolveHost?: (hostname: string) => Promise<string[]>
  /** Milliseconds, for pacing. */
  now?: () => number
  sleep?: (ms: number) => Promise<void>
  /** ISO timestamp, for provenance. */
  clock?: () => string
  policy?: Partial<FetchPolicy>
  /**
   * Treat a path a site has disallowed for named AI crawlers as disallowed for
   * ABC too. On by default; off only for a source with agreed terms.
   */
  honourAiOptOut?: boolean
}

export function createPoliteFetcher(options: FetcherOptions = {}): PoliteFetcher {
  const policy: FetchPolicy = { ...defaultFetchPolicy(), ...options.policy }
  const transport: Transport = options.transport ?? ((url, init) => fetch(url, init))
  const resolveHost = options.resolveHost ?? systemResolve
  const now = options.now ?? (() => Date.now())
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)))
  const clock = options.clock ?? (() => new Date().toISOString())
  const productToken = policy.userAgent.split(/[/\s]/)[0] || DEFAULT_USER_AGENT.split('/')[0]

  const stats: FetcherStats = { requests: 0, robotsRequests: 0, refusedByRobots: 0, stoppedHosts: [] }
  const stopped = new Map<string, FetchFailure>()
  const robotsCache = new Map<string, Promise<{ policy: RobotsPolicy; status: RobotsStatus }>>()
  const resolved = new Map<string, Promise<FetchFailure | null>>()
  const nextAt = new Map<string, number>()
  const intervalFor = new Map<string, number>()
  const chains = new Map<string, Promise<unknown>>()

  function stopHost(host: string, code: FetchFailure) {
    if (!stopped.has(host)) {
      stopped.set(host, code)
      stats.stoppedHosts.push(host)
    }
  }

  function addressCheck(hostname: string): Promise<FetchFailure | null> {
    const key = hostname.toLowerCase()
    let pending = resolved.get(key)
    if (!pending) {
      pending = (async () => {
        if (/^\d+\.\d+\.\d+\.\d+$/.test(key) || key.includes(':')) return isPrivateAddress(key) ? 'private_address' : null
        try {
          const addresses = await resolveHost(key)
          if (addresses.length === 0) return 'dns_failed'
          return addresses.some(isPrivateAddress) ? 'private_address' : null
        } catch {
          return 'dns_failed'
        }
      })()
      resolved.set(key, pending)
    }
    return pending
  }

  /** One request at a time per host, spaced. */
  function paced<T>(host: string, task: () => Promise<T>): Promise<T> {
    const previous = chains.get(host) ?? Promise.resolve()
    const run = previous.then(async () => {
      const wait = (nextAt.get(host) ?? 0) - now()
      if (wait > 0) await sleep(wait)
      try {
        return await task()
      } finally {
        nextAt.set(host, now() + (intervalFor.get(host) ?? policy.minIntervalMs))
      }
    })
    chains.set(host, run.catch(() => undefined))
    return run
  }

  /** A single HTTP exchange with a deadline over headers and body both. */
  async function exchange(
    url: URL,
    accept: Accept | 'robots',
    headers: Record<string, string>
  ): Promise<
    | { kind: 'redirect'; status: number; location: string | null }
    | { kind: 'response'; status: number; contentType: string; body: string | null; bytes: number }
    | { kind: 'error'; code: FetchFailure }
  > {
    const controller = new AbortController()
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      controller.abort()
    }, policy.timeoutMs)
    try {
      const response = await transport(url.toString(), {
        method: 'GET',
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          'User-Agent': policy.userAgent,
          Accept:
            accept === 'json'
              ? 'application/json'
              : accept === 'html'
                ? 'text/html,application/xhtml+xml'
                : 'text/plain',
          ...headers,
        },
      })
      if (response.status >= 300 && response.status < 400) {
        await response.body?.cancel().catch(() => undefined)
        return { kind: 'redirect', status: response.status, location: response.headers.get('location') }
      }
      const rawType = (response.headers.get('content-type') ?? '').toLowerCase()
      const contentType = rawType.split(';')[0].trim()
      const charset = rawType.match(/charset=([^;]+)/)?.[1]?.trim() ?? 'utf-8'
      const read = await readCapped(response, policy.maxBytes, charset)
      if (!read) return { kind: 'error', code: 'too_large' }
      return { kind: 'response', status: response.status, contentType, body: read.text, bytes: read.bytes }
    } catch {
      return { kind: 'error', code: timedOut ? 'timeout' : 'network_error' }
    } finally {
      clearTimeout(timer)
    }
  }

  function robotsFor(url: URL): Promise<{ policy: RobotsPolicy; status: RobotsStatus }> {
    const origin = url.origin
    let pending = robotsCache.get(origin)
    if (!pending) {
      pending = (async () => {
        let robotsUrl = new URL('/robots.txt', origin)
        const site = url.hostname.replace(/^www\./, '')
        let result: Awaited<ReturnType<typeof exchange>> = { kind: 'error', code: 'network_error' }
        /*
          RFC 9309 says to follow redirects. Followed only within the same site
          (http→https, bare→www and back): a robots.txt that points at another
          host is not that host's rules for this one, so it is treated as
          unreadable, which here means "do not crawl".
        */
        for (let hop = 0; hop <= policy.maxRedirects; hop++) {
          stats.robotsRequests++
          const target = robotsUrl
          result = await paced(target.host, () => exchange(target, 'robots', {}))
          if (result.kind !== 'redirect') break
          let next: URL
          try {
            next = new URL(result.location ?? '', robotsUrl)
          } catch {
            return { policy: DISALLOW_ALL, status: 'unavailable' as const }
          }
          const sameSite = next.hostname.replace(/^www\./, '') === site
          if (!result.location || !sameSite || !checkUrl(next.toString()).ok || (await addressCheck(next.hostname))) {
            return { policy: DISALLOW_ALL, status: 'unavailable' as const }
          }
          robotsUrl = next
        }
        if (result.kind === 'error' || result.kind === 'redirect') return { policy: DISALLOW_ALL, status: 'unavailable' as const }
        if (result.status === 404 || result.status === 410) return { policy: ALLOW_ALL, status: 'missing' as const }
        if (result.status === 401 || result.status === 403) return { policy: DISALLOW_ALL, status: 'forbidden' as const }
        if (result.status >= 200 && result.status < 300) {
          const parsed = parseRobots(result.body ?? '')
          return { policy: parsed, status: 'ok' as const }
        }
        return { policy: DISALLOW_ALL, status: 'unavailable' as const }
      })()
      robotsCache.set(origin, pending)
    }
    return pending
  }

  async function robotsAllows(url: URL): Promise<{ allowed: boolean; status: RobotsStatus; rule: string | null; aiOptOut?: boolean }> {
    const { policy: robots, status } = await robotsFor(url)
    const decision = robotsDecision(robots, productToken, url, { honourAiOptOut: options.honourAiOptOut !== false })
    if (decision.crawlDelaySeconds !== null) {
      intervalFor.set(url.host, Math.max(policy.minIntervalMs, decision.crawlDelaySeconds * 1000))
    }
    return { allowed: decision.allowed, status, rule: decision.rule, ...(decision.aiOptOut ? { aiOptOut: true } : {}) }
  }

  async function admissible(url: URL, options: RequestOptions): Promise<FetchFailure | null> {
    const literal = checkUrl(url.toString())
    if (!literal.ok) return literal.code
    if (options.scope && !options.scope(url)) return 'out_of_scope'
    const halted = stopped.get(url.host)
    if (halted) return 'host_stopped'
    const address = await addressCheck(url.hostname)
    if (address) return address
    if ((options.robots ?? 'obey') === 'obey') {
      const robots = await robotsAllows(url)
      if (!robots.allowed) {
        stats.refusedByRobots++
        if (robots.aiOptOut) return 'robots_ai_opt_out'
        return robots.status === 'ok' || robots.status === 'missing' ? 'robots_disallowed' : 'robots_unavailable'
      }
    }
    return null
  }

  async function get(raw: string, accept: Accept, options: RequestOptions = {}): Promise<FetchOutcome> {
    const first = checkUrl(raw)
    if (!first.ok) return { ok: false, url: raw, code: first.code }

    let current = first.url
    for (let hop = 0; hop <= policy.maxRedirects; hop++) {
      const refused = await admissible(current, options)
      if (refused) return { ok: false, url: raw, code: refused }

      stats.requests++
      const target = current
      const result = await paced(target.host, () => exchange(target, accept, options.headers ?? {}))

      if (result.kind === 'error') return { ok: false, url: raw, code: result.code }

      if (result.kind === 'redirect') {
        if (!result.location) return { ok: false, url: raw, code: 'http_error', status: result.status }
        let next: URL
        try {
          next = new URL(result.location, current)
        } catch {
          return { ok: false, url: raw, code: 'invalid_url' }
        }
        current = next
        continue
      }

      const { status, contentType, body, bytes } = result
      if (status === 401 || status === 403 || status === 429 || looksLikeChallenge(status, body ?? '')) {
        const code: FetchFailure = looksLikeChallenge(status, body ?? '')
          ? 'protected'
          : status === 429
            ? 'rate_limited'
            : 'access_denied'
        stopHost(current.host, code)
        return { ok: false, url: raw, code, status }
      }
      if (status === 404 || status === 410) return { ok: false, url: raw, code: 'not_found', status }
      if (status < 200 || status >= 300) return { ok: false, url: raw, code: 'http_error', status }
      if (!CONTENT_TYPES[accept](contentType)) return { ok: false, url: raw, code: 'unsupported_content_type', status }

      return {
        ok: true,
        url: raw,
        finalUrl: current.toString(),
        status,
        contentType,
        body: body ?? '',
        bytes,
        retrievedAt: clock(),
      }
    }
    return { ok: false, url: raw, code: 'too_many_redirects' }
  }

  return {
    get,
    async checkRobots(raw: string) {
      const checked = checkUrl(raw)
      if (!checked.ok) return { allowed: false, status: 'unavailable' as const, rule: null }
      const address = await addressCheck(checked.url.hostname)
      if (address) return { allowed: false, status: 'unavailable' as const, rule: null }
      return robotsAllows(checked.url)
    },
    stats,
    productToken,
  }
}
