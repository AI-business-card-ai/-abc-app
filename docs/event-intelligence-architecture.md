# ABC Event / Meeting Intelligence — architecture

**Status:** design only. No migration, UI, dependency or provider integration exists for this.
It is the first major expansion *after* the Berlin release and is not to be built before it.
Every table and type below is a proposal to be reviewed, not a decision.

## 1. What it adds

ABC today covers MEET → SCAN → REMEMBER → FOLLOW UP → CRM. This adds **FIND**, before the event:

> Given what my company does, sells and needs, and the event I am attending, which exhibitors are
> worth meeting, why, and what should I ask them?

The output is a short, ranked, explained list — not an exhibitor directory — that turns into a
plan, then into real meetings recorded the way ABC already records them.

## 2. Locked principles

1. **PERSON ≠ ENCOUNTER** (existing). A contact is a person; an encounter is a time you met them.
2. **TARGET ≠ ENCOUNTER** (new). A planned or suggested meeting is not a meeting. Nothing in this
   layer creates a `contact_encounters` row; only an actual interaction does, through the existing
   scan, QR, exchange or manual paths.
3. **COMPANY ≠ PERSON.** An exhibitor is a company present at an event. It becomes a contact only
   when the owner meets a person there and saves them.
4. **Facts ≠ inferences.** Source facts (what a public listing says) and ABC's reasoning (why it is a
   match) are stored and shown separately. Inference is never presented as fact.
5. **Never fabricate.** A missing hall, stand, website or contact stays missing.
6. **Providers are replaceable.** No core table or type depends on a provider's payload shape.
7. **No spam.** No bulk outreach, no messaging scraped personal contacts. Any pre-event message is
   one message the owner writes or approves and sends from their own account.

## 3. Three data layers, kept apart

| Layer | Contents | Owner | Visibility |
| --- | --- | --- | --- |
| **Private relationship graph** (exists) | `scanned_contacts`, `contact_encounters`, `scan_batches`, follow-ups, activities, opportunities, CRM mappings, notes | One ABC account | That account only (RLS, server-only credentials) |
| **Event / business graph** (new) | Events, companies, exhibitor presences, halls, stands, categories, public company attributes, source provenance | ABC (shared reference data) | Readable by every ABC account; written only by ingestion |
| **Aggregate intelligence** (new) | Company intent profiles, matches, targets, plans | One ABC account (matches, targets, plans) | That account only |

The rule that keeps them apart: **nothing from the private graph is written into the public
graph**, and public graph rows never hold an owner id. A match or target *references* a public
company and belongs to an owner; the company row itself knows nothing about who is interested in it.

## 4. Fit with the current model

| Exists today | Role in this design |
| --- | --- |
| `contact_encounters.event` / `event_normalized` and the Event Workspace (`lib/events/workspace.ts`) | The workspace derives an event from encounter text and was written to be fed by a real event entity later (`EventSummary` / `EventEncounter` shapes). An encounter gains an optional `event_id`; the derived workspace keeps working for encounters without one |
| `card_events` (name, city, dates, booth on the owner's public card) | The owner's own attendance and stand. Becomes a link from the owner to an `events` row, which also gives the owner's own hall/stand for route planning |
| `abc_profiles.what_i_do`, `looking_for`, `product_description`, `icp`, `goals` | Seed text for the company intent profile. Not replaced; the new profile is structured and per company |
| `scanned_contacts.company`, `website`, `linked_abc_user_id` | When a met person's company matches an exhibitor, a nullable `company_id` soft reference links them — resolved at write time, never a cascading key into the private graph |
| Multi-Card batches (`scan_batches.shared_event`) | A batch scanned at an event can carry `event_id`, so a stand visit is one batch linked to one target |
| CRM export (`lib/crm/export.ts`, `crm_object_mappings`) | Unchanged. Meetings with a target's company export exactly as other encounters do; match reasoning is not pushed unless the owner adds it to a note |
| Account deletion (`remove_account_data`) | Must delete the owner's intent profiles, matches, targets and plans. Public graph rows are untouched |

## 5. Proposed entities

### Public graph (no owner column)

```
events
  id, name, name_normalized, edition_year, starts_on, ends_on,
  city, country, venue, website_url, status
  unique (name_normalized, edition_year)

companies
  id, legal_name, display_name, name_normalized,
  website_domain, country, description_public, categories[]
  unique (website_domain) where website_domain is not null

event_company_presences          -- "exhibitor"
  id, event_id -> events, company_id -> companies,
  hall, stand, pavilion, exhibitor_categories[], products_public[],
  listing_url
  unique (event_id, company_id)

source_records                    -- provenance, one row per fetched fact set
  id, provider, provider_record_id, source_url,
  fetched_at, content_hash, payload_version,
  entity_type ('event' | 'company' | 'presence'), entity_id
  unique (provider, provider_record_id, payload_version)
```

Every public attribute is traceable to a `source_records` row (field-level provenance can be added
as `{field: source_record_id}` on each entity if needed). `fetched_at` and `content_hash` drive
refresh. Public people are **out of scope** for the first version: no personal names, emails or
phones are ingested from exhibitor listings.

### Aggregate intelligence (owner-scoped, RLS, deleted with the account)

```
company_intent_profiles
  id, user_id, company_name,
  what_we_do, what_we_sell[], what_we_buy[],
  target_industries[], target_company_types[],
  capabilities[], certifications[], geographies[]

event_objectives
  id, user_id, event_id, intent_profile_id,
  goals[], sell_focus[], buy_focus[], partner_focus[], notes

company_matches
  id, user_id, event_objective_id, presence_id,
  relationship ('customer' | 'supplier' | 'partner'),
  score (0..100), model_version, matched_at,
  reasoning jsonb   -- ABC inference: why, what to offer, what they may need,
                    -- opening question, discovery questions, next step
  facts_used uuid[] -- source_records the reasoning relied on
  unique (event_objective_id, presence_id, relationship)

meeting_targets
  id, user_id, company_match_id,
  status ('saved' | 'planned' | 'met' | 'skipped'),
  priority, planned_window, notes,
  met_encounter_id -> contact_encounters (nullable, set only when a real meeting is recorded)

event_plans
  id, user_id, event_id, target_ids uuid[] (ordered), updated_at
```

`meeting_targets.met_encounter_id` is how TARGET ≠ ENCOUNTER stays true: a target is marked met by
pointing at an encounter the owner actually created, never by creating one.

## 6. Ingestion and the provider seam

```ts
interface EventDataProvider {
  readonly id: string                                  // 'apify:<actor>', 'csv', 'manual', 'official:<org>'
  fetchEvent(query: EventQuery): Promise<ProviderEvent[]>
  fetchExhibitors(eventRef: ProviderEventRef): AsyncIterable<ProviderExhibitor>
}
```

- **Implementations:** `ApifyEventProvider`, `OfficialEventApiProvider`, `CsvEventProvider`,
  `ManualImportProvider`. Only the provider module knows its payload shape.
- **Normalisation:** each provider maps to `ProviderEvent` / `ProviderExhibitor` (ABC's own types:
  name, website, country, hall, stand, categories, description, listing URL, provider record id).
  Core ingestion accepts only those types.
- **Idempotency:** upsert by `(provider, provider_record_id, payload_version)` in `source_records`;
  entity upserts by natural keys (`events.name_normalized + edition_year`,
  `companies.website_domain`, `event_company_presences (event_id, company_id)`). Re-running an import
  changes nothing when `content_hash` is unchanged.
- **Deduplication:** companies by website domain first; then normalised legal name + country, flagged
  for review rather than merged automatically when only names match. Merges are recorded, never
  silent.
- **Refresh:** scheduled re-fetch per event while it is upcoming; a presence missing from a newer
  fetch is marked withdrawn, not deleted, so existing targets do not dangle.
- **Permission:** each provider/source records the basis for using it (public listing, licence,
  organiser agreement). **OWNER REVIEW** per source before ingestion; respect robots and terms.
- **Isolation:** ingestion runs server-side with the service role in its own module and job, never in
  a request path an owner triggers directly.

## 7. Matching pipeline

1. **Candidate filter (deterministic):** presences at the event whose categories/products overlap the
   objective's sell, buy or partner focus; geography and exclusion rules.
2. **Scoring (model-assisted):** for each candidate, a model receives the owner's intent profile and
   the company's *source facts only*, and returns a score, relationship type and structured reasoning.
   The prompt forbids stating anything not present in the facts; the response names which facts it
   used (`facts_used`).
3. **Validation:** reasoning that cites no fact, or contradicts one, is dropped. Scores are stored
   with `model_version` so results are reproducible and re-rankable.
4. **Presentation:** "From the listing" (facts, with source link) is shown apart from "Why ABC
   suggests them" (inference). Hall and stand appear only when the source has them.
5. **Owner action:** save target → plan → at the event, scan or record the meeting as usual → the
   target is marked met by linking the encounter → follow-up and CRM continue unchanged.

## 8. Privacy and security

- Public graph: public business information only; provenance on every row; no personal data about
  exhibitor staff in version one.
- Owner-scoped tables: RLS by `user_id`, server-only writes for matches (the model runs server-side),
  deleted in `remove_account_data`.
- An owner's intent profile and matches are never used to train shared models or shown to other
  owners. Aggregate, non-personal analytics (for example which categories attract interest at an
  event) only after an explicit product and legal decision — **OWNER REVIEW**.
- Model inputs for matching contain the owner's company profile and public facts, not the owner's
  private contacts or notes.
- Store disclosures (`docs/store/*`) must be updated before launch of this layer.

## 9. API boundaries (future)

- `GET /api/events?query=` — public graph search (read-only).
- `GET /api/events/:id/exhibitors` — paginated presences (facts only).
- `POST /api/intel/objectives` — owner creates an event objective.
- `POST /api/intel/objectives/:id/match` — enqueue matching; results polled or streamed.
- `GET /api/intel/objectives/:id/matches` — owner's matches with facts and reasoning separated.
- `POST /api/intel/targets` / `PATCH /api/intel/targets/:id` — save, plan, skip, mark met
  (met requires an existing encounter id owned by the caller).
- Pre-event outreach, if built: a draft generated for one target, sent only by an explicit owner
  action through the existing Gmail connector; no bulk endpoint.

## 10. Migration strategy

1. Public graph tables and `source_records` (additive; no change to existing tables).
2. Owner-scoped intelligence tables with RLS; extend `remove_account_data`.
3. Nullable `event_id` on `contact_encounters`, `scan_batches`, `card_events`; backfill nothing
   automatically — link only when an owner confirms, or when normalised event text matches an
   `events` row unambiguously.
4. Switch the Event Workspace loader to prefer `event_id` while keeping the derived fallback.
5. Providers and matching behind a feature flag; no UI until an event has verified data.

## 11. Open decisions (OWNER REVIEW)

- Which events and sources first; licence or permission per source.
- Whether Apify is used, which actors, and cost limits.
- Pricing/entitlement for the layer (Pro, per event, credits) — not decided here.
- Whether public people (named exhibitor contacts) are ever ingested, and on what basis.
- Retention of fetched source payloads.
- Whether Apexpo later becomes the shared network for exhibitors and organisers; this design keeps
  the public graph ABC-owned and portable to that boundary.
