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
and no policy. Beside B, and not part of it for anyone but the service role:
`intel_source_runs`, the Event Data Engine's run records and source health
(§14) — no grant to `authenticated` at all.

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

**D — the Smart Event Profile (new, owner-scoped, RLS).** `intel_products`,
`intel_event_materials`, `intel_meeting_briefs`, `intel_brief_materials`. What
the owner will show, and the meeting they are asking for. See §9.

**E — the Product Brain (new, owner-scoped, RLS).** `intel_brain_documents`,
`intel_brain_facts`: what ABC read about the owner's own business and what it
concluded, kept apart from what the owner typed. See §15.

An owner's whole chain — C, D and E — hangs off their `abc_profiles` row by
cascade, so `remove_account_data()` deletes it without this feature editing that
function. The account-deletion suite seeds all ten tables and proves it.

## 3. The provider seam

Core ingestion never learns a source's payload shape.

```
EventDataProvider          lib/event-intelligence/provider.ts
  ├─ JsonFixtureProvider   the synthetic fair (also exported as DatasetEventProvider)
  ├─ parseCsvDataset       an organiser's CSV export        ─┐ import-file.ts
  └─ parseJsonDataset      an uploaded JSON document        ─┘
      in front of it since V1 of the Event Data Engine (§14):
      EventSourceAdapter → official directory / API · Apify dataset · uploaded file
```

A provider yields `ProviderEvent` and `ProviderExhibitor` and nothing else.
`ingestEvent()` then does the work that is the same for every source. The
Event Data Engine (§14) adds source adapters, quality gates and provenance
snapshots in front of this seam; it ends in the same two types and the same
ingestion.

### How an import is executed

Three phases, each a bounded number of statements:

1. **Read** the graph in batches — companies by domain, by normalised name and
   by id; this event's presences; the source records for these provider record
   ids. Four queries, chunked at 500.
2. **Plan** in memory. `planIngest()` is pure: identity resolution, idempotency
   and the merge rules are decided on plain objects, which is also what makes
   them testable without a database.
3. **Write** in batches — new companies, changed companies, new presences,
   changed presences, a single touch for the unchanged ones, the source records,
   and one statement to withdraw whatever this fetch did not mention.

The version before this was row-at-a-time: ~8 statements per exhibitor, so
~16,000 for a 2,000-stand fair. Correct, and fine on 21 fixture rows; against
hosted Postgres every one of those is a network round trip. Statements are now
**flat in the row count** — measured at 9 for 500, 2,000 and 5,000 rows locally
(the Supabase store chunks at 500, so it issues a few more).

Two details worth keeping:

- **Unchanged rows are touched, not rewritten.** `touchPresences` writes
  `last_seen_at` and `status` and deliberately not `updated_at` — an unchanged
  listing has not been updated, and saying it was would make every refresh look
  like a change to anything watching that column.
- **Withdrawal is by timestamp, not by id list.** Everything this run saw has
  `last_seen_at` set to the run time, so what it did not see is exactly what is
  older. One small statement at any size; the id list would have been a query
  string with five thousand UUIDs in it.

Either way, `ingestEvent()`:

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

Three, all additive, all applied **nowhere but locally**:

```
supabase/migrations/20260919120000_event_expo_intelligence.sql
supabase/migrations/20260920120000_event_smart_profile.sql
supabase/migrations/20260921120000_event_data_engine.sql      source runs, snapshots, the Product Brain (§14–15)
```

No existing migration is edited or renumbered (a test asserts it) — including
the first of these, which the second builds on by adding a constraint rather
than by changing it. The third adds two nullable columns to
`intel_source_records` and three new tables; it alters nothing else. All are
applied in tests by PGlite, which runs `schema.sql` plus every migration in
order.

**Do not apply these to remote Supabase.** That is an owner decision and a
deployment step, not part of this branch.

## 7. Running it

```bash
# from C:/Users/David/abc-app-event-intelligence
npm ci
ABC_EVENT_INTELLIGENCE=1 npx next dev --port 3111
```

Then sign in. **Home** now carries the Expo Mission card (§13): three answers, one button, and from then on one next action at a time. The steps below are the screens underneath it, still reachable directly from **Events → Event Intelligence**:

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

### Importing a real exhibitor list

**Events → Event Intelligence → Import an exhibitor list**, or
`/events/intelligence/import`. Four steps on one screen, and nothing is written
until the last of them.

1. **Which event.** An edition ABC already knows, or a new one. A new edition
   needs a name and a **year**; everything else is optional. See §9 for why the
   year is not negotiable.
2. **The file.** CSV or JSON, up to 4 MB and 10,000 rows. The extension picks
   the format; it can be overridden.
3. **What ABC found.** Every row classified before anything is stored:
   **Ready** (complete), **Check** (importable but thin — a missing stand is the
   normal case in a real listing, not an error), or **Cannot import** (no company
   name, or nothing to identify it by). Rows ABC already holds for this event are
   named as updates rather than new companies, and rows repeating a company from
   earlier in the same file are collapsed. Warnings never block; invalid rows
   never enter the graph.
4. **Imported**, then straight on to matching — not a dead-end success screen.

`POST /api/event-intelligence/import/preview` has no write path at all: it
creates no service client, so nothing in it can reach the shared graph.
`.../import/commit` re-parses and re-validates the file rather than trusting a
preview the browser sends back, because a round trip through a client is a place
where rows could be edited.

Nothing about the file is kept. It is parsed, counted and discarded; what
persists is the exhibitor list and its provenance.

### Accepted CSV

Quoted fields, commas and new lines inside quotes, doubled quotes, CRLF, a UTF-8
BOM from Excel, and `;` as a delimiter (which German and Czech Excel writes by
default). Headers are matched by alias, ignoring case, spaces and underscores:

| Field | Accepted headers |
| --- | --- |
| company | `company`, `company name`, `name`, `exhibitor`, `aussteller` |
| hall / stand | `hall`, `halle` / `stand`, `booth`, `stand no` |
| website | `website`, `url`, `homepage` |
| categories | `categories`, `industry`, `product groups`, `branche` |
| description | `description`, `about`, `beschreibung` |
| listing | `profile url`, `listing url`, `link` |
| id | `id`, `exhibitor id`, `reference` |

Only the company column is required. A multi-value cell separated by `;` or `|`
becomes a list — quote the cell if the separator is also the delimiter.

**A row with no id, listing URL or website is skipped, with a warning saying
so.** Falling back to the row number would make a re-import of a re-ordered
export resolve every exhibitor to the wrong company.

### Accepted JSON

`{ "exhibitors": [...] }`, or a bare array. Keys follow the provider type, with
aliases (`name`, `company`, `booth`, `products`, `description`). Every value goes
through the same cleaners as the CSV path, and unrecognised entries are dropped
rather than passed through.

### Without the UI

```ts
import { parseCsvDataset, DatasetEventProvider } from '@/lib/event-intelligence/providers/import-file'
import { ingestEvent } from '@/lib/event-intelligence/ingest'
import { supabaseIngestStore } from '@/lib/event-intelligence/store/supabase-ingest'
import { createServiceClient } from '@/lib/supabase/service'

const result = parseCsvDataset(csvText, {
  providerRecordId: 'ambiente-2027',
  name: 'Ambiente',
  editionYear: 2027,          // the year is what keeps editions apart
  city: 'Frankfurt',
}, 'csv:organiser-export')

if (result.ok) {
  await ingestEvent(
    new DatasetEventProvider(result.dataset),
    { providerEventId: 'ambiente-2027' },
    supabaseIngestStore(createServiceClient()),
  )
}
```

## 8. Event edition identity

`intel_events.event_key` is the identity, derived rather than stored as typed.
Editions are distinct when the year is in the name — and, since
`eventEditionKey()`, when it is not:

| Entered | Key |
| --- | --- |
| "Ambiente 2026" | `ambiente-2026` |
| "Ambiente 2027" | `ambiente-2027` |
| "Ambiente" + year 2026 | `ambiente-2026` |
| "Ambiente" + year 2027 | `ambiente-2027` |

The hazard this closes was real and silent. Before it, "Ambiente" entered twice
without a year both keyed to `ambiente`; because ingestion upserts on the key,
the second import adopted the first edition's row — two years of exhibitors
merged, last year's stands still attached, and no error anywhere. Tests T9–T11
hold the two editions apart in a real database, with one company exhibiting at
both kept as **one company with two presences**, each with its own stand.

A year already in the name is not repeated, so the Event Workspace bridge still
lands: an encounter somebody typed as "Ambiente 2027" keys to the same string.

**Series vs edition.** ABC models the edition. "Ambiente" as a lasting series
with a 2026 and a 2027 is a real future concept and not one V1 needs — every
question this feature answers is about one edition. `edition_year` plus a
distinct key means a series can be added later by grouping rows that already
exist, which is the cheap direction to have left it in.

**Reserved keys.** `intelligence` and `import` are screens under
`/events/intelligence`, so no fair can hold those keys. The list is
`RESERVED_EVENT_KEYS`; pages refuse to resolve an event under any of them, and a
test asserts each reserved word is a screen that actually exists.

## 9. Smart Event Profile — what to show, and asking for the meeting

Matching answers *who* and *why*. This layer answers *what do I show them* and
*how do I ask*, and it is a contextual layer on ABC rather than a second card
product: identity, the card slug, the public URL, the QR and the image bucket
are all reused unchanged.

| Table | Holds |
| --- | --- |
| `intel_products` | what the owner sells, as they describe it |
| `intel_event_materials` | material for **one edition**: video, document, image, link, offer |
| `intel_meeting_briefs` | one per saved target: topic, note, product, status |
| `intel_brief_materials` | which material is attached to which brief |

**Why not `card_showcase_items`.** It is eight images on the card as a whole —
no event, no edition, no product, no tags, no validity window. Event material is
the opposite of card-global, and adding `event_id`, tags and a phase to a table
that ships in the launch release would push event semantics into the card model
and change a live table. The card keeps its showcase; the event layer has its
own.

### Three kinds of claim, and why they stay apart

The feature now holds three things that all look like statements about a
company, and confusing them would be the worst thing it could do:

| | What it is | Where it lives |
| --- | --- | --- |
| **Source fact** | what an event listing says about *them* | `intel_source_records`, quoted with provenance |
| **ABC analysis** | what ABC inferred by comparing | `intel_matches.reasons`, with the evidence it rests on |
| **Your material** | what the owner says about *their own* company | `intel_products`, `intel_event_materials` |

The third is first-party marketing content. ABC stores it, shows it, and never
checks it — `firstPartyNotice` is the one sentence the screens use to say so.

### Content phases

Material can be pinned to `pre`, `live` or `post`, or left as `any`. Which
phase a fair is in comes from the event's own dates (`eventPhaseOn`), so it is a
fact rather than a guess — and an event with no dates has no phase, in which
case a phase never hides anything. An explicit `visible_from` / `visible_until`
window is honoured independently.

The prepare screen applies both on the server: what is for now is listed
first, and anything outside its phase or window is still listed after it,
labelled "outside the time you set for it". It is the owner's own material, so
ABC orders and labels it rather than hiding it.

### Edition scoping

`event_id` is **not nullable**. A teaser made for Ambiente 2026 is not material
for Ambiente 2027 until somebody deliberately creates a row for 2027. Nothing
copies forward, because "we showed this last year" is a decision, not a default.

### The meeting brief, and what it refuses to claim

Statuses are `draft`, `ready`, `shared` — and nothing else. There is no
`accepted`, `confirmed` or `scheduled`, because nobody replies to anything
inside ABC and a status implying agreement would be the product asserting a
relationship that may not exist. A database CHECK makes `shared` true exactly
when there is a `shared_at`.

**Nothing is sent.** There is no transport in the feature: no mail, no message,
no webhook, no third party. Every way out is the owner's own app:

| Button | What it does | Recorded as shared |
| --- | --- | --- |
| Share… | the device's share sheet (shown only where the browser has one) | when the sheet completes; a cancelled sheet records nothing |
| Email | `mailto:?subject=…&body=…` — the owner's mail app, **no recipient** | only if the owner then says "I sent it" |
| WhatsApp | `https://wa.me/?text=…` — WhatsApp's chat picker, **no number** | only if the owner then says "I sent it" |
| Copy | the clipboard | only if the owner then says "I sent it" |

ABC cannot see whether a composer was sent or abandoned, so it does not guess.
There is no recipient anywhere because Event Intelligence holds none: a target
is a company from a listing, and no person or address is ingested. That is also
why `lib/outreach-composers.ts` (Smart Follow-up's composers) is not reused
directly — each of them needs a phone number, an email address or a LinkedIn
profile, which here would have to be discovered, and discovery is out of scope.
The handoff URLs are the same shapes without the recipient.

### What leaves ABC

`buildShareText` in `profile.ts` assembles the note, and the boundary is drawn
by its signature: it takes the topic, the owner's note, the product name, the
chosen material, the fair's name, and the owner's name, company and published
card link. There is no parameter for the private target note, the priority, the
target status, the score, ABC's reasoning, the listing's evidence, CRM state or
the other side's stand — so none of them can reach the text. The suite passes
all of them in anyway and checks the output is byte-for-byte unchanged. The
card link is `publicCardUrl` (`abccard.io/d/<slug>`) and appears only when the
card is published. No public page exists for a profile or a brief; nothing is
reachable without signing in.

**INVITATION ≠ MEETING** and **TARGET ≠ ENCOUNTER** both still hold. Preparing
or sharing a brief creates no contact and no encounter, and the target stays a
target until the owner records a real meeting.

### Files: what is actually supported

| Kind | Upload into ABC | Why |
| --- | --- | --- |
| Image | **bucket yes, this form no** | the existing `card-media` bucket takes `image/jpeg`, `image/png`, `image/webp` up to 10 MB, but the material form has no upload control yet — it takes the address of an image already in ABC or anywhere on the web |
| Video, document, offer, link | **reference only** | the bucket accepts images only. ABC stores the address; the file stays where the company hosts it |

This is a storage configuration, not a limit of the model — `url` holds the
answer either way, and `UPLOAD_SUPPORTED` in `profile.ts` is the single place
that changes if the bucket ever accepts more. The form says which case it is in
rather than offering an upload control that would fail. URLs are restricted to
`http`/`https` by `safeMaterialUrl`, because these become links somebody else
opens.

### Routes

```
/events/intelligence/[eventKey]/profile              what you will show, this edition
/events/intelligence/[eventKey]/m/[matchId]/prepare  topic, product, material, note, share
```

## 10. Working at fair scale

### Measured, local PGlite — **not** hosted Supabase

| Rows | Parse + preview | Import | Re-import | Match | Statements |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 500 | 30 ms | 148 ms | 111 ms | 52 ms | 9 / 8 |
| 2,000 | 86 ms | 545 ms | 421 ms | 212 ms | 9 / 8 |
| 5,000 | 148 ms | 1,839 ms | 1,157 ms | 450 ms | 9 / 8 |

Statements are flat; milliseconds are roughly linear. On hosted Supabase the
statement count is what matters, because each one is a round trip — but the
timings above say nothing about it and should not be quoted as if they did.

### Guardrails

| Limit | Value | Why |
| --- | --- | --- |
| Upload size | 4 MB | ~30,000 CSV rows. A guardrail against a mis-paste, not a product limit |
| Rows per import | 10,000 | Refused before anything is written, with the count in the message |
| Matches sent to the browser | 500 (`MATCH_PAYLOAD_LIMIT`) | 3,000 rows is ~1 MB of JSON on a phone. The list is relevance-ordered first, so the cap keeps the part worth reading, **plus anything already saved** whatever it scored. The screen says "the 500 strongest of 3,000 are loaded" |
| Rendered at once | 50 (`MATCH_PAGE_SIZE`) | Filtering 3,000 rows is cheap; laying out 3,000 cards is not |
| Preview rows rendered | 50, with "Show all" | Same reason |

### Finding one company among thousands

The match list carries search, filters and sorting, all pure and tested in
`match-query.ts`:

- **Search** over company name, categories and products. Every word must match,
  so a second word narrows. It runs against a `searchText` folded once at build
  time rather than lowercasing every row on every keystroke.
- **Filters**: type (customer / supplier / partner), hall, "has a stand",
  "saved". Every one is a dimension the listing actually holds — there is no
  "trending" and no second opinion about relevance.
- **Sorts**: most relevant (the deterministic score, reasons intact), company
  name, hall and stand. Every comparator ends in the company name, so no two
  rows tie and the list cannot reshuffle itself between renders.
- Type counts ignore the type filter, so the other chips still tell you where
  else to look instead of all reading zero.

The Event Plan has the same shape — search (including the owner's own private
note), type, hall, and sorts — with priority kept as the grouping whatever the
sort, because that is the owner's own judgement about who matters. Targets can
be removed. Nothing there can mark anybody as met.

## 11. Tests

```bash
npm run test:event-intelligence     # 580 checks: the 445 below, plus sections AB–AE for §14–15 (see §16)
npm run test:account-deletion       # proves the cascade reaches the new tables, brain tables included
npm run typecheck && npm run lint && npm run build
```

Security is proved against real Postgres, not a mock: PGlite applies
`schema.sql` and every migration, and isolation runs as the actual
`authenticated` and `anon` roles with a JWT subject set. Ten mutation checks
(owner isolation removed, client-supplied owner id, duplicate import,
non-idempotent refresh, auto-created encounter, uncertain merge, leaked notes,
lost provenance, forged score, writable `'met'`) were each applied, each caught,
and each reverted.

## 12. What is not built

- **No real data source is connected.** A person can bring their own CSV or
  JSON, which is the realistic first source. The Event Data Engine (§14) can
  read an organiser's structured feed or a finished Apify dataset, but no
  source has a legal basis, no token exists, and the pilot (MEDICA 2026) is
  not read — its directory is reserved against AI crawlers, and it is HTML.
  See `apify-provider.md` §1 for the decisions that are the owner's.
- **No reading of exhibitors' own websites.** The crawler and extractor are
  shared, but only the owner's own site is read, on request. Enriching
  thousands of exhibitors needs a queue, a cost ceiling and a place to keep
  company facts; none is built.
- **No HTML directory reader.** Structured feeds only.
- **No AI-written prose.** No conversation opener, discovery questions or
  suggested next step; the deterministic engine cannot write them without
  asserting something nobody told it, and fabricating them would break the one
  rule this feature is built around. The interface for a later adapter exists.
- **No pricing or entitlement.** Not decided, not built.
- **No route optimisation, scheduling, outreach or contact discovery**, by design.
- **Hosted-Supabase performance is unknown.** Everything below is local PGlite
  on a laptop. Statement *count* is the property that should carry over, since
  it is what turns into round trips; the milliseconds will not.

## 13. Expo Mission — one next action

**Maximum intelligence underneath, maximum simplicity on top.** Everything above
is machinery. A person going to a fair sees one thing: the Expo Mission, which
answers *what should I do next?* — nothing about matches, targets, phases or
plans.

### Where it lives

| Surface | What it shows |
| --- | --- |
| **Home** — the Expo Mission card | No mission: *Where are you going next?* and the three-answer setup, in place. A mission: the fair, where it stands in one sentence, one button. Several missions: the one that matters now, and "View all missions" |
| `/events/intelligence/[eventKey]/mission` | The fair, a line of status, **What matters next** — one card, one primary action — a quiet context line, and everything else behind "Show details" |

The main navigation is unchanged: no sidebar change, no new tab. Home is the way
in; `/events/intelligence` doubles as "all missions", and its rows now open the
mission. The earlier screens — all opportunities, the plan, the profile, the
prepare screen, setup — are still there, one step away, never the default.

### The mission is derived, never stored

A mission **is** an objective for one fair. There is no mission table, column or
status to update: every read derives the state from rows that already exist —
the event's dates, the profile and objective, matches, targets, meeting
requests, and the meetings the owner recorded at that fair. Nothing can fall out
of step, and there is no migration.

```
lib/event-intelligence/mission.ts       pure: timing, the rules, Home summary, which mission leads, setup mapping
lib/event-intelligence/mission-data.ts  reads the facts; decides nothing
```

### The rules, in order (`nextMissionAction`)

1. Not set up → set it up (the three answers).
2. No exhibitor list for the fair → import one. ABC does not know every fair.
3. **After the fair** → relationships: several need attention → "Continue
   follow-ups"; one due → follow up with that person; one not in the CRM →
   send to CRM (only if a CRM is connected); follow-ups scheduled → say so;
   nothing left → **Mission complete**; no meetings → say that.
4. A follow-up **due now** from a meeting at this fair comes first.
5. Nothing matched yet → find opportunities (the existing engine).
6. **During the fair** → the next target to walk to (priority, then hall, then
   stand) with why, what to discuss and what to show; none left → scan people.
   "Scan a person" is always one tap away.
7. **Before the fair** → prepare the highest-priority target; share a ready
   request; review the next strong opportunity; else review the plan.

Which fair leads Home (`selectPrimaryMission`): live → nearest ahead → over but
with people waiting → undated → none. Ties break on the name.

### Setup: three answers, no second model

"What do you sell?", "What are you looking for?", and optionally Suppliers /
Distributors / Partners. `missionSetupBodies` maps them onto the profile and
objective the engine already reads — what you sell → `what_we_sell`; what you
look for → the objective's goals; Suppliers → `buy_focus`; Partners and
Distributors → `partner_focus` — and carries every other field over unchanged,
so the simple form never wipes what somebody set in "Refine". The button then
calls the existing profile, objective and match endpoints; there is no mission
API. Customers are always looked for: "what do you sell" is exactly the question
that finds them. Prefill comes from the profile, else the products the owner
already described; nothing is invented.

### The invariants still hold

- **TARGET ≠ ENCOUNTER.** A target counts as met only through
  `met_encounter_id`. Opening it, preparing it, sharing a request or the fair
  starting changes nothing.
- **INVITATION ≠ MEETING.** A shared request moves the mission on, and the
  company stays a target to visit.
- **Facts ≠ analysis.** The card quotes "From the listing" separately from
  ABC's "Why", and says that the why is ABC's reading.

### Meetings, follow-ups and CRM — the Event Workspace's own rules

Meetings at a fair are read through `buildEventWorkspace`, so "a meeting at this
fair", its follow-up state and its CRM state mean what they mean on the Events
screen.

CRM state needs one careful read. `crm_connections` and `crm_object_mappings`
are server-only tables — their migrations revoke every privilege from the
signed-in role — so the mission reads them with the service role, for the session
owner only, and returns only "a CRM is connected" and a set of meeting ids. If
the service role is unavailable the answer is "no CRM", so the mission never
nags about a CRM it cannot see.

**Found while doing this (release code, not changed here):** the Event
Workspace itself (`lib/events/data.ts`, `fetchCrmByEncounter`) reads
`crm_object_mappings` through the signed-in session. Postgres refuses that read
(`42501`, verified in PGlite), the error is logged, and every meeting shows as
"not in CRM" whatever was pushed. It belongs on the release branch.

### Flag

Everything is behind `ABC_EVENT_INTELLIGENCE`. With it off, Home runs no mission
query and renders exactly the cards it always did; the card's code is loaded with
`next/dynamic` only when there is a mission to show. The mission page is gated
like every other Event Intelligence page.

### Tests

`npm run test:event-intelligence`, section **AA** (56 checks) plus Z54a: every
state and rule above on pure facts, the setup mapping against the real API
parsers, the real engine finding a distributor only where the listing says so,
the Home gate, the untouched navigation, and — against PGlite, as the
`authenticated` role through RLS — the whole mission from "no objective" to
"complete", including TARGET ≠ ENCOUNTER and another account seeing nothing.
Eight mutations (met without an encounter, shared counted as met, live not
leading, CRM nag with no CRM, follow-up not first, setup wiping Refine, Home
ignoring the flag, Home without a session) were each caught and reverted.

### Not built

- A real event data source (unchanged: imported lists only).
- ~~A product brain~~ — built since (§15). The mission itself still reads the
  profile and products the owner typed; the brain reaches it through matching
  and the "ABC suggests showing" line, and only once the owner confirms.
- Hosted-Supabase performance: Home reads the owner's encounters to find the
  meetings at their fairs, like the Event Workspace does; measured nowhere but
  locally.

## 14. Event Data Engine V1 — acquiring exhibitor data, and judging it

The provider seam of §3 still stands: ingestion consumes `ProviderEvent` and
`ProviderExhibitor` and nothing else. The Event Data Engine is everything
*before* that model — where real sources differ and where they fail — and it
ends in exactly that model, handed to the same ingestion. There is no second
ingestion universe and no second refresh system.

### What is real, and what is not

| | Status |
| --- | --- |
| Engine, adapters, gates, run records | **Implemented**, tested against real Postgres (PGlite) |
| MEDICA 2026 as a live source | **Not read.** Its robots.txt — read raw by ABC's own fetcher on 2026-09-22, the only request made to that site — lets a generic crawler read the directory pages but reserves `/vis/`, the whole exhibitor directory, against GPTBot, ClaudeBot, Google-Extended, PerplexityBot and ChatGPT-User by name. ABC honours that AI opt-out for itself. No legal basis has been decided, and the directory is HTML, which the structured-feed adapter does not read. The pilot is **fixture-tested**: invented exhibitors, `.invalid` domains, in a structured-feed shape |
| Apify | **Adapter only, mock-tested.** Reads a finished run's dataset; never starts one. No token in the repository; no real run read |
| Network behaviour (robots, SSRF, pacing, limits) | **Mocked transport** in tests. **Real once:** the MEDICA robots.txt read above, which is also how the group-merging bug below was found |
| Hosted Supabase | **Not verified.** Nothing here has run against it |

### The source contract

`lib/event-intelligence/sources/adapter.ts`:

```ts
interface EventSourceAdapter<Raw> {
  id: string                 // 'official:medica', 'apify:<label>', 'csv:upload' — stored, never shown
  kind: SourceKind           // official_api | official_directory | official_detail | company_website | secondary | file
  displayName: string        // what a reader sees: 'Event directory', never a vendor
  payloadVersion: string
  access: { legalBasis: LegalBasis | null; reviewedOn?: string | null }

  healthCheck(ref)           // configured? lawful? permitted by robots.txt? — never throws
  discoverEvent(ref)         // the edition, as the source describes it
  fetchListings(ref)         // every listing, raw; throws if the read cannot finish
  fetchListingDetail?(l)     // optional detail page; null when it could not be read
  normalizeListing(l)        // raw → ProviderExhibitor, or a rejection reason
}
```

Splitting *read* from *normalise* is what lets a run count what it
discovered, parsed and rejected. `raw` is dropped after normalisation; only
the normalised listing is stored.

**Legal basis first.** `legalBasis: null` means nobody has decided, and a
source with no basis fails its health check before a single request is made.
The MEDICA configuration ships with `null`.

**Source priority** (`SOURCE_PRIORITY`, lower is better): official API and
uploaded file 1, official directory 2, official detail pages 3, the
exhibitor's own website 4, secondary 5. `selectSource()` takes the
best-ranked source whose health check passes and reports why each better one
was refused.

| Adapter | File | What it reads |
| --- | --- | --- |
| Official directory / API | `sources/official-directory.ts` | An organiser's structured JSON feed, paged. One generic adapter, configured per event. JSON only: an HTML directory needs per-site rules and is not built |
| MEDICA pilot | `sources/pilots/medica.ts` | Configuration, not code: the real edition (16–19 Nov 2026, Messe Düsseldorf), the real directory address, a field map, `legalBasis: null` |
| Apify | `sources/apify.ts` | A **finished** run's dataset (`SUCCEEDED` only), read-only. `APIFY_TOKEN` in an Authorization header, never a URL. The configuration must state the legal basis of the *underlying* source |
| Uploaded file | `sources/file.ts` | A parsed CSV/JSON, so uploads go through the same gates |

**A correction, recorded here on purpose.** Commit `5f68326` (and the first
version of the MEDICA configuration) said MEDICA's robots.txt disallows
`/vis/` for every agent. That came from a tool's summary of the file, not the
file. The raw file says otherwise, as above, and reading it found a real bug:
`groupFor` used only the first `User-agent: *` group, where RFC 9309 merges
them, so it missed MEDICA's second `*` group and would have allowed the
exhibitor search. Fixed in `cf2218c`; tests AC6a and AB3.

### The one way ABC touches the network

`sources/http.ts`, the PoliteFetcher. There is no option that makes it
impolite:

- **Public hosts only.** http/https, no credentials in the URL, never a
  loopback, private, link-local, CGNAT, multicast or `.local`/`.internal`
  address — checked on the literal and on what the name resolves to, on every
  redirect hop.
- **robots.txt obeyed** (RFC 9309): the most specific agent's groups, merged;
  longest rule; Allow wins ties; wildcards and end anchors; same-site
  redirects followed. Missing means no rules; 401/403/5xx/unreadable means no
  crawl. Crawl-delay honoured in full.
- **AI opt-outs honoured.** A path a site disallows for a named AI crawler
  (GPTBot, ClaudeBot, Google-Extended, CCBot, PerplexityBot and the rest of
  `AI_CRAWLER_TOKENS`) is disallowed for ABC too. ABC is an AI product, and a
  site that reserved content against AI crawlers has not invited a
  differently named one in. Refusals are `robots_ai_opt_out`. The switch
  (`honourAiOptOut: false`) exists for a source with agreed terms and is set
  by nothing today — a conservative default the owner may revisit.
- **Slow.** One request at a time per host, at least a second apart.
- **Bounded.** A timeout over headers and body, a 1.5 MB streamed ceiling, a
  content-type allowlist, three redirects.
- **Stops when told to.** 401, 403, 429 or a challenge page stops that host
  for the rest of the run. No retry, no second user agent, no proxy.
- One honest User-Agent (`ABCEventIntelligence/1.0`; `ABC_CRAWLER_USER_AGENT`
  overrides it). Failures are codes; recorded URLs are redacted of
  credential-like parameters.

### A run

`runEventSource(adapter, ref, { ingestStore, runStore })` in `source-run.ts`:

```
probe → discover → read → detail → normalise → measure
      → prepareIngest (identity, changes, projected withdrawals — nothing written)
      → quality gates (against the last published run)
      → commitIngest, only if the gates allow
      → one intel_source_runs row, whatever happened
```

`ingest.ts` was split so the gates sit between planning and writing:
`prepareIngest` reads and plans, `commitIngest` writes. `ingestEvent()` is the
two composed and issues exactly the statements it did before (9 / 8 at every
scale). A gated run looks the edition up without writing it, so a refused run
leaves no trace but its run record.

### Provenance

Every listing still has an `intel_source_records` row, now with:

- `snapshot` — what the source said, in the provider contract's vocabulary.
  It is the object `content_hash` is computed over, so the stored hash is the
  hash of the stored snapshot. This is the SOURCE FACT layer: presence and
  company rows are ABC's merged, current view; the snapshot is one source at
  one moment and is never merged into.
- `run_id` — the run that wrote it.
- `source_url` — the listing's own page, or where the record was read
  (`retrievedFrom`) when it has none.

**Fixed while doing this — edition-scoped source keys.** Source records were
keyed by `(provider, provider_record_id, payload_version)` with the
provider's bare id. Organisers keep an exhibitor's id across years and
spreadsheet row ids restart at 1, so importing MEDICA 2027 re-pointed MEDICA
2026's source records at the 2027 presences: the 2026 stands silently lost
their provenance, and a later refresh of 2026 compared against 2027's hashes.
Listing keys are now `<event_key>::<provider id>` (`listingSourceKey`).
Records written before are still found, but believed only when they point at
a presence of the same edition. Tests AB32–AB37.

**No personal data.** The contract has no field for a person; unmapped fields
are dropped at the adapter boundary; any sentence of free text that gives an
email address or a phone number is removed whole, name and all.

### Normalisation

Config-driven field maps (`sources/mapping.ts`): dotted paths with fallbacks,
lists from arrays or `;`/`|` cells, relative listing links resolved.
"Hall 12 / D18" is split only when the pattern is unambiguous; otherwise hall
and stand stay missing and the run counts it. A record with no company name
or no stable id is rejected, never invented.

### Identity

Unchanged, deliberately (§3): domain → previous source record → exact name
plus agreed country when neither has a domain → otherwise a new company
flagged as a merge candidate. "Vitalis Healthcare AG" and "Vitalis Healthcare
GmbH" on one domain are one company; two "Aurora Diagnostics" in different
countries with no website stay two. False merges are worse than duplicates.

### Refresh and change detection

From the snapshots, per listing: **new**, **unchanged**, **changed** (with the
fields — name, website, country, descriptions, categories, hall, stand,
products, listing URL), **reappeared**, and **withdrawn** (projected before
the write, counted after). A summary with up to 25 samples is kept on the run.
Withdrawal is still by timestamp and still never a delete.

### Source health and quality gates

Every run measures records discovered / parsed / rejected by reason,
duplicate records, duplicate companies, detail pages attempted and failed,
locations it could not parse, contact details removed, coverage of hall,
stand, website, description, categories and country (with missing-% for the
first three), listed before, projected withdrawals, companies created and
updated, presences created / updated / unchanged / withdrawn, write
statements, errors and duration.

A read completing is not success. `QUALITY_THRESHOLDS` in `source-health.ts`:

| Gate | Blocks when |
| --- | --- |
| `records_present` | nothing usable was read |
| `record_count_collapse` | fewer than half the last published run's listings |
| `withdrawal_spike` | it would withdraw more than 30% of what is listed (3 always allowed) — works with no baseline |
| `reject_rate` | more than 20% of listings rejected |
| `empty_name_rate` | more than 5% with no name (2 always allowed) |
| `duplicate_rate` | duplicates more than double the baseline rate and over 10% (warn only without a baseline) |
| `hall_/stand_/website_coverage_collapse` | coverage falls more than 30 points against the baseline |
| `detail_failure_rate` | more than 20% of detail pages fail — otherwise known stands would be overwritten with "not given" |
| `layout_change_suspected` | two or more coverage collapses at once |

The brief's own case — yesterday ~5,000, today 43 — is unhealthy on count
collapse and withdrawal spike (AB41) and, against a real database, writes
nothing (AB18–AB20). An operator who knows a fair really shrank can publish
by naming the gates (`publishDespite`); the override is recorded and the run
is `degraded`. No route an owner can call sets it.

`intel_source_runs` is internal: no grant to `authenticated` or `anon`, and
CHECKs make an unhealthy, un-overridden run unpublishable and a blocked run
unable to claim it wrote anything. None of it reaches the Expo Mission.

**Uploads use it too.** `/api/event-intelligence/import/commit` now runs the
file through `runEventSource`. A truncated re-upload that would withdraw most
of a fair is refused with "Nothing was imported …", and the import screen
shows that message as it is.

### Measured — local PGlite, network mocked

| Listings | Source run | Refresh | Ingest statements |
| ---: | ---: | ---: | ---: |
| 500 | ~100 ms | ~105 ms | 8 / 9 |
| 2,000 | ~380 ms | ~420 ms | 8 / 9 |
| 5,000 | ~950 ms | ~950 ms | 8 / 9 |

Plus two run-store statements per run. Snapshots make the refresh read
larger (~1 KB per listing, so ~5 MB at 5,000). Source-key reads are chunked
by length (6,000 characters) as well as count, because a provider id is often
a URL and 500 of them overflow a query string. Hosted timings: unknown.

## 15. Product Brain V1 — what the owner's business is

ABC should understand what the owner sells, makes and is looking for, without
pretending to understand what it cannot support. So the brain is small
structured facts, not a paragraph, and every fact says what kind of statement
it is.

| | Where it lives | Example |
| --- | --- | --- |
| **OWNER FACT** | `intel_company_profiles`, `intel_products`, `abc_profiles` — read live, never copied | "Precision aluminium components" typed in What we sell |
| **SOURCE FACT** | `intel_brain_facts`, `origin = 'source'`, quoting the page and when it was read | "ISO 13485", from the capabilities page |
| **ABC ANALYSIS** | `intel_brain_facts`, `origin = 'analysis'`, with the rule (`basis`) | "Medical equipment manufacturers" as likely customers, because you make components for medical equipment |

Kinds (V1): company name, summary, country; products, services, capabilities;
industries, applications; customer types, supplier needs, partner types;
markets; certifications, materials, technologies.

### Reading the owner's business — deterministic, no model

- **What the owner wrote** (`interpretOwnerStatements`): what we do, who we
  want to meet, the ABC profile's product description and ideal customer,
  and their event goals. "We sell precision aluminium components for medical
  equipment. We are looking for OEM customers and distributors in DACH."
  becomes a product, an application, a customer type (OEMs), a partner type
  (distributors), a market (DACH) and its three countries — all ANALYSIS,
  each quoting the sentence.
- **The owner's website** (`website/crawl.ts`, `website/extract.ts`): the
  home page and a handful of chosen pages — products, solutions, services,
  industries, applications, capabilities, about — on the same host and its
  `www.` twin only; never contact, imprint, legal, login, cart, news,
  careers, files or query strings; at most 8 fetches (hard ceiling 20), two
  links deep, 40 seconds; duplicate addresses and duplicate content collapse.
  From structured data, the meta description, headings and list items on the
  page about those things, and fixed lexicons for certifications, materials,
  production capabilities, industries (from sentences, never menus) and
  regions. Navigation and footers are never evidence. Quotes lose any
  sentence with an email or phone number. A site that opts out of AI
  crawlers is not read — including the owner's own, because ABC cannot know
  the person asking owns it — and the analysis says so
  (`websiteRead: refused_ai_opt_out`); what the owner wrote still counts.
- **Across facts** (`inferFromFacts`): components for an application → the
  application's manufacturers as likely customers. Labelled as ABC's reading.

Derived facts are capped per kind and deduplicated by kind plus their
comparable words, so "Aluminium housings" and "aluminium housing" are one.

### The owner decides

Nothing ABC read or concluded changes a single match until the owner
confirms it. In the database, `authenticated` may update `status`,
`decided_at` and `updated_at` and nothing else — not the value, the origin,
the basis or the evidence — and may insert nothing. CHECKs: no fact without
evidence; an analysis always carries its rule and a source fact never does; a
decision always has a moment.

- A fact the owner already typed is never proposed back.
- Confirmed stays confirmed, even if a later read no longer finds it.
- Rejected stays rejected and is never proposed again.
- A proposal no longer supported is withdrawn.
- A website that cannot be read this time keeps what it said before.
- The same account may ask for its website to be read once every 10 minutes.

`POST /api/event-intelligence/brain` — `analyze` (the website defaults to the
ABC profile's), `confirm` (every open proposal), `reject` (one fact). Behind
the flag; the owner from the session; nothing sent anywhere.

### What the owner sees

One card on the Refine screen (`ProductBrainCard`), checked at 1440, 820 and
390 on a temporary harness (not committed): **This is how ABC understands
your business** — We make and sell · Our typical customers · Main
applications · Markets · What sets us apart — each item labelled *You said*,
*From your website* or *ABC's reading*, then **Looks right** or **Edit**.
Edit removes ABC's reading one item at a time; new or changed facts go in
the owner's own answers below, where they are owner facts. The screen's one
primary action is still "Save and see matches". When the website was not
read, the card says why.

### Into matching — the engine is unchanged

`projectBrainForMatching(profile, facts)` hands the existing engine the
owner's profile plus **confirmed** facts, in the lists it already reads
(products and services → what we sell, customer types → target company
types, industries and applications → target industries, markets →
geographies, and so on). The match route stamps `deterministic-v1+brain-v1`
when the brain contributed. `scoring.ts` is byte-for-byte unchanged (AE3).

The explanation keeps three parts apart: TARGET FACTS (the listing, quoted),
ABC ANALYSIS (reasons citing that evidence) and — new — YOUR BUSINESS:
`ownerSideOfMatch` says, per matched term, whether the owner said it, their
website did, or it is ABC's reading. The owner's words win every tie;
`whatWeDo` is not credited, because the engine never reads it.

AE1 is the brief's example with the real engine: an owner who typed only
"Precision aluminium components" has no customer match with an invented
imaging-systems OEM exhibitor; once they confirm what ABC read, it is a
potential customer, with the listing's "Medical equipment OEM" as evidence.

### What to show

`what-to-show.ts` picks the owner's product whose own words (name,
description, tags) share the most terms with the target's listing, and the
highest-priority showable material for it. The Expo Mission shows it as
**ABC suggests showing …** only when the owner has not chosen a product;
their choice always wins, and the suggestion is a line, never a second
button.

### Learning, later

`BrainFeedbackSignal` names the feedback a later version may collect —
relevant, not relevant, good customer, wrong customer type, wrong industry,
already working with them, met, opportunity, CRM outcome. Nothing records or
acts on it. The rule for whoever builds it: a signal is evidence, never an
edit; no count of them changes a confirmed fact without the owner
confirming.

## 16. Tests for sections 14–15, and what they proved

`scripts/event-intelligence-engine-suite.ts`, sections **AB** (engine), **AC**
(network and website reading), **AD** (Product Brain), **AE** (matching, what
to show, the Expo Mission, the card), called from the main suite: 135 checks,
580 in total.

**Mutations**, each applied, run and restored byte-clean (16 of 16 caught):

| Broken on purpose | Caught by |
| --- | --- |
| drop the year from the edition key | T9–T11, AB32–AB37 and 8 more |
| drop provenance | J8, J10–J15, AB7, AB14, AB15, AB34, AB35 and more |
| merge companies on name alone | J2, J5, AB12, AB34 and 8 more |
| publish an unhealthy run | the run-record CHECK refuses it |
| brain facts readable by any account | AD24 (and RLS `WITH CHECK`) |
| analysis stored as a source fact | AD1, AD3, AD4, AD8, AD16 |
| overrun the website page limit | AC19, AC20 |
| unscoped listing source key | AB7, AB34–AB36 |
| proposed facts feed matching | AD14, AD17, AD25 |
| ignore robots.txt | AC4, AC7, AC11, AC16, AC23 |
| allow private addresses | AC1, AC3, AC4 |
| remove the withdrawal gate | AB18, AB21, AB38, AB41 |
| stop scrubbing contact details | AB6, AB9, AB55, AD7 |
| keep crawling after a 403 | AC9, AC10 |
| ignore AI opt-outs | AB3, AC6b, AD27a |
| read only the first robots group | AC6a |
