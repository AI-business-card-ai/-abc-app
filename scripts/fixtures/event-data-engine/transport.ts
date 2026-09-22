import type { Transport } from '@/lib/event-intelligence/sources/http'

/**
 * A network that exists only in the test: every URL ABC may ask for is a key,
 * and every request is recorded, so a test can say exactly what was fetched —
 * and, more often, what was not.
 *
 * MOCKED. Nothing here reaches the internet.
 */

export type FixtureRoute = {
  status?: number
  headers?: Record<string, string>
  body?: string | null
  /** Never answers; the fetcher's timeout has to end it. */
  hang?: boolean
}

export type RecordedRequest = { url: string; headers: Record<string, string> }

export function fixtureTransport(
  routes: Map<string, FixtureRoute | (() => FixtureRoute)> | Record<string, FixtureRoute | (() => FixtureRoute)>
): { transport: Transport; requests: RecordedRequest[]; pageRequests: () => RecordedRequest[] } {
  const table = routes instanceof Map ? routes : new Map(Object.entries(routes))
  const requests: RecordedRequest[] = []

  const transport: Transport = async (url, init) => {
    const headers = Object.fromEntries(Object.entries((init.headers ?? {}) as Record<string, string>))
    requests.push({ url, headers })
    const entry = table.get(url)
    const route = typeof entry === 'function' ? entry() : entry
    if (!route) return new Response('not found', { status: 404, headers: { 'content-type': 'text/plain' } })
    if (route.hang) {
      return new Promise<Response>((_, reject) => {
        init.signal?.addEventListener('abort', () => reject(new Error('aborted')))
      })
    }
    return new Response(route.body ?? null, { status: route.status ?? 200, headers: route.headers ?? {} })
  }

  return {
    transport,
    requests,
    pageRequests: () => requests.filter((r) => !r.url.endsWith('/robots.txt')),
  }
}

export const html = (body: string, extra: Record<string, string> = {}): FixtureRoute => ({
  status: 200,
  headers: { 'content-type': 'text/html; charset=utf-8', ...extra },
  body,
})

export const json = (value: unknown): FixtureRoute => ({
  status: 200,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(value),
})

export const text = (body: string, status = 200): FixtureRoute => ({
  status,
  headers: { 'content-type': 'text/plain' },
  body,
})

/** A resolver that answers every name with one public documentation address. */
export const publicResolver = async () => ['93.184.216.34']

/** A clock that moves only when the fetcher sleeps, so pacing is observable without waiting. */
export function virtualTime(start = 1_000_000) {
  let now = start
  const sleeps: number[] = []
  return {
    now: () => now,
    sleep: async (ms: number) => {
      sleeps.push(ms)
      now += ms
    },
    advance: (ms: number) => {
      now += ms
    },
    sleeps,
  }
}
