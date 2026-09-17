# Event & Expo Intelligence — V1 implementation decision record

Written before any code on `event-intelligence-v1`, after auditing the release
candidate it is branched from. It records what the audit found, what is reused,
what is added, and why — so the choices below can be argued with rather than
reverse-engineered.

**Base:** `origin/release-final-blocker-fixes` @ `f1766d7`
**Architecture read:** `origin/event-intelligence-architecture` @ `869639a`,
`docs/event-intelligence-architecture.md` (design only, 211 lines). Its locked
principles are carried forward unchanged; its proposed table names are revised
below where the real schema made them ambiguous.

## 1. What the audit found

| Area | State in the RC | Consequence for this feature |
| --- | --- | --- |
| Event Workspace | `lib/events/workspace.ts` derives events from `contact_encounters.event` / `event_normalized`; `eventKeyFromName()` slugs the name into the URL. No `events` table exists. | The event *key* is already a shared address space. Intelligence events key themselves with the same function, so one fair has one key whether it is known from meetings, from a directory, or both. No backfill, no `event_id` column, nothing to migrate. |
| `contact_encounters` | Owner-scoped, composite FK `(contact_id, user_id)` → `scanned_contacts (id, user_id)`; column-level `GRANT UPDATE` of exactly five columns; no `DELETE` for `authenticated`. | The encounter bridge must use the same composite-key trick, so a target can only ever point at an encounter the *same owner* recorded. |
| Privilege convention | Every new table does `REVOKE ALL FROM PUBLIC, anon, authenticated` first, because Supabase default privileges grant `ALL` on creation, then grants explicit columns. | Omitting a GRANT withholds nothing. Every new table must revoke first or it is world-writable. |
| Account deletion | `remove_account_data()` deletes per-owner rows table by table; `test:account-deletion` check **G1** asserts *every* public table with a `user_id`/`owner_id` column is accounted for. | Adding owner-scoped tables **requires** extending `remove_account_data`. This is the guard working as designed, not a convenience edit. See §7. |
| Feature flags | None exist. | Introduce the smallest server-authoritative one. |
| Tests | Standalone `tsx scripts/test-*.ts` files; `check(label, got, want)`; PGlite (`@electric-sql/pglite`) applies `schema.sql` + every migration for real RLS/privilege proof, with an `ENVIRONMENT_ONLY` pinned skip list. | New suite follows the same shape and proves RLS against a real Postgres, not a mock. |
| PWA | All same-origin navigations are `NetworkOnly`; `/api/` untouched. Nothing signed-in is stored. | New routes inherit safety. No `next.config.js` change; asserted by test rather than assumed. |
| AI | `lib/claude.ts` + live Anthropic usage elsewhere. | The V1 engine must not import it. A named interface is defined and left unimplemented. |
| Design system | `components/ui/abc/` (`Button`, `Bits`), `abc-surface`, `abc-page-top`, `text-abc-*`, `abc-focus-ring`. | Reused as-is. No cinematic landing system inside the app. |
| Name collision | `supabase/migrations/20260626160000_event_intelligence.sql` already exists and is **unrelated** — it adds per-contact enrichment columns (`events_past`, `person_bio`). | New migration is named `..._event_expo_intelligence.sql`; new tables are prefixed `intel_` so nothing reads ambiguously against it. |

## 2. Reused, not rebuilt

- `eventKeyFromName()` — one key space for derived and directory events.
- `EventSummary` / `EventEncounter` / `EventDetailView` — the existing workspace
  is untouched; intelligence is a sibling view of the same fair.
- `components/ui/abc/*`, the `abc-*` token set, `EmptyState`, `SectionLabel`.
- `createServerComponentClient` / `createRouteHandlerClient`, `serverErrorResponse`.
- The composite-FK ownership pattern from `contact_encounters`.

## 3. Route strategy

Everything new lives under one reserved static segment inside the events model:

```
/events                                          existing list (+ flag-gated entry card)
/events/intelligence                             hub: events with directory data
/events/intelligence/[eventKey]                  overview + ranked matches + filters
/events/intelligence/[eventKey]/setup            company intent + event objective
/events/intelligence/[eventKey]/plan             event plan
/events/intelligence/[eventKey]/m/[matchId]      match detail
```

`/events/[eventKey]` is **not modified**. The one cost is that `intelligence`
becomes a reserved event key, because a static segment beats a dynamic one in
the App Router. That is closed rather than accepted: the hub first asks the
existing loader for a workspace under the key `intelligence` and renders the
existing `EventDetailView` when the owner really has a fair by that name, so no
owner can lose a page they have today — with the flag off or on.

## 4. Feature flag

`ABC_EVENT_INTELLIGENCE`, read server-side only in `lib/event-intelligence/flag.ts`.

- **No `NEXT_PUBLIC_` prefix**, so the value cannot reach the client bundle and
  cannot be flipped by anything the browser sends.
- Default **OFF**: absent, empty or unrecognised is off. Only `1`, `true`, `on`
  or `yes` (trimmed, case-insensitive) enable it.
- Pages call `notFound()` when off — the route is truthfully absent, not a
  teaser. API routes answer `404`, not `403`, for the same reason.
- It gates *reads and writes*, not just rendering, so the UI being hidden is
  never the only thing standing between production and this data.

## 5. Data separation

Three layers, as the architecture doc requires, kept apart by table:

**Public event/business graph — no owner column, service-role writes only**
`intel_events`, `intel_companies`, `intel_company_presences`, `intel_source_records`.
Readable by any signed-in account (`GRANT SELECT TO authenticated`), never by
`anon`, never writable through PostgREST. Ingestion runs with the service role.

**Private intelligence — owner-scoped, RLS, deleted with the account**
`intel_company_profiles`, `intel_event_objectives`, `intel_matches`,
`intel_meeting_targets`.

**Private relationship graph — untouched**
`scanned_contacts`, `contact_encounters`, `scan_batches`, follow-ups, CRM.
Nothing in this feature writes to any of them.

The Event Plan is **derived** from `intel_meeting_targets`, not stored. A stored
ordering would be a second source of truth to keep in step with saves, removals
and source refreshes, and V1 has no route optimisation for it to hold.

## 6. Matching seam

`EventMatchEngine` takes intent + objective + presence facts and returns
`{ matchType, score, reasons, evidence, warnings }`. V1 ships one deterministic,
pure, reproducible implementation with documented weights and **no AI provider**.
`MatchInsightGenerator` is declared as a type only — no implementation, no
Anthropic import — so a later optional adapter has somewhere to land.

Source facts and ABC inference are separate fields end to end: a reason carries
the `evidence` it came from, and the UI renders "From the listing" apart from
"ABC analysis". Nothing generated is presented as sourced.

## 7. Dependency on a locked area — reported, not silently taken

Adding owner-scoped tables forces one change inside the account-deletion area,
which the brief lists as locked:

- A new migration `CREATE OR REPLACE`s `remove_account_data()` to also delete the
  four `intel_*` owner tables, and the pinned `OWNER_TABLES` list in
  `scripts/test-account-deletion.ts` gains them.

This is additive and branch-local. It cannot change launch behaviour: the tables
do not exist in production, the release migrations are not edited or renumbered,
and with no rows the function does the same work it does today. Check **G1**
exists precisely to fail until this is done. Flagged here and in the final report.

Nothing else on the locked list is touched: no pricing, Stripe, credits, auth,
Gmail, CRM, Wallet, native bundle, service worker, legal copy or landing claims.

## 8. Migration plan

One additive migration, `supabase/migrations/20260919120000_event_expo_intelligence.sql`,
applied **locally only** (PGlite in tests). No remote Supabase. No existing
migration file is edited or renumbered.

## 9. Ingestion

`EventDataProvider` is the only thing core code knows about. V1 implements
`JsonFixtureProvider` over a checked-in synthetic dataset. Normalisation,
deduplication and provenance live in core; payload shape lives in the provider.
No Apify dependency, token, call or actor choice — contract documented only.
