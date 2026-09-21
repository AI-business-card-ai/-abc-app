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
| "Book a meeting", "confirmed meetings", "they accepted" | A brief is only ever draft, ready or shared. Nobody replies inside ABC, and there is no status that claims they did. |
| "Upload your videos and brochures to ABC" | Video and documents are **links** to where the company already hosts them. Even images are added by address in this form today. |
| "ABC finds the right person to contact", "reach the decision-maker" | ABC holds no person or address for an exhibitor. The owner chooses who the note goes to. |
| "Optimised route around the fair", "we schedule your meetings" | The plan is grouped and sorted; it is not a route or a schedule, and says so. |
| Any vendor or infrastructure name — Apify, scraper, crawler, lead scraper | Customer-facing language is "event listing" or "event directory". |
| Screenshots of the demo data presented as real companies | Every exhibitor in it is invented. If a screenshot is used, label it as an illustration. |

## One rule for whoever writes the copy

If a sentence would be false with the flag off and no real data loaded, it is
false today. That is the whole test.
