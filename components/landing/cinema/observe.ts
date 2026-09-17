/**
 * Shared IntersectionObservers for the landing's cinematic system.
 *
 * Every headline and every chapter on the page needs to know when it is on
 * screen. One observer per element would mean some forty observers doing the
 * same job; instead elements that ask for the same threshold and root margin
 * share one, and it disconnects itself when its last element leaves.
 *
 * No scroll listeners anywhere in this system — the browser reports
 * intersection changes, nothing polls.
 */

type Callback = (entry: IntersectionObserverEntry) => void

type Pool = {
  io: IntersectionObserver
  subs: Map<Element, Callback>
}

const pools = new Map<string, Pool>()

export function supportsObserver(): boolean {
  return typeof window !== 'undefined' && 'IntersectionObserver' in window
}

export function observe(
  el: Element,
  options: { threshold: number[]; rootMargin?: string },
  callback: Callback
): () => void {
  if (!supportsObserver()) return () => {}

  const rootMargin = options.rootMargin ?? '0px'
  const key = `${options.threshold.join(',')}|${rootMargin}`

  let pool = pools.get(key)
  if (!pool) {
    const subs = new Map<Element, Callback>()
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) subs.get(entry.target)?.(entry)
      },
      { threshold: options.threshold, rootMargin }
    )
    pool = { io, subs }
    pools.set(key, pool)
  }

  pool.subs.set(el, callback)
  pool.io.observe(el)

  const owner = pool
  let active = true
  return () => {
    if (!active) return
    active = false
    owner.subs.delete(el)
    owner.io.unobserve(el)
    if (owner.subs.size === 0) {
      owner.io.disconnect()
      pools.delete(key)
    }
  }
}

export const MOBILE_QUERY = '(max-width: 767px)'
export const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'

export function matches(query: string): boolean {
  return typeof window !== 'undefined' && window.matchMedia(query).matches
}
