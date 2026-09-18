# ApifyEventProvider — contract, not an implementation

**Status: not built, not connected, not chosen.** No Apify dependency is
installed, no token is stored, no actor has been selected and no run has ever
been made. This document exists so that when the owner decides to acquire real
exhibitor data, the work is an afternoon of writing one file against a contract
that already exists — and so that the decisions which are *not* engineering
decisions are visible before anybody starts.

Everything here describes one possible implementation of
`EventDataProvider` (`lib/event-intelligence/provider.ts`). ABC's core knows
nothing about Apify and must continue to know nothing: a test in
`scripts/test-event-intelligence.ts` fails if the word appears in
`lib/event-intelligence/ingest.ts`.

## 1. Decisions the owner has to take first

None of these are for an engineer to settle quietly while implementing.

| Decision | Why it is not technical |
| --- | --- |
| **Which events** | Each directory has its own terms of use. |
| **Which source per event** | An organiser's own API, where one exists, beats scraping their site on every axis — legality, stability, completeness, cost. |
| **Whether Apify at all** | A hosted scraping platform is one option; an organiser agreement or a CSV export from the organiser are others, and both are cheaper and safer. |
| **Which actor** | Actors are third-party code with their own maintainers, licences and failure modes. Picking one is picking a dependency. |
| **Cost ceiling** | Runs are billed. A refresh schedule is a recurring charge that has to be sized against what the feature earns. |
| **Legal basis per source** | Public listing, licence, or organiser agreement. Recorded per source before ingestion, not after. |
| **Personal data** | Out of scope for this phase and should stay out. See §8. |

## 2. What ABC would ask Apify for

Exactly the fields in `ProviderEvent` and `ProviderExhibitor`, and nothing more.
An actor that returns fifty fields is fine; the adapter drops forty of them.

```ts
class ApifyEventProvider implements EventDataProvider {
  readonly id = `apify:${actorId}`          // part of the source record key
  readonly displayName = 'Event directory'  // what an owner reads, never "Apify"
  readonly payloadVersion = 'v1'            // bump when the actor's shape changes

  fetchEvent(ref: ProviderEventRef): Promise<ProviderEvent | null>
  fetchExhibitors(ref: ProviderEventRef): AsyncIterable<ProviderExhibitor>
}
```

`displayName` is deliberately not the vendor's name. Customers are told the data
came from an event directory, which is true; which infrastructure fetched it is
ABC's business and not a product feature.

### Input

One actor run per event, with input built entirely by ABC:

```jsonc
{
  "startUrls": ["<the event's exhibitor directory>"],
  "maxItems": 5000,          // a ceiling, so a misconfigured run cannot bill unboundedly
  "proxyConfiguration": {},  // owner decision, per source
}
```

`ProviderEventRef.providerEventId` carries whatever identifies the event to that
actor — usually the directory URL. It is opaque to ABC's core.

### Output mapping

The adapter's only real job. Every field is optional except a name, and a field
the actor did not return becomes `null` or `[]`, never a default.

| ABC field | Typical actor field | Rule |
| --- | --- | --- |
| `providerRecordId` | `id`, `url` | **Must be stable across runs.** See §3. |
| `companyName` | `name`, `exhibitorName` | Required. A record without one is dropped, not invented. |
| `website` | `website`, `url` | Normalised by `normalizeDomain`; junk becomes `null`. |
| `country` | `country`, `address.country` | Never inferred from the event's country. |
| `companyDescription` | `about`, `description` | Quoted, never summarised by the adapter. |
| `hall` / `stand` | `hall`, `booth`, `stand` | **Never derived from each other.** Absent stays absent. |
| `eventCategories` | `categories`, `tags` | Passed through `sourceList`. |
| `productsServices` | `products` | Passed through `sourceList`. |
| `listingUrl` | `url` | The page a human can open to check. |
| `sourceUpdatedAt` | `lastUpdated` | Only if the source states it. Never `now()`. |

Anything that does not map is discarded at the adapter boundary. It must not
reach core in a `raw` or `extra` bag — that is how a vendor's shape leaks into
an application one convenient field at a time.

## 3. Idempotency

The property that makes refreshes safe, and it rests entirely on
`providerRecordId` naming the same real-world thing on every run.

- A listing URL is usually stable; an array index never is. An actor whose only
  identifier is its position in the output is **not usable** — re-running it
  would renumber every exhibitor and ABC would resolve each one to the wrong
  company.
- `intel_source_records` is unique on `(provider, provider_record_id,
  payload_version)`. The same record at the same payload version is one row
  however many times it arrives.
- `contentHash` over the *normalised* payload decides whether anything is
  written. An unchanged listing updates `last_seen_at` and touches no other
  field, so a nightly refresh of an unchanged directory is a pile of reads.
- Already proved end to end against the fixture provider: re-importing 21
  listings creates nothing, updates nothing, and rewrites no row.

## 4. Provenance

Every company and presence ingested from Apify must be traceable to where it
came from, exactly as fixture data already is. Core ingestion writes an
`intel_source_records` row per record without the adapter asking:

| Column | Filled from | Notes |
| --- | --- | --- |
| `provider` | `ApifyEventProvider.id` | `apify:<actor>`. Stored, never displayed — the screen says "Event directory" (`sourceDisplayName`). |
| `provider_record_id` | `ProviderExhibitor.providerRecordId` | The stable id from §3. |
| `payload_version` | `ApifyEventProvider.payloadVersion` | Bumped when the actor's shape changes. |
| `source_url` | `listingUrl` | The page a human can open to check a fact. |
| `fetched_at` | the run's completion time | When ABC saw it, not when the source changed it. |
| `source_updated_at` | `sourceUpdatedAt` | Only when the source states it. |
| `content_hash` | computed by core | Over the normalised payload, so a cosmetic actor change does not look like a data change. |

A refresh updates these rows; it never deletes them. The match detail shows the
source kind, URL and fetch date under every suggestion, so a reader can always
see how old a fact is and where to verify it.

## 5. Company identity

Unchanged by the provider — resolution lives in `ingest.ts` and applies to every
source. Domain first, then a previously imported provider record, then exact
normalised name plus an agreed country when neither side has a domain, and
otherwise a new company flagged as a merge candidate. An actor that returns a
company's own identifier may make that a fourth tier later; it is not a reason
to loosen the other three.

## 6. Run mechanics

| Concern | Approach |
| --- | --- |
| **Trigger** | A server job. Never a request path an owner can hit: ingestion writes shared data that is not theirs, and a button that starts a billed run is a button somebody will hold down. |
| **Credentials** | `APIFY_TOKEN` server-side only, never `NEXT_PUBLIC_`. Absent means the provider is unavailable, not that it runs unauthenticated. |
| **Pagination** | The actor's dataset is read in pages and yielded as an async iterable, so ingestion writes while later pages arrive. `fetchExhibitors` is already an `AsyncIterable` for this reason. |
| **Run status** | Start, poll until `SUCCEEDED`; `FAILED`, `ABORTED` and `TIMED-OUT` raise and write nothing. A partial dataset must not be treated as a complete one, or every exhibitor missing from it is marked withdrawn. |
| **Retry** | Exponential backoff on transport and 5xx only. Never retry a `FAILED` run automatically — it bills again for the same failure. |
| **Rate limiting** | One run per event per refresh window, and a hard ceiling on concurrent runs. The ceiling is a cost control, not a politeness measure. |
| **Timeout** | A run that exceeds the window is aborted rather than left billing. |

## 7. Refresh

- Re-fetch while an event is upcoming; stop once it has ended.
- A presence missing from a newer complete fetch is marked `withdrawn`, never
  deleted, so a saved target cannot dangle.
- **Private state is never touched by a refresh.** Targets, priorities and
  private notes belong to the owner; a changed listing changes the listing.
  Re-running matching clears only matches nobody saved a target against.
- `payload_version` is bumped when the actor's output shape changes, which
  re-imports everything under new source records rather than silently mixing two
  shapes under one hash.

## 8. What must not be collected

Phase 1 ingests companies, not people. The `ProviderExhibitor` contract has no
field for a person's name, email, phone or social profile, and a test fails if
one is added.

An actor that returns staff contact details must have them dropped at the
adapter boundary. Collecting them would be a privacy decision with a legal basis
behind it — a separate product review, not a schema change — and ABC has no
product need for them: the owner meets people at the stand and scans their card,
which is the part ABC already does well.

No bulk outreach is built on any of this. Any future pre-event message is one
message the owner writes or approves, sent from their own account.

## 9. Before the first real run

- [ ] Owner has chosen the source and recorded its legal basis.
- [ ] Terms of use and `robots.txt` reviewed for that source.
- [ ] Cost ceiling and refresh cadence agreed.
- [ ] `providerRecordId` confirmed stable across two real runs.
- [ ] Synthetic and real data distinguishable in the database (`provider` on
      every source record already does this: `fixture:*` is never real).
- [ ] Store and privacy disclosures (`docs/store/*`) updated if the data
      collected changes.
- [ ] A dry run against one event, reviewed by a human against the live
      directory, before any second event.
