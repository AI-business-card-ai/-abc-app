import { fixtureTransport, json, text, type FixtureRoute } from './transport'

/**
 * A structured exhibitor feed shaped like one an organiser could license —
 * FIXTURE, not MEDICA's data.
 *
 * Every company below is invented, every domain is `.invalid`, and nothing was
 * read from medica-tradefair.com (whose robots.txt disallows the directory).
 * The records are shaped to exercise the engine: a clean listing, a combined
 * "Hall 12 / D18" location, an unparseable one, contact details that must be
 * scrubbed, rows with no name and no id, one company under two legal forms
 * with one domain, and two same-named companies ABC must not merge.
 */

export const FIXTURE_ORIGIN = 'https://directory.medica-fixture.invalid'
export const FIXTURE_BASE = `${FIXTURE_ORIGIN}/api`

export type FixtureRecord = Record<string, unknown>

export function medicaFixtureRecords(): FixtureRecord[] {
  return [
    {
      exhibitorId: 'MX-1001',
      companyName: 'Helix Imaging Systems GmbH',
      website: 'https://www.helix-imaging.invalid',
      country: 'DE',
      profile: 'Diagnostic imaging systems for hospitals and clinics.',
      sectors: ['Imaging', 'Diagnostics'],
      hall: '10',
      stand: 'B21',
      productGroups: ['Medical equipment OEM', 'Diagnostic imaging'],
      products: ['CT scanner housings', 'MRI patient tables'],
      profileUrl: '/exhibitors/MX-1001',
      updatedAt: '2026-09-01',
    },
    {
      exhibitorId: 'MX-1002',
      companyName: 'Vitalis Healthcare AG',
      website: 'vitalis-healthcare.invalid',
      country: 'DE',
      profile: 'Patient monitoring and hospital IT.',
      sectors: ['Hospital IT'],
      hall: '13',
      stand: 'A10',
      productGroups: ['Patient monitoring'],
      products: ['Bedside monitors'],
      profileUrl: '/exhibitors/MX-1002',
    },
    {
      exhibitorId: 'MX-1003',
      companyName: 'Kessler Lab Automation',
      website: 'https://kessler-lab.invalid',
      country: 'CH',
      profile: 'Laboratory automation for diagnostics labs.',
      sectors: ['Laboratory equipment'],
      location: 'Hall 3 / F44',
      productGroups: ['Laboratory automation'],
      products: ['Sample handling robots'],
      profileUrl: '/exhibitors/MX-1003',
    },
    {
      exhibitorId: 'MX-1004',
      companyName: 'Nordlicht Medical',
      website: 'https://nordlicht-medical.invalid',
      country: 'DE',
      profile: 'Surgical lighting.',
      sectors: ['Surgery'],
      location: 'see hall plan',
      productGroups: ['Operating room equipment'],
      products: ['Surgical lights'],
      profileUrl: '/exhibitors/MX-1004',
    },
    {
      exhibitorId: 'MX-1005',
      companyName: 'Orbis Surgical Instruments',
      website: 'https://orbis-surgical.invalid',
      country: 'DE',
      profile: 'Surgical instruments. Contact Dr. Anna Berger at a.berger@orbis-surgical.invalid or +49 211 4560 1234.',
      // A field the map does not name: it must never reach ABC.
      contactPerson: { name: 'Dr. Anna Berger', email: 'a.berger@orbis-surgical.invalid', phone: '+49 211 4560 1234' },
      sectors: ['Surgery'],
      hall: '11',
      stand: 'C05',
      productGroups: ['Surgical instruments'],
      products: ['Forceps', 'Retractors'],
      profileUrl: '/exhibitors/MX-1005',
    },
    { exhibitorId: 'MX-1006', companyName: '', hall: '9', stand: 'Z99' },
    { companyName: 'Mystery Medical', hall: '9', stand: 'Z98' },
    {
      exhibitorId: 'MX-1008',
      companyName: 'Precisa Components Ltd',
      website: 'https://precisa-components.invalid',
      country: 'GB',
      profile: 'Machined aluminium housings and enclosures.',
      sectors: ['Components'],
      hall: '8a',
      stand: 'G12',
      productGroups: ['Components and assemblies'],
      products: ['Aluminium housings'],
      profileUrl: '/exhibitors/MX-1008',
    },
    {
      exhibitorId: 'MX-1009',
      companyName: 'Alpenmed Distribution AG',
      website: 'https://alpenmed.invalid',
      country: 'AT',
      profile: 'Distributor of medical devices in Austria and Switzerland.',
      sectors: ['Distribution'],
      hall: '15',
      stand: 'D02',
      productGroups: ['Distribution and trade'],
      products: ['Medical device distribution'],
      profileUrl: '/exhibitors/MX-1009',
    },
    {
      exhibitorId: 'MX-1010',
      companyName: 'Carevia Monitoring',
      website: 'https://carevia.invalid',
      country: 'FR',
      profile: 'Wearable patient monitoring.',
      sectors: ['Patient monitoring'],
      hall: '13',
      stand: 'B07',
      productGroups: ['Patient monitoring'],
      products: ['Wearable monitors'],
      profileUrl: '/exhibitors/MX-1010',
    },
    {
      exhibitorId: 'MX-1011',
      companyName: 'Sterilis Cleanroom Systems',
      website: 'https://sterilis.invalid',
      country: 'DE',
      profile: 'Cleanroom systems for medical device production.',
      sectors: ['Cleanroom'],
      hall: '8b',
      stand: 'K30',
      productGroups: ['Production equipment'],
      products: ['Cleanroom modules'],
      profileUrl: '/exhibitors/MX-1011',
    },
    {
      exhibitorId: 'MX-1012',
      companyName: 'Vitalis Healthcare GmbH',
      website: 'https://vitalis-healthcare.invalid/de',
      country: 'DE',
      profile: 'Patient monitoring and hospital IT.',
      sectors: ['Hospital IT'],
      hall: '13',
      stand: 'A10',
      productGroups: ['Patient monitoring'],
      products: ['Central stations'],
      profileUrl: '/exhibitors/MX-1012',
    },
    {
      exhibitorId: 'MX-1013',
      companyName: 'Aurora Diagnostics',
      country: 'DE',
      profile: 'Rapid tests.',
      sectors: ['Diagnostics'],
      hall: '3',
      stand: 'H01',
      productGroups: ['In-vitro diagnostics'],
      products: ['Rapid tests'],
    },
    {
      exhibitorId: 'MX-1014',
      companyName: 'Aurora Diagnostics',
      country: 'IT',
      profile: 'Clinical chemistry analysers.',
      sectors: ['Diagnostics'],
      hall: '1',
      stand: 'A01',
      productGroups: ['In-vitro diagnostics'],
      products: ['Chemistry analysers'],
    },
  ]
}

/** Invented exhibitors for scale runs: deterministic, `.invalid`, varied enough to match. */
export function generatedRecords(count: number, prefix = 'GX'): FixtureRecord[] {
  const sectors = ['Imaging', 'Diagnostics', 'Laboratory equipment', 'Surgery', 'Patient monitoring', 'Components', 'Hospital IT']
  const products = ['Imaging systems', 'Rapid tests', 'Lab robots', 'Surgical lights', 'Monitors', 'Aluminium housings', 'Software']
  const countries = ['DE', 'AT', 'CH', 'FR', 'IT', 'US', 'GB']
  return Array.from({ length: count }, (_, i) => ({
    exhibitorId: `${prefix}-${String(i + 1).padStart(5, '0')}`,
    companyName: `Synthetic Medical ${prefix} ${i + 1}`,
    website: `https://synthetic-${prefix.toLowerCase()}-${i + 1}.invalid`,
    country: countries[i % countries.length],
    profile: `${products[i % products.length]} for ${sectors[(i + 2) % sectors.length].toLowerCase()}.`,
    sectors: [sectors[i % sectors.length]],
    hall: String((i % 17) + 1),
    stand: `${String.fromCharCode(65 + (i % 8))}${(i % 60) + 1}`,
    productGroups: [sectors[(i + 1) % sectors.length]],
    products: [products[i % products.length]],
    profileUrl: `/exhibitors/${prefix}-${i + 1}`,
  }))
}

export const OPEN_ROBOTS = 'User-agent: *\nDisallow: /private/\n'

/**
 * The structure of medica-tradefair.com/robots.txt as read raw on 2026-09-22,
 * restated as fixture data (its rules, not its sitemaps or comments): two `*`
 * groups, the second disallowing the exhibitor search, and the directory
 * `/vis/` disallowed by name for AI crawlers. Not a live read.
 */
export const MEDICA_OBSERVED_ROBOTS = [
  'User-agent: *',
  'Disallow:  /kati-cgi/kati/',
  '',
  'User-agent: Screaming Frog SEO Spider',
  'Allow: /',
  '',
  ...['GPTBot', 'ClaudeBot', 'Google-Extended', 'PerplexityBot', 'ChatGPT-User'].flatMap((bot) => [`User-agent: ${bot}`, 'Disallow: /vis/', '']),
  'User-agent: *',
  'Disallow: /vis/v1/en/search',
  '',
].join('\n')

/** Serve records as the paged feed the MEDICA pilot configuration reads. */
export function directoryRoutes(
  records: () => FixtureRecord[],
  options: {
    base?: string
    pageSize: number
    robots?: string | FixtureRoute
    detail?: (record: FixtureRecord) => FixtureRoute | null
    pageOverride?: (page: number) => FixtureRoute | null
    maxPages?: number
  }
) {
  const base = options.base ?? FIXTURE_BASE
  const origin = new URL(base).origin
  const routes = new Map<string, FixtureRoute | (() => FixtureRoute)>()
  routes.set(`${origin}/robots.txt`, typeof options.robots === 'object' ? options.robots : text(options.robots ?? OPEN_ROBOTS))
  for (let page = 1; page <= (options.maxPages ?? 120); page++) {
    routes.set(`${base}/exhibitors?page=${page}&pageSize=${options.pageSize}`, () => {
      const override = options.pageOverride?.(page)
      if (override) return override
      const all = records()
      return json({ exhibitors: all.slice((page - 1) * options.pageSize, page * options.pageSize), page })
    })
  }
  if (options.detail) {
    for (const record of records()) {
      if (typeof record.exhibitorId !== 'string') continue
      routes.set(`${base}/exhibitors/${encodeURIComponent(record.exhibitorId)}`, () => {
        const current = records().find((r) => r.exhibitorId === record.exhibitorId) ?? record
        return options.detail?.(current) ?? { status: 404, headers: { 'content-type': 'text/plain' }, body: 'gone' }
      })
    }
  }
  return fixtureTransport(routes)
}
