import { terms, termsOfAll } from '@/lib/event-intelligence/normalize'
import type { EventProduct } from '@/lib/event-intelligence/profile'
import { scrubContactDetails } from '@/lib/event-intelligence/sources/mapping'
import type { CompanyIntentProfile, MatchEvidence } from '@/lib/event-intelligence/types'
import type { CrawledPage, PageKind } from '@/lib/event-intelligence/website/crawl'

/**
 * ABC Product Brain V1 — what the owner's business is, as structure.
 *
 * Not a paragraph. A set of small facts — "we make precision aluminium
 * components", "medical equipment is an application", "OEMs are a customer
 * type" — each with the kind of statement it is and where it came from:
 *
 *   OWNER FACT     the owner typed it. Read live from intel_company_profiles and
 *                  intel_products; never copied, never overwritten by ABC.
 *   SOURCE FACT    a document the owner pointed ABC at says it — a heading on
 *                  their products page, a certification in their About text —
 *                  quoted, with the page and the moment it was read.
 *   ABC ANALYSIS   ABC concluded it, by a named rule, from statements it can
 *                  quote. "You make components for medical equipment, so
 *                  medical equipment manufacturers are likely customers" is an
 *                  analysis, and it says so.
 *
 * Deterministic throughout. URLs, titles, countries, certifications and the
 * page a phrase sits on are read, not guessed; there is no model in V1. The
 * interface an LLM layer would fill later is the same one: it may propose an
 * ANALYSIS with evidence, and it may never produce a SOURCE FACT, because a
 * source fact is a quotation and a model does not quote.
 *
 * Nothing ABC read or concluded changes matching until the owner confirms it
 * ("Looks right"). A confirmed fact keeps its origin: an inference the owner
 * agreed with is still an inference, and the matching explanation says so.
 *
 * Pure. No database, no network, no clock.
 */

export const BRAIN_VERSION = 'brain-v1'

export type BrainFactKind =
  | 'company_name'
  | 'summary'
  | 'country'
  | 'product'
  | 'service'
  | 'capability'
  | 'industry'
  | 'application'
  | 'customer_type'
  | 'supplier_need'
  | 'partner_type'
  | 'market'
  | 'certification'
  | 'material'
  | 'technology'

export const BRAIN_FACT_KINDS: BrainFactKind[] = [
  'company_name', 'summary', 'country',
  'product', 'service', 'capability',
  'industry', 'application',
  'customer_type', 'supplier_need', 'partner_type',
  'market', 'certification', 'material', 'technology',
]

export type FactOrigin = 'owner' | 'source' | 'analysis'
export type FactStatus = 'proposed' | 'confirmed' | 'rejected'

/** The rules ABC concludes by. Each is small enough to state in a sentence. */
export type AnalysisRule =
  /** "We sell/make/supply X" → X is an offering. */
  | 'offering_statement'
  /** "X for Y" → Y is an application. */
  | 'application_from_for'
  /** "looking for OEMs", "for medical device manufacturers" → a customer type. */
  | 'customer_type_phrase'
  /** "looking for distributors" → a partner type. */
  | 'partner_type_phrase'
  /** "… in DACH", "customers across Europe" → a market. */
  | 'market_phrase'
  /** DACH → Germany, Austria, Switzerland. A fixed table, not a judgement. */
  | 'region_expansion'
  /** Components for Y → manufacturers of Y are likely customers. */
  | 'components_imply_manufacturer_customers'

export const RULE_EXPLANATION: Record<AnalysisRule, string> = {
  offering_statement: 'You described this as something you sell or make.',
  application_from_for: 'You described what you make as being for this.',
  customer_type_phrase: 'You named this kind of company as who you sell to or want to meet.',
  partner_type_phrase: 'You named this kind of company as a partner you are looking for.',
  market_phrase: 'You named this region as one you work in or want to reach.',
  region_expansion: 'Part of a region you named.',
  components_imply_manufacturer_customers:
    'You make components for this application, so companies that build it could be customers. ABC’s reading, not a fact.',
}

export type BrainEvidence = {
  source: 'owner_profile' | 'owner_product' | 'owner_statement' | 'website' | 'document'
  /** Where in the source: 'what_we_sell', 'heading', 'meta description', … */
  field: string
  /** The words it rests on, verbatim and bounded. */
  quote: string
  url?: string
  pageKind?: PageKind
  retrievedAt?: string
}

export type BrainFact = {
  /** Present on stored facts. */
  id?: string
  kind: BrainFactKind
  value: string
  key: string
  origin: FactOrigin
  status: FactStatus
  basis: AnalysisRule | null
  evidence: BrainEvidence[]
}

// ── Keys and phrases ─────────────────────────────────────────────

/**
 * What makes two facts the same fact: the kind, and the comparable words of
 * the value. "Aluminium housings" and "aluminium housing" are one fact.
 */
export function factKey(kind: BrainFactKind, value: string): string {
  const words = terms(value).sort()
  return words.length > 0 ? `${kind}:${words.join(' ')}` : ''
}

const QUOTE_MAX = 240
/**
 * A quotation as it may be stored: bounded, and with email addresses and phone
 * numbers removed — a sentence can state a certification and name the person
 * to call in the same breath, and only the first is about the company.
 */
const quoteOf = (text: string) => {
  const t = (scrubContactDetails(text.replace(/\s+/g, ' ').trim()).text ?? '').trim()
  return t.length > QUOTE_MAX ? `${t.slice(0, QUOTE_MAX - 1)}…` : t
}

const capitalise = (text: string) => (text ? text[0].toUpperCase() + text.slice(1) : text)

/** Menu words and page furniture — never a fact about a company. */
const GENERIC = new Set([
  'home', 'start', 'startseite', 'overview', 'übersicht', 'uebersicht', 'products', 'our products', 'product overview',
  'all products', 'product range', 'solutions', 'our solutions', 'services', 'our services', 'industries',
  'applications', 'capabilities', 'competences', 'about', 'about us', 'our company', 'company', 'contact',
  'contact us', 'read more', 'learn more', 'more', 'more info', 'details', 'view all', 'see all', 'show more',
  'request a quote', 'get a quote', 'get in touch', 'download', 'downloads', 'news', 'back', 'next', 'previous',
  'menu', 'search', 'imprint', 'privacy', 'cookies', 'language', 'english', 'deutsch', 'mehr', 'mehr erfahren',
  'weiterlesen', 'kontakt', 'anfrage', 'zurück', 'weiter', 'why choose us', 'careers', 'jobs', 'faq', 'team',
  'history', 'quality', 'sustainability', 'references', 'partners', 'location', 'locations', 'sitemap',
])

/** A short phrase worth keeping as a fact: a name for something, not a sentence or a button. */
export function isFactPhrase(text: string): boolean {
  const t = text.trim()
  if (t.length < 3 || t.length > 80) return false
  const words = t.split(/\s+/)
  if (words.length > 8) return false
  if (/[.!?:;|©@]\s*$/.test(t) || /[?!|©@:]/.test(t)) return false
  if (/^\d[\d\s.,/-]*$/.test(t)) return false
  if (GENERIC.has(t.toLowerCase())) return false
  if (scrubContactDetails(t).removed) return false
  return terms(t).length > 0
}

// ── Lexicons: the deterministic part of reading a site ───────────

const CERTIFICATION =
  /\b(ISO\s?\d{4,5}(?::\s?\d{4})?|IATF\s?16949|AS\s?9100[A-D]?|EN\s?9100|FDA[- ]registered|GMP[- ]certified)\b/gi

const MATERIALS: [RegExp, string][] = [
  [/\balumin(i)?um\b/i, 'Aluminium'],
  [/\bstainless steel\b/i, 'Stainless steel'],
  [/\btitanium\b/i, 'Titanium'],
  [/\bcopper\b/i, 'Copper'],
  [/\bbrass\b/i, 'Brass'],
  [/\bmagnesium\b/i, 'Magnesium'],
  [/\bPEEK\b/, 'PEEK'],
  [/\bPTFE\b/, 'PTFE'],
  [/\bpolycarbonate\b/i, 'Polycarbonate'],
  [/\bcarbon fib(re|er)\b/i, 'Carbon fibre'],
  [/\btechnical ceramics?\b/i, 'Technical ceramics'],
  [/\bsilicone\b/i, 'Silicone'],
]

const CAPABILITIES: [RegExp, string][] = [
  [/\b5[- ]axis (CNC[- ])?(milling|machining)\b/i, '5-axis machining'],
  [/\bCNC[- ]machining\b/i, 'CNC machining'],
  [/\bCNC[- ]milling\b/i, 'CNC milling'],
  [/\bCNC[- ]turning\b/i, 'CNC turning'],
  [/\binjection mou?lding\b/i, 'Injection moulding'],
  [/\bdie[- ]casting\b/i, 'Die casting'],
  [/\bsheet metal\b/i, 'Sheet metal fabrication'],
  [/\blaser cutting\b/i, 'Laser cutting'],
  [/\blaser welding\b/i, 'Laser welding'],
  [/\banodi[sz]ing\b/i, 'Anodising'],
  [/\bsurface treatment\b/i, 'Surface treatment'],
  [/\badditive manufacturing\b/i, 'Additive manufacturing'],
  [/\b3D printing\b/i, '3D printing'],
  [/\bclean ?room (assembly|production|manufacturing)\b/i, 'Cleanroom assembly'],
  [/\bprecision engineering\b/i, 'Precision engineering'],
]

const INDUSTRIES: [RegExp, string][] = [
  [/\bmedical (technology|devices?|equipment)\b|\bmedtech\b/i, 'Medical technology'],
  [/\b(in[- ]vitro )?diagnostics\b/i, 'Diagnostics'],
  [/\blaborator(y|ies)\b/i, 'Laboratory'],
  [/\bpharmaceutical\b/i, 'Pharmaceutical'],
  [/\bautomotive\b/i, 'Automotive'],
  [/\baerospace\b/i, 'Aerospace'],
  [/\bsemiconductors?\b/i, 'Semiconductor'],
  [/\brobotics\b/i, 'Robotics'],
  [/\b(industrial )?automation\b/i, 'Automation'],
  [/\bpackaging\b/i, 'Packaging'],
  [/\bfood (and|&) beverage\b/i, 'Food and beverage'],
  [/\brail(way)?\b/i, 'Rail'],
  [/\brenewable energy\b|\benergy sector\b/i, 'Energy'],
  [/\bdefen[cs]e\b/i, 'Defence'],
]

/** Regions, and the fixed expansion of the ones that name several countries. */
const REGIONS: [RegExp, string][] = [
  [/\bDACH\b/, 'DACH'],
  [/\bBenelux\b/i, 'Benelux'],
  [/\bNordics?\b|\bScandinavia\b/i, 'Nordics'],
  [/\bGermany\b/i, 'Germany'],
  [/\bAustria\b/i, 'Austria'],
  [/\bSwitzerland\b/i, 'Switzerland'],
  [/\bEurope(an Union)?\b/i, 'Europe'],
  [/\bNorth America\b/i, 'North America'],
  [/\b(USA|United States)\b/, 'United States'],
  [/\bUnited Kingdom\b|\bUK\b/, 'United Kingdom'],
  [/\bChina\b/i, 'China'],
  [/\bworld-?wide\b|\bglobally\b/i, 'Worldwide'],
]

export const REGION_EXPANSION: Record<string, string[]> = {
  DACH: ['Germany', 'Austria', 'Switzerland'],
  Benelux: ['Belgium', 'Netherlands', 'Luxembourg'],
  Nordics: ['Denmark', 'Finland', 'Norway', 'Sweden'],
}

/** A market is named only where the text is about where the company sells. */
const MARKET_CUE = /\b(customers?|clients?|markets?|sell|sales|distribut\w*|serv(e|es|ing)|present|active|supply|supplying|reach|looking for|seeking)\b/i

const PARTNER_TYPE = /\b(distributors?|resellers?|dealers?|sales agents?|agents?|importers?|sales partners?|channel partners?)\b/i
const CUSTOMER_TYPE =
  /\b(OEMs?|original equipment manufacturers?|(?:[a-z-]+\s){0,3}(?:manufacturers|makers|producers|integrators|hospitals|clinics|laboratories|labs))\b/i
const COMPONENT_WORDS = /\b(components?|parts?|housings?|enclosures?|assembl(y|ies)|sub-?assembl(y|ies)|modules?)\b/i

// ── Fact building ────────────────────────────────────────────────

function fact(
  kind: BrainFactKind,
  value: string,
  origin: FactOrigin,
  evidence: BrainEvidence,
  basis: AnalysisRule | null = null
): BrainFact | null {
  const clean = value.replace(/\s+/g, ' ').trim()
  const key = factKey(kind, clean)
  if (!key) return null
  return {
    kind,
    value: clean,
    key,
    origin,
    status: origin === 'owner' ? 'confirmed' : 'proposed',
    basis: origin === 'analysis' ? basis : null,
    evidence: [{ ...evidence, quote: quoteOf(evidence.quote) }],
  }
}

/** Several derivations as one list: same (kind, key) is one fact, evidence pooled. */
export function combineFacts(...lists: BrainFact[][]): BrainFact[] {
  return collect(lists.flat())
}

/** Facts by (kind, key), evidence pooled, first value kept. Deterministic order. */
function collect(facts: (BrainFact | null)[]): BrainFact[] {
  const byKey = new Map<string, BrainFact>()
  for (const f of facts) {
    if (!f) continue
    const existing = byKey.get(f.key)
    if (!existing) {
      byKey.set(f.key, { ...f, evidence: [...f.evidence] })
      continue
    }
    for (const e of f.evidence) {
      if (existing.evidence.length >= 5) break
      if (!existing.evidence.some((x) => x.quote === e.quote && x.url === e.url)) existing.evidence.push(e)
    }
  }
  return [...byKey.values()]
}

// ── 1. Owner facts ───────────────────────────────────────────────

export type OwnerAccount = {
  company: string | null
  website: string | null
}

/**
 * What the owner typed, as facts. Always confirmed — the owner said it — and
 * always `owner`. Never stored in the brain tables: this is a view over the
 * profile and products that already exist.
 */
export function ownerFacts(
  profile: CompanyIntentProfile | null,
  products: Pick<EventProduct, 'id' | 'name' | 'description'>[] = [],
  account: OwnerAccount | null = null
): BrainFact[] {
  const out: (BrainFact | null)[] = []
  const add = (kind: BrainFactKind, value: string | null | undefined, field: string, source: BrainEvidence['source'] = 'owner_profile') => {
    if (!value || !value.trim()) return
    out.push(fact(kind, value, 'owner', { source, field, quote: value }))
  }

  add('company_name', profile?.companyName ?? account?.company, profile?.companyName ? 'company_name' : 'abc_profile.company')
  add('summary', profile?.whatWeDo, 'what_we_do')
  for (const v of profile?.whatWeSell ?? []) add('product', v, 'what_we_sell')
  for (const p of products) add('product', p.name, 'product', 'owner_product')
  for (const v of profile?.whatWeBuy ?? []) add('supplier_need', v, 'what_we_buy')
  for (const v of profile?.targetIndustries ?? []) add('industry', v, 'target_industries')
  for (const v of profile?.targetCompanyTypes ?? []) add('customer_type', v, 'target_company_types')
  for (const v of profile?.capabilities ?? []) add('capability', v, 'capabilities')
  for (const v of profile?.technologies ?? []) add('technology', v, 'technologies')
  for (const v of profile?.materials ?? []) add('material', v, 'materials')
  for (const v of profile?.certifications ?? []) add('certification', v, 'certifications')
  for (const v of profile?.geographies ?? []) add('market', v, 'geographies')
  return collect(out)
}

// ── 2. Interpreting what the owner wrote ─────────────────────────

/** Free text the owner wrote somewhere in ABC, and where. */
export type OwnerStatement = { field: string; text: string }

const OFFERING = /\bwe\s+(?:sell|make|manufacture|produce|supply|develop|design|build|provide|offer)\s+([^.;!?\n]+)/gi
const LOOKING = /\b(?:looking for|seeking|searching for|want to meet|would like to meet|we need)\s+([^.;!?\n]+)/gi
const LOOKING_ONCE = new RegExp(LOOKING.source, 'i')

function splitFor(phrase: string): { head: string; application: string | null } {
  const at = phrase.search(/\sfor\s/i)
  if (at < 0) return { head: phrase.trim(), application: null }
  const head = phrase.slice(0, at).trim()
  const tail = phrase.slice(at).replace(/^\s*for\s+(the\s+)?/i, '')
  // The application ends where the phrase turns into something else.
  const application = tail.split(/\s+(?:and|in|to|with|across|throughout|from)\s+|,/i)[0].trim()
  return { head, application: application && application.split(/\s+/).length <= 5 ? application : null }
}

function customerTypeValue(raw: string): string | null {
  let t = raw.trim().replace(/^(an?|the)\s+/i, '')
  t = t.replace(/\s+(customers?|clients?|buyers?|companies|firms)$/i, '').trim()
  if (/^OEMs?$/i.test(t) || /^original equipment manufacturers?$/i.test(t)) return 'OEMs'
  if (!t) return null
  return capitalise(t)
}

function regionFacts(text: string, evidence: BrainEvidence): BrainFact[] {
  const out: (BrainFact | null)[] = []
  for (const [pattern, region] of REGIONS) {
    if (!pattern.test(text)) continue
    out.push(fact('market', region, 'analysis', evidence, 'market_phrase'))
    for (const country of REGION_EXPANSION[region] ?? []) {
      out.push(fact('market', country, 'analysis', { ...evidence, quote: `${region} — ${evidence.quote}` }, 'region_expansion'))
    }
  }
  return collect(out)
}

/**
 * ABC's reading of the owner's own words. Every result is an ANALYSIS — the
 * owner wrote a sentence, ABC decided which part of it is a product and which
 * a market — and quotes the sentence it came from.
 */
export function interpretOwnerStatements(statements: OwnerStatement[]): BrainFact[] {
  const out: (BrainFact | null)[] = []

  for (const { field, text } of statements) {
    if (!text || !text.trim()) continue
    const evidenceFor = (quote: string): BrainEvidence => ({ source: 'owner_statement', field, quote })

    for (const match of text.matchAll(OFFERING)) {
      const sentence = match[0]
      const { head, application } = splitFor(match[1])
      if (isFactPhrase(head)) out.push(fact('product', capitalise(head), 'analysis', evidenceFor(sentence), 'offering_statement'))
      if (application && isFactPhrase(application)) {
        out.push(fact('application', capitalise(application), 'analysis', evidenceFor(sentence), 'application_from_for'))
      }
    }

    for (const match of text.matchAll(LOOKING)) {
      const sentence = match[0]
      // "OEM customers and distributors in DACH": the market is split off first.
      const body = match[1].split(/\s+(?:in|across|throughout)\s+/i)[0]
      for (const part of body.split(/\s*,\s*|\s+and\s+|\s+or\s+/i)) {
        const piece = part.trim()
        if (!piece) continue
        if (PARTNER_TYPE.test(piece)) {
          out.push(fact('partner_type', capitalise(piece.replace(/^(an?|the)\s+/i, '')), 'analysis', evidenceFor(sentence), 'partner_type_phrase'))
        } else if (CUSTOMER_TYPE.test(piece) || /\bcustomers?\b/i.test(piece)) {
          const value = customerTypeValue(piece)
          if (value && isFactPhrase(value)) out.push(fact('customer_type', value, 'analysis', evidenceFor(sentence), 'customer_type_phrase'))
        }
      }
      if (MARKET_CUE.test(sentence)) out.push(...regionFacts(sentence, evidenceFor(sentence)))
    }

    // Markets named in a sentence about where the company sells, outside "looking for".
    for (const sentence of text.split(/(?<=[.!?])\s+/)) {
      if (LOOKING_ONCE.test(sentence)) continue
      if (MARKET_CUE.test(sentence)) out.push(...regionFacts(sentence, evidenceFor(sentence.trim())))
    }
  }

  return collect(out)
}

// ── 3. Reading the owner's website ───────────────────────────────

const SECTION_KIND: Partial<Record<PageKind, BrainFactKind>> = {
  products: 'product',
  solutions: 'product',
  services: 'service',
  capabilities: 'capability',
  industries: 'industry',
  applications: 'application',
}

const MAX_PER_KIND: Record<BrainFactKind, number> = {
  company_name: 1, summary: 1, country: 1,
  product: 24, service: 12, capability: 16,
  industry: 12, application: 12,
  customer_type: 8, supplier_need: 8, partner_type: 6,
  market: 12, certification: 10, material: 10, technology: 10,
}

/**
 * Facts from pages ABC read. SOURCE FACTS where the page says the thing — a
 * heading on a products page, a certification in a paragraph — and a few
 * ANALYSES where a phrase has to be interpreted ("for medical device
 * manufacturers" names a customer type). Navigation and footers are never
 * evidence.
 */
export function extractFromWebsite(pages: CrawledPage[]): BrainFact[] {
  const out: (BrainFact | null)[] = []
  const home = pages.find((p) => p.kind === 'home') ?? pages[0]

  const at = (page: CrawledPage, field: string, quote: string): BrainEvidence => ({
    source: 'website',
    field,
    quote,
    url: page.url,
    pageKind: page.kind,
    retrievedAt: page.retrievedAt,
  })

  if (home) {
    const org = home.content.organization
    if (org?.name) out.push(fact('company_name', org.name, 'source', at(home, 'structured data', org.name)))
    else if (home.content.siteName) out.push(fact('company_name', home.content.siteName, 'source', at(home, 'site name', home.content.siteName)))
    const summary = home.content.metaDescription ?? org?.description
    if (summary) {
      const scrubbed = scrubContactDetails(summary).text
      if (scrubbed) out.push(fact('summary', scrubbed, 'source', at(home, home.content.metaDescription ? 'meta description' : 'structured data', scrubbed)))
    }
    if (org?.country) out.push(fact('country', org.country, 'source', at(home, 'structured data', org.country)))
  }

  for (const page of pages) {
    const sectionKind = SECTION_KIND[page.kind]
    const headings = page.content.headings.filter((h) => !h.inNav)
    const items = page.content.items.filter((i) => !i.inNav)
    const paragraphs = page.content.paragraphs.filter((p) => !p.inNav)

    // Names of things, on the page about those things.
    if (sectionKind) {
      for (const heading of headings) {
        if (heading.level === 1) continue // the page's own title: "Our products"
        if (!isFactPhrase(heading.text)) continue
        out.push(fact(sectionKind, heading.text, 'source', at(page, 'heading', heading.text)))
        const { application } = splitFor(heading.text)
        if (sectionKind === 'product' && application && isFactPhrase(application)) {
          out.push(fact('application', capitalise(application), 'analysis', at(page, 'heading', heading.text), 'application_from_for'))
        }
      }
      for (const item of items) {
        if (!isFactPhrase(item.text)) continue
        out.push(fact(sectionKind, item.text, 'source', at(page, 'list item', item.text)))
      }
    }

    // Lexicon facts, from anything the page states in its own text.
    const texts: { field: string; text: string }[] = [
      ...headings.map((h) => ({ field: 'heading', text: h.text })),
      ...items.map((i) => ({ field: 'list item', text: i.text })),
      ...paragraphs.map((p) => ({ field: 'paragraph', text: p.text })),
      ...(page.content.metaDescription ? [{ field: 'meta description', text: page.content.metaDescription }] : []),
    ]
    for (const { field, text } of texts) {
      for (const match of text.matchAll(CERTIFICATION)) {
        // "ISO 13485:2016" and "ISO 13485" are one certification; the year is in the quote.
        const value = match[1]
          .replace(/\s+/g, ' ')
          .replace(/:\s?\d{4}$/, '')
          .replace(/^(ISO|IATF|AS|EN)(\d)/i, '$1 $2')
          .toUpperCase()
          .replace('REGISTERED', 'registered')
          .replace('CERTIFIED', 'certified')
        out.push(fact('certification', value, 'source', at(page, field, text)))
      }
      for (const [pattern, value] of MATERIALS) if (pattern.test(text)) out.push(fact('material', value, 'source', at(page, field, text)))
      for (const [pattern, value] of CAPABILITIES) if (pattern.test(text)) out.push(fact('capability', value, 'source', at(page, field, text)))
      // Industries from sentences, not from a single word in a list — a menu of
      // every sector is not the company saying it serves them all.
      if (field === 'paragraph' || field === 'meta description' || page.kind === 'industries') {
        for (const [pattern, value] of INDUSTRIES) if (pattern.test(text)) out.push(fact('industry', value, 'source', at(page, field, text)))
      }
      if ((field === 'paragraph' || field === 'meta description') && MARKET_CUE.test(text)) {
        out.push(...regionFacts(text, at(page, field, text)))
      }
      if (field === 'paragraph' || field === 'meta description' || field === 'heading') {
        const customer = text.match(/\bfor\s+((?:[a-z-]+\s){0,3}(?:manufacturers|OEMs?|producers|makers|integrators|hospitals|clinics|laboratories))\b/i)
        if (customer) {
          const value = customerTypeValue(customer[1])
          if (value && isFactPhrase(value)) out.push(fact('customer_type', value, 'analysis', at(page, field, text), 'customer_type_phrase'))
        }
      }
    }
  }

  return capPerKind(collect(out))
}

function capPerKind(facts: BrainFact[]): BrainFact[] {
  const counts = new Map<BrainFactKind, number>()
  // Better-evidenced facts first, then the order they were read.
  const ranked = facts.map((f, i) => ({ f, i })).sort((a, b) => b.f.evidence.length - a.f.evidence.length || a.i - b.i)
  const kept = new Set<BrainFact>()
  for (const { f } of ranked) {
    const n = counts.get(f.kind) ?? 0
    if (n >= MAX_PER_KIND[f.kind]) continue
    counts.set(f.kind, n + 1)
    kept.add(f)
  }
  return facts.filter((f) => kept.has(f))
}

// ── 4. Analysis over facts ───────────────────────────────────────

/**
 * Conclusions that need more than one fact. V1 has one: somebody who makes
 * components for an application is plausibly supplying the companies that
 * build it. Stated as ABC's reading, with both facts quoted.
 */
export function inferFromFacts(facts: BrainFact[]): BrainFact[] {
  const usable = facts.filter((f) => f.status !== 'rejected')
  const components = usable.filter((f) => (f.kind === 'product' || f.kind === 'capability') && COMPONENT_WORDS.test(f.value))
  const applications = usable.filter((f) => f.kind === 'application')
  const out: (BrainFact | null)[] = []
  for (const application of applications) {
    const component = components[0]
    if (!component) break
    const value = `${capitalise(application.value.replace(/\s+(manufacturers|makers)$/i, ''))} manufacturers`
    out.push(
      fact(
        'customer_type',
        value,
        'analysis',
        { ...component.evidence[0], quote: `${component.value} · ${application.value}` },
        'components_imply_manufacturer_customers'
      )
    )
  }
  return collect(out)
}

// ── 5. The brain: owner facts, what ABC read, the owner's decisions ──

export type StoredBrainFact = BrainFact & { id: string }

/**
 * Everything ABC derived this time (from the website and the owner's text),
 * against what is stored:
 *
 *   * a fact the owner already typed is not proposed — they said it;
 *   * a stored decision stands — a confirmed fact stays confirmed, a rejected
 *     one stays rejected and is not proposed again;
 *   * a proposal no longer supported by anything ABC read is withdrawn;
 *   * a confirmed fact no longer supported is kept — the owner agreed with it,
 *     and one re-read of a website is not a reason to take that back.
 */
export function planBrainWrite(
  derived: BrainFact[],
  stored: StoredBrainFact[],
  owner: BrainFact[]
): { insert: BrainFact[]; update: StoredBrainFact[]; remove: string[] } {
  const ownerKeys = new Set(owner.map((f) => f.key))
  const storedByKey = new Map(stored.map((f) => [f.key, f]))
  const derivedKeys = new Set<string>()

  const insert: BrainFact[] = []
  const update: StoredBrainFact[] = []
  for (const f of derived) {
    if (f.origin === 'owner' || ownerKeys.has(f.key)) continue
    derivedKeys.add(f.key)
    const existing = storedByKey.get(f.key)
    if (!existing) {
      insert.push({ ...f, status: 'proposed' })
      continue
    }
    const sameEvidence = JSON.stringify(existing.evidence) === JSON.stringify(f.evidence)
    if (!sameEvidence && existing.status !== 'rejected') {
      // New evidence, same decision. Origin and basis are what this read concluded.
      update.push({ ...existing, evidence: f.evidence, origin: f.origin, basis: f.basis })
    }
  }

  const remove = stored
    .filter((f) => f.status === 'proposed' && (!derivedKeys.has(f.key) || ownerKeys.has(f.key)))
    .map((f) => f.id)

  return { insert, update, remove }
}

/** The brain as the owner sees it: their facts, then ABC's, rejected ones left out. */
export function assembleBrain(owner: BrainFact[], stored: StoredBrainFact[]): BrainFact[] {
  const ownerKeys = new Set(owner.map((f) => f.key))
  return [...owner, ...stored.filter((f) => f.status !== 'rejected' && !ownerKeys.has(f.key))]
}

// ── 6. Into matching ─────────────────────────────────────────────

/**
 * Which profile list a fact kind feeds. The engine is not changed; it is
 * handed a profile that also carries what the owner confirmed.
 */
const PROFILE_FIELD: Partial<Record<BrainFactKind, keyof CompanyIntentProfile>> = {
  product: 'whatWeSell',
  service: 'whatWeSell',
  capability: 'capabilities',
  industry: 'targetIndustries',
  application: 'targetIndustries',
  customer_type: 'targetCompanyTypes',
  supplier_need: 'whatWeBuy',
  market: 'geographies',
  certification: 'certifications',
  material: 'materials',
  technology: 'technologies',
}

export type TermOrigin = { origin: FactOrigin; kind: BrainFactKind; value: string; basis: AnalysisRule | null }

export type BrainProjection = {
  profile: CompanyIntentProfile
  /** Confirmed facts from the brain that were added to the profile. */
  contributed: BrainFact[]
  /** comparable term → where the owner side of a match got it. Owner beats source beats analysis. */
  termOrigins: Map<string, TermOrigin>
}

const RANK: Record<FactOrigin, number> = { owner: 0, source: 1, analysis: 2 }

/**
 * The profile the engine scores with: the owner's own, plus every brain fact
 * the owner confirmed. Proposed facts are left out — ABC's reading does not
 * move a single match until the owner has looked at it.
 */
export function projectBrainForMatching(profile: CompanyIntentProfile, facts: BrainFact[]): BrainProjection {
  const next: CompanyIntentProfile = {
    ...profile,
    whatWeSell: [...profile.whatWeSell],
    whatWeBuy: [...profile.whatWeBuy],
    targetIndustries: [...profile.targetIndustries],
    targetCompanyTypes: [...profile.targetCompanyTypes],
    capabilities: [...profile.capabilities],
    technologies: [...profile.technologies],
    materials: [...profile.materials],
    certifications: [...profile.certifications],
    geographies: [...profile.geographies],
  }
  const termOrigins = new Map<string, TermOrigin>()
  const note = (value: string, origin: TermOrigin) => {
    for (const term of terms(value)) {
      const existing = termOrigins.get(term)
      if (!existing || RANK[origin.origin] < RANK[existing.origin]) termOrigins.set(term, origin)
    }
  }

  /*
    The owner's own words first, so they win every tie — but only the ones the
    engine actually reads. `whatWeDo` feeds no signal, so a term that happens
    to appear in it did not come from it, and crediting it there would make
    the explanation say "you said" about a match the brain produced.
  */
  for (const f of ownerFacts(profile)) {
    if (f.kind === 'summary' || f.kind === 'company_name') continue
    note(f.value, { origin: 'owner', kind: f.kind, value: f.value, basis: null })
  }
  note(profile.whoWeWantToMeet ?? '', { origin: 'owner', kind: 'customer_type', value: profile.whoWeWantToMeet ?? '', basis: null })

  const contributed: BrainFact[] = []
  const ordered = [...facts]
    .filter((f) => f.origin !== 'owner' && f.status === 'confirmed')
    .sort((a, b) => RANK[a.origin] - RANK[b.origin] || a.key.localeCompare(b.key))
  for (const f of ordered) {
    const field = PROFILE_FIELD[f.kind]
    if (!field) continue
    const list = next[field] as string[]
    if (list.some((v) => v.toLowerCase() === f.value.toLowerCase())) continue
    list.push(f.value)
    contributed.push(f)
    note(f.value, { origin: f.origin, kind: f.kind, value: f.value, basis: f.basis })
  }

  return { profile: next, contributed, termOrigins }
}

/** The engine version stamped on matches: the engine, and the brain when it contributed. */
export function matchInputsVersion(engineVersion: string, projection: Pick<BrainProjection, 'contributed'>): string {
  return projection.contributed.length > 0 ? `${engineVersion}+${BRAIN_VERSION}` : engineVersion
}

/**
 * YOUR BUSINESS, beside TARGET FACTS and ABC ANALYSIS: for each owner term a
 * match rests on, whether the owner said it, their website said it, or ABC
 * read it into what they said.
 */
export function ownerSideOfMatch(
  evidence: MatchEvidence[],
  termOrigins: Map<string, TermOrigin>
): { term: string; origin: FactOrigin; value: string; basis: AnalysisRule | null }[] {
  const out: { term: string; origin: FactOrigin; value: string; basis: AnalysisRule | null }[] = []
  const seen = new Set<string>()
  for (const item of evidence) {
    const term = item.matchedTerm
    if (!term || seen.has(term)) continue
    seen.add(term)
    const origin = termOrigins.get(term)
    if (origin) out.push({ term, origin: origin.origin, value: origin.value, basis: origin.basis })
  }
  return out
}

// ── 7. What the owner is shown ───────────────────────────────────

export type BrainSectionId = 'make' | 'customers' | 'applications' | 'markets' | 'strengths'

export const BRAIN_SECTIONS: { id: BrainSectionId; label: string; kinds: BrainFactKind[] }[] = [
  { id: 'make', label: 'We make and sell', kinds: ['product', 'service', 'capability'] },
  { id: 'customers', label: 'Our typical customers', kinds: ['customer_type', 'industry', 'partner_type'] },
  { id: 'applications', label: 'Main applications', kinds: ['application'] },
  { id: 'markets', label: 'Markets', kinds: ['market'] },
  { id: 'strengths', label: 'What sets us apart', kinds: ['certification', 'material', 'technology'] },
]

export const ORIGIN_LABEL: Record<FactOrigin, string> = {
  owner: 'You said',
  source: 'From your website',
  analysis: 'ABC’s reading',
}

export type BrainSummaryItem = {
  id: string | null
  value: string
  origin: FactOrigin
  status: FactStatus
  label: string
}

export type BrainSummary = {
  companyName: string | null
  summary: string | null
  sections: { id: BrainSectionId; label: string; items: BrainSummaryItem[]; more: number }[]
  /** ABC's facts the owner has not looked at yet. */
  pending: number
  /** Whether there is anything beyond what the owner typed. */
  hasReading: boolean
}

export const SECTION_ITEM_LIMIT = 6

/** THIS IS HOW ABC UNDERSTANDS YOUR BUSINESS, as data. Owner facts first in every section. */
export function brainSummary(facts: BrainFact[]): BrainSummary {
  const visible = facts.filter((f) => f.status !== 'rejected')
  const pick = (kind: BrainFactKind) =>
    visible.filter((f) => f.kind === kind).sort((a, b) => RANK[a.origin] - RANK[b.origin])[0] ?? null

  return {
    companyName: pick('company_name')?.value ?? null,
    summary: pick('summary')?.value ?? null,
    sections: BRAIN_SECTIONS.map(({ id, label, kinds }) => {
      const items = visible
        .filter((f) => kinds.includes(f.kind))
        .sort((a, b) => RANK[a.origin] - RANK[b.origin] || kinds.indexOf(a.kind) - kinds.indexOf(b.kind))
        .map((f) => ({ id: f.id ?? null, value: f.value, origin: f.origin, status: f.status, label: ORIGIN_LABEL[f.origin] }))
      return { id, label, items: items.slice(0, SECTION_ITEM_LIMIT), more: Math.max(0, items.length - SECTION_ITEM_LIMIT) }
    }).filter((section) => section.items.length > 0),
    pending: visible.filter((f) => f.origin !== 'owner' && f.status === 'proposed').length,
    hasReading: visible.some((f) => f.origin !== 'owner'),
  }
}

// ── 8. Learning, later ───────────────────────────────────────────

/**
 * Feedback the product will one day collect about a suggestion. Declared so
 * the shape is settled; nothing records or acts on it in V1.
 *
 * The rule for whoever builds it: a signal is evidence, never an edit. One
 * "wrong industry" does not remove an industry from anybody's business, and
 * no count of them changes a confirmed fact without the owner confirming the
 * change — the same "Looks right" every other brain fact goes through.
 */
export type BrainFeedbackSignal =
  | 'relevant'
  | 'not_relevant'
  | 'good_customer'
  | 'wrong_customer_type'
  | 'wrong_industry'
  | 'already_working_with_them'
  | 'met'
  | 'opportunity'
  | 'crm_outcome'

/** Every comparable term of a set of facts. Used to find which facts a match leaned on. */
export function termsOfFacts(facts: BrainFact[]): string[] {
  return termsOfAll(facts.map((f) => f.value))
}
