# ABC Event & Expo Intelligence — how it works

Enough for another engineer to change this safely. Written against
`event-intelligence-v1`; the release it branches from is
`origin/release-final-blocker-fixes` @ `f1766d7`.

**The feature is off.** `ABC_EVENT_INTELLIGENCE` is unset in production, and
unset means off.

| Document | What it is for |
| --- | --- |
| this file | architecture, domain model, the V1 flow, how to run it |
| `decision-record.md` | why the shape is what it is, written before the code |
| `apify-provider.md` | the contract a real data source would have to meet. Nothing connected |
| `landing-handoff.md` | what the public site may and may not claim |

## 1. What it does

ABC already covers MEET → SCAN → REMEMBER → FOLLOW UP → CRM. This adds the part
before: given what a company does, sells and needs, which exhibitors at a fair
are worth walking to, why, and where they are standing.

The whole V1 flow, end to end:

```
/events  ──(flag on)──▶  /events/intelligence          hub: fairs ABC has data for
                                  │  load demo data → POST /api/event-intelligence/import
                                  ▼
                         /events/intelligence/[eventKey]           overview + ranked matches
                                  │
             ┌────────────────────┼─────────────────────┐
             ▼                    ▼                     ▼
          /setup            /m/[matchId]              /plan
   what we do / sell /     why ABC suggests      saved targets, by
   need / want to meet     them, and the         priority then hall
   + goals for this fair   listing it read
```

## 2. Three layers, kept apart

The separation is the design. It is enforced by the schema, not by convention.

**A — private relationship graph (exists, untouched).** `scanned_contacts`,
`contact_encounters`, `scan_batches`, follow-ups, CRM. This feature *reads*
encounters in one place (to offer them for linking) and writes none of it. A
test fails if that changes.

**B — event / business graph (new, shared, no owner).**

| Table | Holds |
| --- | --- |
| `intel_events` | a fair. `event_key` is the identity |
| `intel_companies` | the organisation itself, independent of any fair |
| `intel_company_presences` | a company **at** a fair: hall, stand, categories, products |
| `intel_source_records` | where each fact came from, when, and its content hash |

No `user_id` anywhere in B, so there is nothing to leak between accounts.
`authenticated` may `SELECT`; only `service_role` may write. `anon` has no grant
and no policy.

**C — intelligence (new, owner-scoped, RLS).**

| Table | Holds |
| --- | --- |
| `intel_company_profiles` | what the owner's company does, sells, needs |
| `intel_event_objectives` | what they want from one fair |
| `intel_matches` | one scored suggestion, with reasons and evidence |
| `intel_meeting_targets` | a company they decided is worth their time |

### The locked rules, and what enforces them

| Rule | Enforced by |
| --- | --- |
| **COMPANY ≠ EVENT PRESENCE** | hall and stand exist only on `intel_company_presences`, unique on `(event_id, company_id)`. One company, many fairs, a different stand at each |
| **TARGET ≠ ENCOUNTER** | `status` cannot be set to `'met'` — the CHECK allows saved/planned/skipped. "Met" is *derived* from `met_encounter_id`, a composite FK to `contact_encounters (id, user_id)`, so it can only ever point at a meeting the same owner recorded |
| **PERSON ≠ ENCOUNTER** | untouched. Nothing here inserts a contact or an encounter |
| **facts ≠ inference** | `evidence` quotes the listing with the field it came from; `reasons` are ABC's words and carry the indices of the evidence they rest on. The UI renders them in separate panels |

An owner's whole intelligence chain hangs off their `abc_profiles` row by
cascade, so `remove_account_data()` deletes it without this feature editing that
function. The account-deletion suite seeds all four tables and proves it.

## 3. The provider seam

Core ingestion never learns a source's payload shape.

```
EventDataProvider          lib/event-intelligence/provider.ts
  ├─ JsonFixtureProvider   the synthetic fair (also exported as DatasetEventProvider)
  ├─ parseCsvDataset       an organiser's CSV export        ─┐ import-file.ts
  └─ parseJsonDataset      an uploaded JSON document        ─┘
      (future)  ApifyEventProvider / OfficialEventApiProvider
```

A provider yields `ProviderEvent` and `ProviderExhibitor` and nothing else.
`ingestEvent()` then does the work that is the same for every source:

- **Company identity**, four tiers, the fourth being "do not decide": domain →
  a previously imported provider record → exact normalised name *plus* an agreed
  country when neither side has a domain → otherwise a new company flagged
  `merge_candidate_of`. An identified company is never merged into by an
  unidentified listing.
- **Idempotency**: `content_hash` over the normalised payload. Unchanged means
  `last_seen_at` is touched and nothing else is written.
- **Provenance**: one `intel_source_records` row per provider record.
- **Refresh**: a presence missing from a newer fetch is marked `withdrawn`, never
  deleted, so a saved target cannot dangle. Private state is never touched.

There is **no personal data** in the provider contract — no name, email, phone
or social profile — and a test fails if a field for one is added.

## 4. Matching

`lib/event-intelligence/scoring.ts`, one deterministic engine, no AI provider.
Same inputs, same output, every run; weights are documented in a table in that
file and `ENGINE_VERSION` is stored on every row.

**ABC Match is 0–100 relevance to what the owner said they want.** It is not a
probability and predicts nothing. Three directions — `customer`, `supplier`,
`partner` — scored separately, because a company you could sell to and one that
could supply you are not the same opportunity.

A reason that cites no evidence is dropped before scoring. A direction whose
reasons all drop produces no match, and a candidate with no direction produces
no row: 13 matches out of 21 listings for the demo profile, not 21.

`MatchInsightGenerator` is declared in `types.ts` and deliberately unimplemented
— the slot where an optional AI adapter could later phrase a conversation
opener from facts that have already been normalised.

## 5. Feature flag

`ABC_EVENT_INTELLIGENCE`, server-side only (**no** `NEXT_PUBLIC_`, so it cannot
reach the browser). Off unless the value is `1`, `true`, `on` or `yes`.

Every page goes through `eventIntelligenceContext()` and every API route through
`requireEventIntelligence()`, which checks the flag **before** the session, so a
disabled deployment answers `404 {"error":"Not found"}` to everyone identically
and cannot be probed. Verified by running the server both ways.

## 6. Migrations

One, additive, and applied **nowhere but locally**:

```
supabase/migrations/20260919120000_event_expo_intelligence.sql
```

No existing migration is edited or renumbered (a test asserts it). It is applied
in tests by PGlite, which runs `schema.sql` plus every migration in order.

**Do not apply this to remote Supabase.** That is an owner decision and a
deployment step, not part of this branch.

## 7. Running it

```bash
# from C:/Users/David/abc-app-event-intelligence
npm ci
ABC_EVENT_INTELLIGENCE=1 npx next dev --port 3111
```

Then sign in and open **Events → Event Intelligence**:

1. **Load the demo fair** — one click on the hub. It calls
   `POST /api/event-intelligence/import`, which runs `JsonFixtureProvider` over
   `lib/event-intelligence/fixtures/abc-industrial-future-expo.ts`: one invented
   fair, 21 invented exhibitors. Safe to press twice; it reports "nothing
   changed".
2. **Set up** — what you do, sell, need, and who you want to meet. Only one of
   the first three is required.
3. **Find who is worth meeting** — runs the engine and stores the matches.
4. **Save** the ones worth your time, set a priority, add a private note.
5. **Your plan** — grouped by priority, ordered by hall.
6. At the fair, scan a card as usual; the match detail then offers that meeting
   for linking.

### Other data sources

CSV and JSON go through the same ingestion. There is no upload UI yet, so today
this is a script or a REPL:

```ts
import { parseCsvDataset, DatasetEventProvider } from '@/lib/event-intelligence/providers/import-file'
import { ingestEvent } from '@/lib/event-intelligence/ingest'
import { supabaseIngestStore } from '@/lib/event-intelligence/store/supabase-ingest'
import { createServiceClient } from '@/lib/supabase/service'

const result = parseCsvDataset(csvText, {
  providerRecordId: 'medica-2026',
  name: 'MEDICA 2026',           // the event is supplied, never guessed from the file
  city: 'Düsseldorf',
}, 'csv:organiser-export')

if (result.ok) {
  await ingestEvent(
    new DatasetEventProvider(result.dataset),
    { providerEventId: 'medica-2026' },
    supabaseIngestStore(createServiceClient()),
  )
}
```

The CSV reader handles quoted fields, embedded commas and new lines, doubled
quotes, CRLF, an Excel BOM, and semicolon delimiters. Headers are matched by
alias (`company` / `exhibitor` / `name`, `booth` / `stand`, …). A row with no
id, listing URL or website is **skipped with a warning** rather than numbered by
position — a re-import of a re-ordered export would otherwise attach every
exhibitor to the wrong company.

## 8. Tests

```bash
npm run test:event-intelligence     # 229 checks
npm run test:account-deletion       # proves the cascade reaches the new tables
npm run typecheck && npm run lint && npm run build
```

Security is proved against real Postgres, not a mock: PGlite applies
`schema.sql` and every migration, and isolation runs as the actual
`authenticated` and `anon` roles with a JWT subject set. Ten mutation checks
(owner isolation removed, client-supplied owner id, duplicate import,
non-idempotent refresh, auto-created encounter, uncertain merge, leaked notes,
lost provenance, forged score, writable `'met'`) were each applied, each caught,
and each reverted.

## 9. What is not built

- **No real data source.** No provider is connected; no actor chosen. See
  `apify-provider.md` for what connecting one would require, and §1 of it for the
  decisions that are the owner's rather than an engineer's.
- **No upload UI** for CSV/JSON — parsers and ingestion exist, the screen does not.
- **No AI-written prose.** No conversation opener, discovery questions or
  suggested next step; the deterministic engine cannot write them without
  asserting something nobody told it, and fabricating them would break the one
  rule this feature is built around. The interface for a later adapter exists.
- **No pricing or entitlement.** Not decided, not built.
- **No route optimisation, scheduling, outreach or contact discovery**, by design.
- **Never run at scale.** Correct on 21 listings; untested on 5,000.
