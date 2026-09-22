# Event Intelligence — what the landing page may and may not say

For whoever updates the public site. Written from the branch, against what is
actually merged on `event-intelligence-v1`, so that BEFORE / DURING / AFTER can
be described without overstating anything.

**The feature is off in production.** It is behind a server-only flag that
defaults to off, has never been enabled, and holds no real data. Nothing below
is shipped to a customer today.

**Do not change the landing page from this branch.** This document is the
handoff; the edit belongs in the landing conversation.

## What is actually implemented

All of it against a synthetic dataset, on a feature branch, with the flag off.

- A company says what it does, what it sells, what it needs and who it wants to
  meet — four questions, with optional detail behind a disclosure.
- Per-event goals, optional.
- **A person can bring their own exhibitor list.** CSV or JSON from an
  organiser, uploaded in the app, with every row shown and classified — ready,
  needs checking, or cannot be imported — before anything is stored. Still no
  crawler and no vendor: the file comes from the user.
- Annual editions are kept apart. Ambiente 2026 and Ambiente 2027 are two
  events with two exhibitor lists, and one company exhibiting at both is one
  company with two stands.
- An exhibitor list is imported into a shared event graph with full provenance
  (provider, source URL, fetched-at, content hash). Re-importing changes
  nothing; a refresh updates only what moved and marks vanished exhibitors
  withdrawn rather than deleting them.
- Companies are de-duplicated by domain, then by a previously imported record,
  then by exact name plus an agreed country. Anything less certain is kept
  separate and flagged, never merged.
- Deterministic matching produces **ABC Match**, 0–100, in three explicit
  directions: potential customer, potential supplier, potential partner. Same
  inputs, same output, every time; weights are documented and versioned.
- A ranked list that stays usable at a real fair's size: search across company
  names, categories and products; filters by direction, hall, whether there is a
  stand, and whether it is saved; sorting by relevance, name or hall.
- A detail screen that separates **From the listing** (quoted source facts) from
  **ABC analysis** (inference, with the evidence each statement rests on).
- Saving a company as a private meeting target, with priority and a private note.
- A plan for the fair, grouped by priority and ordered by hall.
- Linking a target to a meeting the owner actually recorded, which is the only
  way a target is ever shown as met.
- **A Smart Event Profile per edition**: the products the company wants to talk
  about, and the material behind them — video, brochure, datasheet, offer or
  link — prepared for one fair and one year.
- **Meeting preparation per target**: pick the topic, the product and the
  material, write a short note, preview exactly what would go out, and hand it
  to your own share sheet, mail app or WhatsApp, or copy it. You pick the
  recipient and press send; ABC sends nothing and adds no address.

- **You can tell ABC when it was wrong.** Three taps on a suggestion — great
  target, relevant, not relevant — with an optional reason, plus a way to flag a
  company ABC should have found and did not. Private to the owner, off the main
  navigation, and it changes nothing about the company.

## What is prototype only

- **ABC ships no event data.** There is one synthetic demo fair with 21
  fictional exhibitors. Everything else has to be a file the user supplies —
  ABC does not have exhibitor lists for any real event.
- **No automatic data source.** No provider is connected, no actor chosen, no
  credentials stored. See `apify-provider.md`.
- **Matching is deterministic term overlap**, not a model. It is reproducible
  and explainable, and it is not clever.
- **Tested to 5,000 rows locally**, never against hosted Supabase. The import
  now issues a flat handful of database statements whatever the fair's size,
  but the measured timings are from a laptop database and say nothing about how
  it behaves in production.
- **Feedback teaches ABC nothing yet.** It is recorded and counted so the
  quality of the suggestions can be measured before anything is tuned. No
  weights change, and there is no self-improving loop.
- **The benchmark is a handful of opinions about one fair**, not a measurement
  of how ABC performs generally.
- **No pricing, entitlement or credit cost** has been decided or built.

## Still future

Not started, and not to be implied: real exhibitor acquisition, live directory
refresh, any AI-written conversation openers or questions, contact discovery of
exhibitor staff, outreach or messaging of any kind, walking-route optimisation,
calendar scheduling or appointment booking, competitor and market intelligence,
CRM prospect creation before a meeting.

## Safe public copy

Only if the section is unambiguously about what is coming, not what is available.

- "Before the event: know who is worth meeting."
- "Tell ABC what your company does and what you want from a fair."
- "See which exhibitors fit what you sell and what you need — and why."
- "Save the companies worth your time, with their hall and stand."
- "Bring the organiser's exhibitor list — ABC reads it and shows you what it found."
- "Search a fair of thousands of exhibitors down to the handful worth your time."
- "Decide what to show them before you get there."
- "Walk up with the right product, the right material and the right question."
- "Your plan for the fair, on your phone."
- "When you meet them, the relationship continues in ABC."

Keep the existing **Coming next** framing. Do not move Event Intelligence into
anything that reads as available, included in a plan, or purchasable.

## Unsafe claims

Each of these is either untrue today or untrue in principle.

| Do not say | Why |
| --- | --- |
| "Available now", "included in Pro", any price | Off in production; no entitlement decided. |
| "Covers every major trade fair", any event names, any exhibitor count | ABC ships no real event data. Naming a fair implies a dataset that does not exist. |
| "ABC knows who is exhibiting", "just pick your event" | The user brings the list. Import is real; a library of events is not. |
| "AI-powered matching", "AI finds your best leads" | V1 has no model in it. |
| "Know who will buy", "predicts your best prospects", any percentage read as a win rate | ABC Match is fit to a stated objective, explicitly not a probability. The product says so on screen and the marketing must not contradict it. |
| "Get their contact details before the event" | No personal data is collected, by design. |
| "Automated outreach", "message exhibitors before you go", "ABC sends the invitation" | ABC has no transport at all. The owner shares from their own device; nothing is sent by ABC. |
| "ABC learns from your feedback", "gets smarter with every use", "self-improving matching" | Feedback is recorded and counted. Nothing is retrained, retuned or reweighted by it. |
| "X% accurate", "proven match accuracy", any benchmark number | The benchmark is the owner's own opinions on one fair, and the product deliberately avoids the word accuracy. Publishing a rate as a product claim would misread it. |
| "Book a meeting", "confirmed meetings", "they accepted" | A brief is only ever draft, ready or shared. Nobody replies inside ABC, and there is no status that claims they did. |
| "Upload your videos and brochures to ABC" | Video and documents are **links** to where the company already hosts them. Even images are added by address in this form today. |
| "ABC finds the right person to contact", "reach the decision-maker" | ABC holds no person or address for an exhibitor. The owner chooses who the note goes to. |
| "Optimised route around the fair", "we schedule your meetings" | The plan is grouped and sorted; it is not a route or a schedule, and says so. |
| Any vendor or infrastructure name — Apify, scraper, crawler, lead scraper | Customer-facing language is "event listing" or "event directory". |
| Screenshots of the demo data presented as real companies | Every exhibitor in it is invented. If a screenshot is used, label it as an illustration. |

## One rule for whoever writes the copy

If a sentence would be false with the flag off and no real data loaded, it is
false today. That is the whole test.

## Update — Event Data Engine V1 and Product Brain V1 (2026-09-22)

What changed underneath, and how little it changes for the public site. The
feature is still off in production, still holds no real event data, and still
belongs under **Coming next**.

### Newly implemented (flag off, local only)

- **ABC checks an exhibitor list before it uses it.** Every import — an
  uploaded file included — is measured and refused if it looks broken: far
  fewer exhibitors than last time, most of the list about to disappear, names
  or halls suddenly missing. A refused import changes nothing.
- **Where every fact came from** is kept per listing, and ABC can say what
  changed between two versions of a list: new, moved hall, moved stand, new
  website, withdrawn.
- **ABC can read a company's own website** — a handful of pages, politely,
  never contact or legal pages, and not at all if the site asks AI crawlers to
  stay out — and show *This is how ABC understands your business*, each item
  marked as the company's own words, its website's, or ABC's reading. The
  company says "Looks right" or edits it, and nothing is used for matching
  until it does.
- **A suggestion of what to show** each target, from the company's own
  products, clearly labelled as ABC's suggestion.

### Still not true — do not imply

- **ABC has no real exhibitor data and reads no real directory.** The pilot
  event is MEDICA 2026 *in configuration only*. Its organiser reserves the
  exhibitor directory against AI crawlers, ABC respects that, no legal basis
  has been decided, and the pilot runs on invented test data. Do not name
  MEDICA or any fair.
- **No Apify or other vendor is connected.** An optional adapter exists and
  is unused.
- **No AI model.** The website reading and matching are deterministic rules.
- **Nothing is sent** and no exhibitor contact is collected — unchanged.

### Additional safe copy (Coming next framing only)

- "Tell ABC your website. It shows you how it understands your business — you
  confirm it."
- "ABC checks an exhibitor list before trusting it."
- "Know where every fact came from."
- "See what changed since you last looked: new exhibitors, moved stands."
- "A suggestion of what to show each company — yours to take or leave."

### Additional unsafe claims

| Do not say | Why |
| --- | --- |
| "ABC reads every trade-fair directory", "automatic exhibitor data", "live directory sync" | No real source is connected. The pilot directory is reserved against AI crawlers and ABC does not read it. |
| "AI understands your business", "ABC learns from you" | Deterministic rules, no model; feedback learning is only a planned shape. |
| "ABC knows what you sell" without the confirmation step | ABC proposes; the company confirms. Unconfirmed readings change nothing. |
| "ABC scans exhibitors' websites for you" | Only the owner's own site is read, on request. Reading exhibitors' sites is not built. |
| "Works with any website" | A site that opts out of AI crawlers is not read, by design. |
