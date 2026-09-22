import {
  JUDGMENTS,
  MISSED_REASONS,
  NOT_RELEVANT_REASONS,
  TOP_K,
  benchmarkHeadline,
  brainVersionOf,
  buildBenchmark,
  isPositive,
  nextUnreviewed,
  parseFeedback,
  parseMissed,
  type Judgment,
  type MatchFeedback,
  type MissedOpportunity,
  type NotRelevantReason,
  type RankedRecommendation,
} from '@/lib/event-intelligence/benchmark'
import {
  clearRecommendationFeedback,
  loadFeedbackForOwner,
  loadMissedOpportunities,
  recordMissedOpportunity,
  recordRecommendationFeedback,
} from '@/lib/event-intelligence/benchmark-data'
import type { MatchType } from '@/lib/event-intelligence/types'
import { pgClient, type SuiteContext } from './event-intelligence-engine-suite'

/**
 * AF. Mission Benchmark V1 and the feedback loop.
 *
 * Two halves. The arithmetic is checked against a fixture fair whose answers
 * were worked out by hand, because a benchmark that grades itself with the same
 * code that produced the numbers proves nothing. The isolation is checked
 * against real Postgres, as the actual `authenticated` and `anon` roles, so a
 * missing REVOKE or a policy that forgot a tenant fails here.
 *
 * The invariants this section exists to defend:
 *
 *   * an unreviewed recommendation is not a negative one;
 *   * a judgment changes no fact, no score and no relationship;
 *   * TARGET ≠ ENCOUNTER survives feedback;
 *   * a judgment keeps the version of matching that produced what was judged;
 *   * one owner's opinions are invisible to every other account.
 */

// ─────────────────────── the fixture fair ───────────────────────

/*
  Twenty-six recommendations, ranked as ABC ranked them, with the owner's
  answers written in. It is deliberately mixed: obvious customers at the top,
  a supplier and a partner among them, two false positives high in the list,
  a company already known, and six never reviewed at all — because the shape of
  a real review is partial, and the maths has to be right when it is.
*/
type Row = [name: string, type: MatchType, score: number, judgment: Judgment | null, reason: NotRelevantReason | null]

const FAIR: Row[] = [
  ['Certus Robotics', 'customer', 92, 'great', null],
  ['Halden Automation', 'customer', 88, 'great', null],
  ['Nordwerk Grippers', 'customer', 85, 'relevant', null],
  ['Alu-Tech Billets', 'supplier', 84, 'great', null],
  ['Meyer Systemtechnik', 'customer', 82, 'not_relevant', 'wrong_company_role'],
  ['Vogel Engineering', 'partner', 80, 'relevant', null],
  ['Braun Präzision', 'customer', 78, 'relevant', null],
  ['Systemhaus Nord', 'customer', 76, 'not_relevant', 'wrong_industry'],
  ['Kessler Automation', 'customer', 74, 'great', null],
  ['Lindemann Metals', 'supplier', 72, 'relevant', null],
  ['Trenka Robotics', 'customer', 70, 'relevant', null],
  ['Weber Kunststoff', 'customer', 68, 'not_relevant', 'wrong_market'],
  ['Orbit Integrators', 'partner', 66, 'relevant', null],
  ['Hoffman Tooling', 'supplier', 64, 'not_relevant', 'already_known'],
  ['Sauer Antriebe', 'customer', 62, 'great', null],
  ['Kranz Logistik', 'customer', 60, 'not_relevant', 'wrong_industry'],
  ['Pfeiffer Messtechnik', 'partner', 58, 'relevant', null],
  ['Dorn Handling', 'customer', 56, null, null],
  ['Elektro Sindl', 'customer', 54, null, null],
  ['Baumann Guss', 'supplier', 52, 'relevant', null],
  ['Novak Steuerungen', 'customer', 50, 'not_relevant', 'not_enough_evidence'],
  ['Reuter Robotik', 'customer', 48, null, null],
  ['Halm Oberflächen', 'supplier', 46, null, null],
  ['Zimmer Consulting', 'partner', 44, 'not_relevant', 'other'],
  ['Fabrik Digital', 'partner', 42, null, null],
  ['Stark Verpackung', 'customer', 40, null, null],
]

const ENGINE = 'deterministic-v1'

function fixture(engineFor: (index: number) => string = () => ENGINE) {
  const ranked: RankedRecommendation[] = FAIR.map(([, matchType, score], index) => ({
    matchId: `m${index + 1}`,
    matchType,
    score,
  }))
  const feedback: MatchFeedback[] = FAIR.flatMap(([, matchType, score, judgment, reason], index) =>
    judgment
      ? [
          {
            id: `f${index + 1}`,
            userId: 'owner',
            matchId: `m${index + 1}`,
            objectiveId: 'o1',
            eventId: 'e1',
            judgment,
            reason,
            note: null,
            matchType,
            matchScore: score,
            engineVersion: engineFor(index),
            brainVersion: brainVersionOf(engineFor(index)),
            createdAt: '2026-09-22T09:00:00Z',
            updatedAt: '2026-09-22T09:00:00Z',
          },
        ]
      : []
  )
  return { ranked, feedback }
}

const MISSED: MissedOpportunity[] = [
  { id: 'x1', userId: 'owner', objectiveId: 'o1', eventId: 'e1', presenceId: 'p90', reason: 'strong_customer', note: null, createdAt: '2026-09-22T10:00:00Z' },
  { id: 'x2', userId: 'owner', objectiveId: 'o1', eventId: 'e1', presenceId: 'p91', reason: 'strong_customer', note: null, createdAt: '2026-09-22T10:01:00Z' },
  { id: 'x3', userId: 'owner', objectiveId: 'o1', eventId: 'e1', presenceId: 'p92', reason: 'strategic', note: null, createdAt: '2026-09-22T10:02:00Z' },
]

// ─────────────────────────── the suite ───────────────────────────

export async function runBenchmarkSuite(ctx: SuiteContext): Promise<void> {
  const { check, code, rowsOf, asRole, refusal, OWNER, OTHER } = ctx

  // ══════════ AF. Mission Benchmark and the feedback loop ══════════

  // ── The vocabulary, and what it refuses to say ──

  check('AF1 three answers, and no fourth', JUDGMENTS, ['great', 'relevant', 'not_relevant'])
  check(
    'AF2 no judgment claims a meeting, a reply or a sale',
    JUDGMENTS.filter((j) => /met|contact|reply|replied|accepted|converted|won|sold/i.test(j)),
    []
  )
  check(
    'AF3 nor does the schema: the judgment check lists exactly the three',
    /judgment text NOT NULL CHECK \(judgment IN \('great', 'relevant', 'not_relevant'\)\)/.test(
      code('supabase/migrations/20260922120000_event_benchmark.sql')
    ),
    true
  )
  check('AF4 great and relevant both count as useful; not relevant does not', [isPositive('great'), isPositive('relevant'), isPositive('not_relevant')], [true, true, false])

  // ── What arrives from a screen ──

  check('AF5 a judgment is recorded', parseFeedback({ matchId: 'm1', judgment: 'great' }), {
    ok: true,
    value: { matchId: 'm1', judgment: 'great', reason: null, note: null },
  })
  check('AF6 an unknown judgment is refused', parseFeedback({ matchId: 'm1', judgment: 'excellent' }), {
    ok: false,
    error: 'That is not one of the three answers.',
  })
  check('AF7 a judgment with no recommendation is refused', parseFeedback({ judgment: 'great' }), {
    ok: false,
    error: 'Which recommendation?',
  })
  check('AF8 a reason explains a refusal and nothing else', parseFeedback({ matchId: 'm1', judgment: 'great', reason: 'wrong_market' }), {
    ok: false,
    error: 'A reason belongs with “Not relevant”.',
  })
  check(
    'AF9 with “not relevant” it is kept',
    parseFeedback({ matchId: 'm1', judgment: 'not_relevant', reason: 'wrong_industry' }),
    { ok: true, value: { matchId: 'm1', judgment: 'not_relevant', reason: 'wrong_industry', note: null } }
  )
  check('AF10 an invented reason is refused', parseFeedback({ matchId: 'm1', judgment: 'not_relevant', reason: 'vibes' }), {
    ok: false,
    error: 'That is not one of the reasons.',
  })
  check(
    'AF11 the reason is optional: a refusal with no reason is still a refusal',
    parseFeedback({ matchId: 'm1', judgment: 'not_relevant' }),
    { ok: true, value: { matchId: 'm1', judgment: 'not_relevant', reason: null, note: null } }
  )
  check(
    'AF12 a note is trimmed, and a very long one is refused rather than truncated',
    [
      parseFeedback({ matchId: 'm1', judgment: 'great', note: '  they buy this  ' }),
      (parseFeedback({ matchId: 'm1', judgment: 'great', note: 'x'.repeat(501) }) as { ok: boolean }).ok,
    ],
    [{ ok: true, value: { matchId: 'm1', judgment: 'great', reason: null, note: 'they buy this' } }, false]
  )
  check('AF13 a missed opportunity needs a company, and its reason is optional', [
    parseMissed({}),
    parseMissed({ presenceId: 'p1' }),
    (parseMissed({ presenceId: 'p1', reason: 'because' }) as { ok: boolean }).ok,
  ], [
    { ok: false, error: 'Which company?' },
    { ok: true, value: { presenceId: 'p1', reason: null, note: null } },
    false,
  ])
  check('AF14 the reasons are a small closed list, not a taxonomy', [NOT_RELEVANT_REASONS.length, MISSED_REASONS.length], [7, 6])

  // ── The arithmetic, against answers worked out by hand ──

  const { ranked, feedback } = fixture()
  const benchmark = buildBenchmark(ranked, feedback, MISSED)

  check(
    'AF15 what the owner said: 26 suggested, 20 reviewed, 5 great, 8 relevant, 7 not relevant',
    [benchmark.recommendations, benchmark.overall.reviewed, benchmark.overall.great, benchmark.overall.relevant, benchmark.overall.notRelevant],
    [26, 20, 5, 8, 7]
  )
  check('AF16 13 of the 20 were useful — 65% of what was reviewed', [benchmark.overall.positive, benchmark.overall.positiveRate], [13, 65])
  check('AF17 and the report says how much of the list that rests on', benchmark.coverage, 77)

  /*
    The rule the whole instrument depends on. Six recommendations were never
    looked at; they are absent from both sides of the fraction. Counting them as
    failures would make ABC improve by suggesting less.
  */
  const judgedIds = new Set(feedback.map((entry) => entry.matchId))
  const fewer = buildBenchmark(
    ranked.filter((item) => judgedIds.has(item.matchId)),
    feedback,
    MISSED
  )
  check(
    'AF18 an unreviewed suggestion is not a negative one: removing the six unreviewed moves no rate, only the coverage',
    [fewer.overall.reviewed, fewer.overall.positive, fewer.overall.positiveRate, fewer.coverage],
    [benchmark.overall.reviewed, benchmark.overall.positive, benchmark.overall.positiveRate, 100]
  )
  check(
    'AF19 nothing reviewed means no rate at all, rather than a zero',
    (() => {
      const empty = buildBenchmark(ranked, [], [])
      return [empty.overall.reviewed, empty.overall.positiveRate, empty.coverage]
    })(),
    [0, null, 0]
  )

  // ── Top-K: are the best suggestions good? ──

  check('AF20 the three slices are 5, 10 and 25', TOP_K, [5, 10, 25])
  const top = (k: number) => benchmark.topK.find((block) => block.k === k)
  check('AF21 top 5: all five reviewed, four useful, three of them great', [top(5)?.reviewed, top(5)?.positive, top(5)?.great, top(5)?.positiveRate], [5, 4, 3, 80])
  check('AF22 top 10: ten reviewed, eight useful', [top(10)?.reviewed, top(10)?.positive, top(10)?.positiveRate], [10, 8, 80])
  check(
    'AF23 top 25: the five unreviewed inside the slice are excluded, not counted against',
    [top(25)?.ranked, top(25)?.reviewed, top(25)?.positive, top(25)?.positiveRate],
    [25, 20, 13, 65]
  )
  check(
    'AF24 a slice counts only what is inside it: the 26th suggestion is in no block',
    benchmark.topK.every((block) => block.ranked <= block.k),
    true
  )
  check(
    'AF25 a fair smaller than the question says so rather than padding the denominator',
    (() => {
      const small = buildBenchmark(ranked.slice(0, 7), feedback, [])
      const block = small.topK.find((b) => b.k === 10)
      return [block?.complete, block?.ranked, block?.reviewed, small.topK.find((b) => b.k === 5)?.complete]
    })(),
    [false, 7, 7, true]
  )
  check(
    'AF26 a slice nobody has reviewed has no rate',
    buildBenchmark(ranked, [], []).topK.map((block) => block.positiveRate),
    [null, null, null]
  )

  // ── The direction ABC read, and why it was turned down ──

  check(
    'AF27 by direction: customers 7 of 12 useful, suppliers 3 of 4, partners 3 of 4',
    [
      [benchmark.byType.customer.positive, benchmark.byType.customer.reviewed, benchmark.byType.customer.positiveRate],
      [benchmark.byType.supplier.positive, benchmark.byType.supplier.reviewed],
      [benchmark.byType.partner.positive, benchmark.byType.partner.reviewed],
    ],
    [[7, 12, 58], [3, 4], [3, 4]]
  )
  check(
    'AF28 the directions add up to the whole, so nothing is counted twice or lost',
    ['customer', 'supplier', 'partner'].reduce((sum, type) => sum + benchmark.byType[type as MatchType].reviewed, 0),
    benchmark.overall.reviewed
  )
  check(
    'AF29 why suggestions were turned down, commonest first',
    benchmark.reasons,
    [
      { reason: 'wrong_industry', count: 2 },
      { reason: 'wrong_company_role', count: 1 },
      { reason: 'wrong_market', count: 1 },
      { reason: 'already_known', count: 1 },
      { reason: 'not_enough_evidence', count: 1 },
      { reason: 'other', count: 1 },
    ]
  )
  check('AF30 and the commonest is named', benchmark.topReason, 'wrong_industry')
  check(
    'AF31 the reasons account for every refusal, and only refusals',
    benchmark.reasons.reduce((sum, entry) => sum + entry.count, 0),
    benchmark.overall.notRelevant
  )

  // ── What ABC never showed them ──

  check('AF32 missed opportunities are counted apart from the recommendations', [benchmark.missed, benchmark.recommendations], [3, 26])
  check('AF33 and grouped by why they mattered', benchmark.missedReasons, [
    { reason: 'strong_customer', count: 2 },
    { reason: 'strategic', count: 1 },
  ])
  check(
    'AF34 a missed company never enters the positive rate — it was never suggested',
    buildBenchmark(ranked, feedback, []).overall,
    benchmark.overall
  )

  // ── Which version produced what was judged ──

  check('AF35 one version of matching across the sample, named', [benchmark.engineVersions, benchmark.mixedVersions], [[ENGINE], false])
  const mixed = buildBenchmark(ranked, fixture((i) => (i < 5 ? ENGINE : `${ENGINE}+brain-v1`)).feedback, [])
  check(
    'AF36 a sample spanning a change to matching is flagged, not averaged into one number',
    [mixed.engineVersions, mixed.mixedVersions],
    [[ENGINE, `${ENGINE}+brain-v1`], true]
  )
  check('AF37 the brain version is split out of the stamp when the brain contributed', [brainVersionOf(ENGINE), brainVersionOf(`${ENGINE}+brain-v1`)], [null, 'brain-v1'])

  // ── Reviewing in ABC's own order ──

  check('AF38 review starts at the top of the ranking', nextUnreviewed(ranked, feedback)?.matchId, 'm18')
  check('AF39 and stops when there is nothing left unjudged', nextUnreviewed(ranked.slice(0, 5), feedback), null)
  check(
    'AF40 the headline counts, and claims nothing beyond the count',
    [benchmarkHeadline(benchmark), benchmarkHeadline(buildBenchmark(ranked, [], []))],
    ['13 of 20 reviewed suggestions were useful.', 'Nothing reviewed yet.']
  )
  const benchmarkSource = `${code('lib/event-intelligence/benchmark.ts')}\n${code('components/event-intelligence/BenchmarkView.tsx')}`
  check(
    'AF41 nothing is called accuracy, precision, recall or confidence, because none of it is',
    /\b(accuracy|precision|recall|f1|confidence interval|statistically)\b/i.test(benchmarkSource),
    false
  )

  // ── Isolation, against real Postgres ──

  const { db } = await ctx.freshDatabase()
  await ctx.seedAccount(db, OWNER, 'owner')
  await ctx.seedAccount(db, OTHER, 'other')

  const eventId = (
    await rowsOf<{ id: string }>(
      db,
      "insert into public.intel_events (event_key, name, edition_year) values ('ambiente-2026', 'Ambiente 2026', 2026) returning id"
    )
  )[0].id
  const nextYear = (
    await rowsOf<{ id: string }>(
      db,
      "insert into public.intel_events (event_key, name, edition_year) values ('ambiente-2027', 'Ambiente 2027', 2027) returning id"
    )
  )[0].id

  const company = async (name: string) =>
    (
      await rowsOf<{ id: string }>(
        db,
        'insert into public.intel_companies (display_name, name_normalized) values ($1, $2) returning id',
        [name, name.toLowerCase()]
      )
    )[0].id

  const presence = async (event: string, name: string, hall = '5') =>
    (
      await rowsOf<{ id: string }>(
        db,
        'insert into public.intel_company_presences (event_id, company_id, exhibitor_display_name, hall) values ($1, $2, $3, $4) returning id',
        [event, await company(name), name, hall]
      )
    )[0].id

  const suggested = await presence(eventId, 'Certus Robotics')
  const alsoSuggested = await presence(eventId, 'Halden Automation')
  // In the dataset, never scored: the listing gave ABC nothing to match on.
  const unscored = await presence(eventId, 'Stumm Metallbau')
  const spareStand = await presence(eventId, 'Brandt Zerspanung')
  const nextYearStand = await presence(nextYear, 'Certus Robotics')

  const seedOwner = async (owner: string) => {
    const profile = (
      await rowsOf<{ id: string }>(
        db,
        "insert into public.intel_company_profiles (user_id, company_name, what_we_do) values ($1, 'Owner Co', 'CNC aluminium parts') returning id",
        [owner]
      )
    )[0].id
    const objective = (
      await rowsOf<{ id: string }>(
        db,
        "insert into public.intel_event_objectives (user_id, event_id, profile_id, goals) values ($1, $2, $3, 'Find robot makers') returning id",
        [owner, eventId, profile]
      )
    )[0].id
    const match = async (presenceId: string, type: string, score: number) =>
      (
        await rowsOf<{ id: string }>(
          db,
          'insert into public.intel_matches (user_id, objective_id, presence_id, match_type, score, engine_version) values ($1, $2, $3, $4, $5, $6) returning id',
          [owner, objective, presenceId, type, score, ENGINE]
        )
      )[0].id
    return {
      objective,
      first: await match(suggested, 'customer', 92),
      second: await match(alsoSuggested, 'customer', 71),
      // Left unjudged throughout, so a refusal check can tell a foreign key from a duplicate.
      spare: await match(spareStand, 'partner', 55),
    }
  }

  const mine = await seedOwner(OWNER)
  const theirs = await seedOwner(OTHER)

  const service = pgClient(ctx, db, 'service_role')
  const ownerClient = pgClient(ctx, db, 'authenticated', OWNER)
  const otherClient = pgClient(ctx, db, 'authenticated', OTHER)

  const recorded = await recordRecommendationFeedback(ownerClient, service, OWNER, {
    matchId: mine.first,
    judgment: 'great',
    reason: null,
    note: 'They machine exactly what we sell.',
  })
  check(
    'AF42 a judgment is recorded against the suggestion, stamped with what ABC had concluded',
    recorded.ok
      ? [recorded.value.judgment, recorded.value.matchType, recorded.value.matchScore, recorded.value.engineVersion, recorded.value.eventId === eventId]
      : recorded,
    ['great', 'customer', 92, ENGINE, true]
  )
  check(
    'AF43 another account’s suggestion is not found, rather than forbidden',
    await recordRecommendationFeedback(ownerClient, service, OWNER, { matchId: theirs.first, judgment: 'great', reason: null, note: null }),
    { ok: false, status: 404, error: 'No such recommendation.' }
  )

  await recordRecommendationFeedback(ownerClient, service, OWNER, { matchId: mine.second, judgment: 'not_relevant', reason: 'wrong_industry', note: null })
  check(
    'AF44 changing your mind replaces the answer; it does not add a second one',
    await (async () => {
      await recordRecommendationFeedback(ownerClient, service, OWNER, { matchId: mine.second, judgment: 'relevant', reason: null, note: null })
      const rows = await loadFeedbackForOwner(ownerClient, OWNER, mine.objective)
      const second = rows.find((row) => row.matchId === mine.second)
      return [rows.length, second?.judgment, second?.reason]
    })(),
    [2, 'relevant', null]
  )

  check(
    'AF45 taking a judgment back leaves the suggestion unreviewed, not negative',
    await (async () => {
      await clearRecommendationFeedback(service, OWNER, mine.second)
      const rows = await loadFeedbackForOwner(ownerClient, OWNER, mine.objective)
      return [rows.length, nextUnreviewed([{ matchId: mine.first }, { matchId: mine.second }], rows)?.matchId === mine.second]
    })(),
    [1, true]
  )

  // ── The other half: what ABC missed ──

  const flagged = await recordMissedOpportunity(ownerClient, service, OWNER, mine.objective, eventId, {
    presenceId: unscored,
    reason: 'strong_customer',
    note: null,
  })
  check(
    'AF46 a company ABC never scored can be flagged as missed',
    flagged.ok ? [flagged.value.presenceId === unscored, flagged.value.reason, flagged.value.eventId === eventId] : flagged,
    [true, 'strong_customer', true]
  )
  check(
    'AF47 a stand at next year’s edition cannot be flagged against this year’s mission',
    await recordMissedOpportunity(ownerClient, service, OWNER, mine.objective, eventId, { presenceId: nextYearStand, reason: null, note: null }),
    { ok: false, status: 404, error: 'That company is not exhibiting at this event.' }
  )
  check(
    'AF48 and the database refuses the same pairing, not only the route',
    await refusal(
      db,
      'service_role',
      'insert into public.intel_missed_opportunities (user_id, objective_id, event_id, presence_id) values ($1, $2, $3, $4)',
      [OWNER, mine.objective, eventId, nextYearStand]
    ),
    'foreign key'
  )
  check(
    'AF49 flagging the same company twice is one flag',
    await (async () => {
      await recordMissedOpportunity(ownerClient, service, OWNER, mine.objective, eventId, { presenceId: unscored, reason: 'strategic', note: null })
      const rows = await loadMissedOpportunities(ownerClient, OWNER, mine.objective)
      return [rows.length, rows[0]?.reason]
    })(),
    [1, 'strategic']
  )

  // ── What a judgment must never touch ──

  const snapshot = async () =>
    JSON.stringify([
      await rowsOf(db, 'select * from public.intel_matches order by id'),
      await rowsOf(db, 'select * from public.intel_company_presences order by id'),
      await rowsOf(db, 'select * from public.intel_companies order by id'),
      await rowsOf(db, 'select * from public.intel_source_records order by id'),
      await rowsOf(db, 'select * from public.intel_brain_facts order by id'),
      await rowsOf(db, 'select * from public.intel_company_profiles order by id'),
      await rowsOf(db, 'select * from public.scanned_contacts order by id'),
      await rowsOf(db, 'select * from public.contact_encounters order by id'),
      await rowsOf(db, 'select * from public.intel_meeting_targets order by id'),
      await rowsOf(db, 'select * from public.crm_opportunities order by id'),
    ])

  const before = await snapshot()
  await recordRecommendationFeedback(ownerClient, service, OWNER, { matchId: mine.second, judgment: 'not_relevant', reason: 'wrong_market', note: 'different segment' })
  await recordMissedOpportunity(ownerClient, service, OWNER, mine.objective, eventId, { presenceId: alsoSuggested, reason: null, note: null })
  check(
    'AF50 judging changes no source fact, no score, no brain fact, no contact, no encounter, no target and no CRM row',
    (await snapshot()) === before,
    true
  )
  check(
    'AF51 TARGET ≠ ENCOUNTER: a great target creates neither a contact nor an encounter',
    [
      await rowsOf<{ n: number }>(db, 'select count(*)::int as n from public.scanned_contacts where user_id = $1', [OWNER]).then((r) => r[0].n),
      await rowsOf<{ n: number }>(db, 'select count(*)::int as n from public.contact_encounters where user_id = $1', [OWNER]).then((r) => r[0].n),
      await rowsOf<{ n: number }>(db, 'select count(*)::int as n from public.intel_meeting_targets where user_id = $1', [OWNER]).then((r) => r[0].n),
    ],
    [1, 1, 0] // the one contact and encounter seedAccount made, and no target
  )

  // ── Reproducibility: the judgment keeps the version it judged ──

  await asRole(db, 'service_role', 'update public.intel_matches set score = 41, engine_version = $2 where id = $1', [mine.first, 'deterministic-v2'])
  const afterRetune = (await loadFeedbackForOwner(ownerClient, OWNER, mine.objective)).find((row) => row.matchId === mine.first)
  check(
    'AF52 re-running matching does not rewrite history: the judgment still names the score and version it was given for',
    [afterRetune?.matchScore, afterRetune?.engineVersion],
    [92, ENGINE]
  )
  check(
    'AF53 which is what makes a before-and-after possible at all',
    buildBenchmark(
      [{ matchId: mine.first, matchType: 'customer', score: 41 }],
      afterRetune ? [afterRetune] : []
    ).engineVersions,
    [ENGINE]
  )

  // ── Tenancy ──

  check(
    'AF54 another account reads none of it — not even by naming the owner’s id',
    [
      (await loadFeedbackForOwner(otherClient, OTHER, mine.objective)).length,
      (await loadFeedbackForOwner(otherClient, OWNER, mine.objective)).length,
      (await loadMissedOpportunities(otherClient, OWNER, mine.objective)).length,
    ],
    [0, 0, 0]
  )
  check(
    'AF55 a judgment cannot be filed against another account’s suggestion, whatever the route does',
    await refusal(
      db,
      'service_role',
      "insert into public.intel_match_feedback (user_id, match_id, objective_id, event_id, judgment, match_type, match_score, engine_version) values ($1, $2, $3, $4, 'great', 'customer', 90, 'x')",
      [OWNER, theirs.first, mine.objective, eventId]
    ),
    'foreign key'
  )
  check(
    'AF56 nor under another account’s mission',
    await refusal(
      db,
      'service_role',
      "insert into public.intel_match_feedback (user_id, match_id, objective_id, event_id, judgment, match_type, match_score, engine_version) values ($1, $2, $3, $4, 'great', 'customer', 90, 'x')",
      // A match of this owner's that carries no judgment yet, so the unique
      // constraint cannot answer before the foreign key does.
      [OWNER, mine.spare, theirs.objective, eventId]
    ),
    'foreign key'
  )

  for (const table of ['intel_match_feedback', 'intel_missed_opportunities']) {
    check(
      `AF57 ${table}: the owner may read their own rows and write none of them`,
      [
        (await asRole(db, 'authenticated', `select id from public.${table} where user_id = $1`, [OWNER], OWNER)).rows.length > 0,
        await refusal(db, 'authenticated', `update public.${table} set user_id = $1`, [OTHER], OWNER),
        await refusal(db, 'authenticated', `delete from public.${table}`, [], OWNER),
      ],
      [true, 'permission denied', 'permission denied']
    )
    check(
      `AF58 ${table}: anon has nothing at all`,
      [await refusal(db, 'anon', `select * from public.${table}`), await refusal(db, 'anon', `insert into public.${table} (user_id) values ($1)`, [OWNER])],
      ['permission denied', 'permission denied']
    )
    check(
      `AF59 ${table}: row-level security is on`,
      (await rowsOf<{ relrowsecurity: boolean }>(db, 'select relrowsecurity from pg_class where relname = $1', [table]))[0]?.relrowsecurity,
      true
    )
  }

  check(
    'AF60 the owner’s own client cannot insert a judgment naming a score ABC never gave',
    await refusal(
      db,
      'authenticated',
      "insert into public.intel_match_feedback (user_id, match_id, objective_id, event_id, judgment, match_type, match_score, engine_version) values ($1, $2, $3, $4, 'great', 'customer', 100, 'made-up')",
      [OWNER, mine.first, mine.objective, eventId],
      OWNER
    ),
    'permission denied'
  )

  // ── What the database itself refuses ──

  check(
    'AF61 an invented judgment is refused by the database too',
    await refusal(
      db,
      'service_role',
      "insert into public.intel_match_feedback (user_id, match_id, objective_id, event_id, judgment, match_type, match_score, engine_version) values ($1, $2, $3, $4, 'converted', 'customer', 90, 'x')",
      [OWNER, mine.first, mine.objective, eventId]
    ),
    'check'
  )
  check(
    'AF62 a reason on a positive judgment is refused',
    await refusal(
      db,
      'service_role',
      "insert into public.intel_match_feedback (user_id, match_id, objective_id, event_id, judgment, reason, match_type, match_score, engine_version) values ($1, $2, $3, $4, 'great', 'wrong_market', 'customer', 90, 'x')",
      [OWNER, mine.first, mine.objective, eventId]
    ),
    'check'
  )
  check(
    'AF63 a score outside 0–100 is refused',
    await refusal(
      db,
      'service_role',
      "insert into public.intel_match_feedback (user_id, match_id, objective_id, event_id, judgment, match_type, match_score, engine_version) values ($1, $2, $3, $4, 'great', 'customer', 140, 'x')",
      [OWNER, mine.first, mine.objective, eventId]
    ),
    'check'
  )

  // ── Editions stay apart ──

  check(
    'AF64 feedback is filed under the edition it was given on, and a second edition is a second mission',
    await (async () => {
      const rows = await rowsOf<{ event_id: string }>(db, 'select event_id::text from public.intel_match_feedback where user_id = $1', [OWNER])
      return rows.every((row) => row.event_id === eventId)
    })(),
    true
  )

  // ── Account deletion ──

  await asRole(db, 'service_role', 'delete from public.abc_profiles where id = $1', [OWNER])
  check(
    'AF65 deleting the account takes the judgments and the flags with it',
    [
      (await rowsOf<{ n: number }>(db, 'select count(*)::int as n from public.intel_match_feedback where user_id = $1', [OWNER]))[0].n,
      (await rowsOf<{ n: number }>(db, 'select count(*)::int as n from public.intel_missed_opportunities where user_id = $1', [OWNER]))[0].n,
      (await rowsOf<{ n: number }>(db, 'select count(*)::int as n from public.intel_match_feedback where user_id = $1', [OTHER]))[0].n,
    ],
    [0, 0, 0]
  )

  // ── No silent learning, and no new front door ──

  const matchingSource = `${code('lib/event-intelligence/scoring.ts')}\n${code('lib/event-intelligence/product-brain.ts')}\n${code('lib/event-intelligence/brain-data.ts')}\n${code('lib/event-intelligence/mission.ts')}`
  check(
    'AF66 matching and the Product Brain never read feedback: one click does not retune anything',
    /intel_match_feedback|intel_missed_opportunities|buildBenchmark|recordRecommendationFeedback/.test(matchingSource),
    false
  )
  const benchmarkWriters = `${code('lib/event-intelligence/benchmark-data.ts')}\n${code('app/api/event-intelligence/feedback/route.ts')}\n${code('app/api/event-intelligence/missed/route.ts')}`
  check(
    'AF67 and feedback writes nowhere else: not to the graph, not to a brain fact, not to a match',
    /from\('(scanned_contacts|contact_encounters|scan_batches|crm_[a-z_]+|intel_matches|intel_companies|intel_company_presences|intel_source_records|intel_brain_facts|intel_meeting_targets)'\)[\s\S]{0,200}\.(insert|upsert|update|delete)\(/.test(
      benchmarkWriters
    ),
    false
  )
  check(
    'AF68 both routes are behind the feature flag, and take the owner from the session',
    ['app/api/event-intelligence/feedback/route.ts', 'app/api/event-intelligence/missed/route.ts'].filter((file) => {
      const source = code(file)
      return !source.includes('requireEventIntelligence()') || !source.includes('guard.context')
    }),
    []
  )
  check(
    'AF69 the benchmark is owner-only progressive disclosure: no navigation item anywhere',
    /benchmark/i.test(
      [
        'components/layout/AppShell.tsx',
        'components/layout/MobileNav.tsx',
        'components/layout/DesktopSidebar.tsx',
        'components/layout/AppHeader.tsx',
      ]
        .map((file) => code(file))
        .join('\n')
    ),
    false
  )
  check(
    'AF70 Expo Mission is untouched: one card, one action, and no feedback on it',
    /Benchmark|RelevanceFeedback|feedback/.test(`${code('components/event-intelligence/ExpoMissionCard.tsx')}\n${code('components/event-intelligence/MissionView.tsx')}`),
    false
  )
  check(
    'AF71 the feedback control is secondary where it does appear: after the reasoning, never above it',
    (() => {
      const detail = code('components/event-intelligence/MatchDetailView.tsx')
      return detail.indexOf('RelevanceFeedback matchId') > detail.indexOf('ABC analysis')
    })(),
    true
  )
  check(
    'AF72 the screens say what this does not do: nobody else sees it, ABC does not learn from it, the company is unaffected',
    (() => {
      const view = code('components/event-intelligence/BenchmarkView.tsx')
      const control = code('components/event-intelligence/RelevanceFeedback.tsx')
      return [
        view.includes('ABC does not learn from it'),
        view.includes('Only you can see it'),
        control.includes('Only you can see this'),
        /changes\s+nothing about the company/.test(control),
      ]
    })(),
    [true, true, true, true]
  )
  check(
    'AF73a a refusal keeps its place in the queue, so the optional reason can still be given',
    (() => {
      const view = code('components/event-intelligence/BenchmarkView.tsx')
      return (
        /judgment === 'not_relevant'\) setAwaitingReason/.test(view) &&
        /awaitingReason === current\.matchId \? 'Next company' : 'Skip'/.test(view)
      )
    })(),
    true
  )
  check(
    'AF73b the reason row is asked after the answer is already recorded, never before it',
    (() => {
      const control = code('components/event-intelligence/RelevanceFeedback.tsx')
      return control.includes('Optional — it is already recorded.') && /judgment === 'not_relevant' \?/.test(control)
    })(),
    true
  )
  check(
    'AF73c every control says its state in something other than colour',
    (() => {
      const control = code('components/event-intelligence/RelevanceFeedback.tsx')
      return [control.includes('aria-pressed={on}'), control.includes('role="status"'), control.includes('role="alert"')]
    })(),
    [true, true, true]
  )
  check(
    'AF74 no migration that shipped was edited to make room for any of it',
    ctx
      .git('diff', '--diff-filter=MD', '--name-only', ctx.BASE_REF, '--', 'supabase/migrations')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean),
    []
  )

  await db.close()
}
