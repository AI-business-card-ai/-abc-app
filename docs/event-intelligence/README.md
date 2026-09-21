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

**D — the Smart Event Profile (new, owner-scoped, RLS).** `intel_products`,
`intel_event_materials`, `intel_meeting_briefs`, `intel_brief_materials`. What
the owner will show, and the meeting they are asking for. See §9.

An owner's whole chain — C and D both — hangs off their `abc_profiles` row by
cascade, so `remove_account_data()` deletes it without this feature editing that
function. The account-deletion suite seeds all eight tables and proves it.

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
`ingestEvent()` then does the work that is the same for every source.

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

Two, both additive, both applied **nowhere but locally**:

```
supabase/migrations/20260919120000_event_expo_intelligence.sql
supabase/migrations/20260920120000_event_smart_profile.sql
```

No existing migration is edited or renumbered (a test asserts it) — including
the first of these two, which the second builds on by adding a constraint
rather than by changing it. Both are applied in tests by PGlite, which runs
`schema.sql` plus every migration in order.

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
npm run test:event-intelligence     # 445 checks, including 500/2,000/5,000-row scale passes and the Expo Mission (§13)
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

## 12. What is not built

- **No real data source is connected.** A person can now bring their own CSV or
  JSON, which is the realistic first source; no crawler, API or vendor is wired
  up. See `apify-provider.md` for what connecting one would require, and §1 of
  it for the decisions that are the owner's rather than an engineer's.
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
- A product brain: the mission reuses the profile and products the owner typed.
- Hosted-Supabase performance: Home reads the owner's encounters to find the
  meetings at their fairs, like the Event Workspace does; measured nowhere but
  locally.
