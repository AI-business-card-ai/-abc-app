import { contentHash, normalizeDomain } from '@/lib/event-intelligence/normalize'
import type { FetchFailure, PoliteFetcher } from '@/lib/event-intelligence/sources/http'
import { extractPage, type PageContent } from '@/lib/event-intelligence/website/extract'

/**
 * Reading a company's own website — a few pages, chosen, not the whole site.
 *
 * The event directory says *who is there*. A company's site says *what they
 * actually do*, and almost all of that is on a handful of pages: the home
 * page, and the pages about products, solutions, industries, applications,
 * capabilities and the company itself. So that is what is read, and nothing
 * else:
 *
 *   * **Same site.** The host the owner gave, and its `www.` twin. Not other
 *     subdomains — a subdomain that is not `www` may be a different
 *     organisation — and never an off-site redirect.
 *   * **Chosen pages.** A link is followed only when its address or its text
 *     says it is one of the useful kinds. Login, cart, legal, privacy,
 *     careers, contact, news and files are never fetched; nor is anything
 *     with a query string, which is how faceted catalogues turn one page into
 *     ten thousand.
 *   * **Limits.** At most `maxPages` fetches (default 8, never more than 20),
 *     `maxDepth` links from the home page (default 2), and a time budget.
 *     The ceiling counts fetches, not useful pages, so a site cannot cost
 *     more than it is allowed to by being repetitive.
 *   * **Dedupe.** Addresses are compared after dropping fragments, tracking
 *     parameters and trailing slashes; pages are compared by content, so the
 *     same page under two addresses counts once as evidence.
 *   * **Polite.** Every request goes through the PoliteFetcher: robots.txt,
 *     pacing, timeouts, size limits, and a stop at the first 401/403/429 or
 *     challenge page.
 *
 * Contact and imprint pages are excluded on purpose even though they are
 * useful: they are where a site names its people, and ABC reads companies.
 */

export type PageKind =
  | 'home'
  | 'products'
  | 'services'
  | 'solutions'
  | 'industries'
  | 'applications'
  | 'capabilities'
  | 'about'

export type CrawledPage = {
  url: string
  retrievedAt: string
  kind: PageKind
  depth: number
  content: PageContent
  contentHash: string
}

export type CrawlSkip =
  | 'off_site'
  | 'excluded'
  | 'not_useful'
  | 'query_string'
  | 'file'
  | 'duplicate_url'
  | 'duplicate_content'
  | 'too_deep'
  | 'fetch_failed'

export type CrawlReport = {
  startUrl: string
  site: string | null
  fetches: number
  pagesKept: number
  skipped: Partial<Record<CrawlSkip, number>>
  errors: FetchFailure[]
  stoppedBy: 'page_limit' | 'time_budget' | 'host_stopped' | 'exhausted' | null
  durationMs: number
}

export type CrawlOptions = {
  fetcher: PoliteFetcher
  maxPages?: number
  maxDepth?: number
  timeBudgetMs?: number
  /** Milliseconds, for the budget. */
  clock?: () => number
}

export const CRAWL_DEFAULTS = { maxPages: 8, maxDepth: 2, timeBudgetMs: 40_000 } as const
export const CRAWL_HARD_MAX_PAGES = 20

const KIND_WORDS: [PageKind, RegExp][] = [
  ['products', /\b(products?|produkte?|portfolio|range|sortiment|catalog(ue)?)\b/i],
  ['solutions', /\b(solutions?|l(ö|oe)sungen)\b/i],
  ['services', /\b(services?|leistungen|dienstleistungen)\b/i],
  ['industries', /\b(industr(y|ies)|branchen?|markets?|m(ä|ae)rkte|sectors?)\b/i],
  ['applications', /\b(applications?|anwendungen|use[- ]cases?|einsatzgebiete)\b/i],
  ['capabilities', /\b(capabilit(y|ies)|competences?|kompetenzen|expertise|technolog(y|ies)|technologien|manufacturing|fertigung|production|produktion)\b/i],
  ['about', /\b(about([- ]us)?|company|unternehmen|(ü|ue)ber[- ]uns|who[- ]we[- ]are|profile)\b/i],
]

const EXCLUDED =
  /\b(log-?in|sign-?in|sign-?up|register|account|konto|cart|basket|warenkorb|checkout|kasse|privacy|datenschutz|imprint|impressum|legal|terms|agb|cookies?|careers?|jobs?|karriere|stellen|contact|kontakt|news|blog|press|presse|events?|termine|search|suche|sitemap|tag|author|feed|wp-admin|wp-login|download)\b/i

const FILE = /\.(pdf|jpe?g|png|gif|svg|webp|zip|rar|docx?|xlsx?|pptx?|mp4|mov|avi|mp3|css|js|xml|json|ics|txt)$/i

const TRACKING = /^(utm_\w+|gclid|fbclid|mc_[ce]id|ref|source)$/i

/** One address per page: no fragment, no tracking, no trailing slash, host folded. */
export function canonicalPageUrl(raw: string): string | null {
  try {
    const url = new URL(raw)
    url.hash = ''
    url.hostname = url.hostname.toLowerCase()
    for (const name of [...url.searchParams.keys()]) if (TRACKING.test(name)) url.searchParams.delete(name)
    url.searchParams.sort()
    if (url.pathname.length > 1 && url.pathname.endsWith('/')) url.pathname = url.pathname.replace(/\/+$/, '')
    return url.toString()
  } catch {
    return null
  }
}

/** The site a crawl stays on: the host minus `www.`. */
export function siteOf(raw: string): string | null {
  return normalizeDomain(raw)
}

export function onSite(url: URL, site: string): boolean {
  const host = url.hostname.toLowerCase().replace(/\.$/, '')
  return host === site || host === `www.${site}`
}

/** What kind of page a link leads to, from its path and its text, or null when it is not worth reading. */
export function pageKindOf(url: URL, text: string): PageKind | null {
  const path = decodeURIComponent(url.pathname).replace(/[-_/]+/g, ' ')
  if (EXCLUDED.test(path) || EXCLUDED.test(text)) return null
  for (const [kind, words] of KIND_WORDS) {
    if (words.test(path) || words.test(text)) return kind
  }
  return null
}

type Candidate = { url: string; kind: PageKind; depth: number; order: number }

export async function crawlCompanySite(
  website: string,
  options: CrawlOptions
): Promise<{ ok: true; pages: CrawledPage[]; report: CrawlReport } | { ok: false; code: FetchFailure | 'invalid_site'; report: CrawlReport }> {
  const clock = options.clock ?? (() => Date.now())
  const started = clock()
  const maxPages = Math.max(1, Math.min(options.maxPages ?? CRAWL_DEFAULTS.maxPages, CRAWL_HARD_MAX_PAGES))
  const maxDepth = Math.max(0, Math.min(options.maxDepth ?? CRAWL_DEFAULTS.maxDepth, 3))
  const budget = options.timeBudgetMs ?? CRAWL_DEFAULTS.timeBudgetMs
  const fetcher = options.fetcher

  const site = siteOf(website)
  const startUrl = site ? canonicalPageUrl(/^https?:\/\//i.test(website.trim()) ? website.trim() : `https://${website.trim()}`) : null
  const report: CrawlReport = {
    startUrl: startUrl ?? website,
    site,
    fetches: 0,
    pagesKept: 0,
    skipped: {},
    errors: [],
    stoppedBy: null,
    durationMs: 0,
  }
  const skip = (reason: CrawlSkip) => {
    report.skipped[reason] = (report.skipped[reason] ?? 0) + 1
  }
  const done = () => {
    report.durationMs = Math.max(0, Math.round(clock() - started))
    return report
  }

  if (!site || !startUrl) return { ok: false, code: 'invalid_site', report: done() }

  const scope = (url: URL) => onSite(url, site)
  const pages: CrawledPage[] = []
  const seenUrls = new Set<string>([startUrl])
  const seenContent = new Set<string>()
  const queue: Candidate[] = []
  let order = 0

  const consider = (href: string, text: string, depth: number) => {
    const canonical = canonicalPageUrl(href)
    if (!canonical) return
    let url: URL
    try {
      url = new URL(canonical)
    } catch {
      return
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return
    if (!onSite(url, site)) return skip('off_site')
    if (seenUrls.has(canonical)) return
    if (FILE.test(url.pathname)) return skip('file')
    if (url.search) return skip('query_string')
    if (depth > maxDepth) return skip('too_deep')
    const kind = pageKindOf(url, text)
    if (!kind) return skip(EXCLUDED.test(url.pathname) || EXCLUDED.test(text) ? 'excluded' : 'not_useful')
    seenUrls.add(canonical)
    queue.push({ url: canonical, kind, depth, order: order++ })
  }

  const read = async (url: string, kind: PageKind, depth: number): Promise<'kept' | 'duplicate' | FetchFailure> => {
    report.fetches++
    const result = await fetcher.get(url, 'html', { scope })
    if (!result.ok) {
      report.errors.push(result.code)
      skip('fetch_failed')
      return result.code
    }
    const finalCanonical = canonicalPageUrl(result.finalUrl) ?? url
    const content = extractPage(result.body, result.finalUrl)
    const hash = contentHash([content.title, content.headings, content.items, content.paragraphs])
    if (seenContent.has(hash)) {
      skip('duplicate_content')
      return 'duplicate'
    }
    seenContent.add(hash)
    seenUrls.add(finalCanonical)
    pages.push({ url: finalCanonical, retrievedAt: result.retrievedAt, kind, depth, content, contentHash: hash })
    report.pagesKept++
    if (!content.nofollow && depth < maxDepth) for (const link of content.links) consider(link.href, link.text, depth + 1)
    return 'kept'
  }

  const home = await read(startUrl, 'home', 0)
  if (home !== 'kept') return { ok: false, code: home === 'duplicate' ? 'not_found' : home, report: done() }

  while (queue.length > 0) {
    if (report.fetches >= maxPages) {
      report.stoppedBy = 'page_limit'
      break
    }
    if (clock() - started > budget) {
      report.stoppedBy = 'time_budget'
      break
    }
    if (report.errors.some((code) => code === 'host_stopped' || code === 'access_denied' || code === 'rate_limited' || code === 'protected')) {
      report.stoppedBy = 'host_stopped'
      break
    }

    // One page of each kind before a second of any: breadth of evidence beats depth.
    const perKind = new Map<PageKind, number>()
    for (const page of pages) perKind.set(page.kind, (perKind.get(page.kind) ?? 0) + 1)
    queue.sort(
      (a, b) =>
        (perKind.get(a.kind) ?? 0) - (perKind.get(b.kind) ?? 0) || a.depth - b.depth || a.order - b.order
    )
    const next = queue.shift() as Candidate
    await read(next.url, next.kind, next.depth)
  }
  if (!report.stoppedBy) report.stoppedBy = 'exhausted'

  return { ok: true, pages, report: done() }
}
