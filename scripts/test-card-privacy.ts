/**
 * Public card privacy: an unpublished card is never readable through any public
 * address.
 *
 * Run with `npm run test:card-privacy` from the repository root.
 *
 * The public card routes read profiles with the service role, so row-level
 * security does not stand between them and an owner's contact details: each
 * route has to be its own rule. This pins that rule for every route an
 * anonymous visitor can reach, and runs the shared identity lookup against a
 * stub client with synthetic rows. HTTP-level checks against a running build
 * live outside the suite; this file needs no server.
 */
import fs from 'node:fs'
import path from 'node:path'

import { resolveAbcCardProfile } from '@/lib/card/abc-identity'

const ROOT = process.cwd()
let passed = 0
const failures: string[] = []

function check(label: string, got: unknown, want: unknown) {
  if (JSON.stringify(got) === JSON.stringify(want)) {
    passed++
    return
  }
  failures.push(`${label}\n     got:  ${JSON.stringify(got)}\n     want: ${JSON.stringify(want)}`)
}

const exists = (rel: string) => fs.existsSync(path.join(ROOT, rel))
// Line endings normalised: a Windows checkout writes CRLF, and the rules are about code, not bytes.
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n')
const code = (rel: string) =>
  read(rel)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')

/* ---------------------------------------------------------- synthetic rows */

const PUBLISHED = { id: '11111111-1111-4111-8111-111111111111', user_name: 'synthetic-open', card_slug: 'synthetic-open-card', card_published: true, full_name: 'Synthetic Open', email: 'open@example.test' }
const HIDDEN = { id: '22222222-2222-4222-8222-222222222222', user_name: 'synthetic-hidden', card_slug: null, card_published: false, full_name: 'Synthetic Hidden', email: 'hidden@example.test' }
const FORMER = { id: '33333333-3333-4333-8333-333333333333', user_name: 'synthetic-former', card_slug: 'synthetic-former-card', card_published: false, full_name: 'Synthetic Former', email: 'former@example.test' }
const ROWS: Record<string, unknown>[] = [PUBLISHED, HIDDEN, FORMER]

/** Just enough of the Supabase client for `from().select().eq().maybeSingle()`. */
function stubClient(rows: Record<string, unknown>[]) {
  const queries: { select: string; eq: [string, unknown][] }[] = []
  // Queries actually sent; a query that is built and then abandoned never leaves the server.
  const sent = { count: 0 }
  return {
    queries,
    sent,
    client: {
      from() {
        const q = { select: '', eq: [] as [string, unknown][] }
        queries.push(q)
        const chain = {
          select(cols: string) {
            q.select = cols
            return chain
          },
          eq(col: string, value: unknown) {
            q.eq.push([col, value])
            return chain
          },
          async maybeSingle() {
            sent.count++
            const found = rows.filter((row) => q.eq.every(([col, value]) => row[col] === value))
            return { data: found.length === 1 ? found[0] : null, error: null }
          },
        }
        return chain
      },
    },
  }
}

async function run() {
  /* ---------------------------------------------------- the shared lookup */

  const stub = stubClient(ROWS)
  const look = (identifier: string, ref: 'd' | 'u' | 'card') =>
    resolveAbcCardProfile(stub.client as never, identifier, ref).then((row) => (row ? (row as { full_name: string }).full_name : null))

  check(
    'L1 a published card resolves through every address',
    [await look('synthetic-open-card', 'd'), await look('synthetic-open', 'u'), await look(PUBLISHED.id, 'card')],
    ['Synthetic Open', 'Synthetic Open', 'Synthetic Open']
  )
  check(
    'L2 an unpublished card resolves through none of them',
    [await look('synthetic-hidden', 'u'), await look(HIDDEN.id, 'card')],
    [null, null]
  )
  check(
    'L3 nor does a card that was published and then unpublished',
    [await look('synthetic-former-card', 'd'), await look('synthetic-former', 'u'), await look(FORMER.id, 'card')],
    [null, null, null]
  )
  check(
    'L4 unknown identifiers resolve to nothing',
    [await look('nobody-here', 'u'), await look('44444444-4444-4444-8444-444444444444', 'card'), await look('no-such-card', 'd')],
    [null, null, null]
  )
  const before = stub.sent.count
  check('L5 a /card/ reference that is not a UUID is refused before any query is sent', [await look('not-a-uuid', 'card'), stub.sent.count - before], [null, 0])

  /* ---------------------------------------------------- the legacy pages */

  for (const [route, column] of [
    ['app/u/[username]/page.tsx', 'user_name'],
    ['app/card/[userId]/page.tsx', 'id'],
  ] as const) {
    const src = code(route)
    check(`P1 ${route} reads the publish state and nothing else`, [src.includes(".select('card_slug, card_published')"), src.includes(`.eq('${column}', `)], [true, true])
    check(
      `P2 ${route} renders and names no one`,
      /full_name|email|phone|photo|avatar|company|role|DigitalCardClient|generateMetadata/.test(src),
      false
    )
    check(`P3 ${route} redirects only a published card, to /d/`, src.includes('if (profile?.card_slug && profile.card_published) {\n    redirect(`/d/${profile.card_slug}`)'), true)
    check(`P4 ${route} answers anything else with a real 404`, [/\n  notFound\(\)\n\}\s*$/.test(src), /redirect\(`\/u\//.test(src)], [true, false])
    check(`P5 ${route} is never cached`, src.includes("export const dynamic = 'force-dynamic'"), true)
  }
  check('P6 both legacy segments show the existing card-not-found page', ['app/u/[username]/not-found.tsx', 'app/card/[userId]/not-found.tsx'].map((f) => exists(f) && code(f).includes("from '@/components/public/CardNotFound'")), [true, true])

  /* ---------------------------------------------------- every other public card route */

  const resolve = code('app/api/card/resolve/[slug]/route.ts')
  check('R1 the resolve API goes through the shared lookup and 404s without it', [resolve.includes('resolveAbcCardProfile('), resolve.includes("{ error: 'Card not found' }, { status: 404 }")], [true, true])
  check(
    'R2 the shared lookup applies the publish rule to every address, not only /d/',
    [code('lib/card/abc-identity.ts').includes('if (!data.card_published) return null'), /ref === 'd' && !data\.card_published/.test(code('lib/card/abc-identity.ts'))],
    [true, false]
  )
  check(
    'R3 the other anonymous card routes keep their publish gate',
    [
      code('app/d/[slug]/page.tsx').includes('loadPublishedCardBySlug'),
      code('app/api/card/og/[slug]/route.tsx').includes('card_published'),
      code('app/api/card/qr/[slug]/route.ts').includes('card_published'),
      code('app/api/card/vcard/[slug]/route.ts').includes('loadPublishedCardBySlug'),
      code('app/api/card/exchange/route.ts').includes(".eq('card_published', true)"),
      code('lib/card/public-data.ts').includes(".eq('card_published', true)"),
    ],
    [true, true, true, true, true, true]
  )

  const total = passed + failures.length
  if (failures.length) {
    console.log(`\nCard privacy: ${passed}/${total} PASS, ${failures.length} FAILED\n`)
    for (const failure of failures) console.log('  FAIL ' + failure)
    process.exit(1)
  }
  console.log(`\nCard privacy: ${passed}/${total} PASS`)
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})
