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
- A ranked list with filters (all / customers / suppliers / partners / saved).
- A detail screen that separates **From the listing** (quoted source facts) from
  **ABC analysis** (inference, with the evidence each statement rests on).
- Saving a company as a private meeting target, with priority and a private note.
- A plan for the fair, grouped by priority and ordered by hall.
- Linking a target to a meeting the owner actually recorded, which is the only
  way a target is ever shown as met.

## What is prototype only

- **The data is invented.** One synthetic fair, 21 fictional exhibitors, written
  to exercise the engine. No real event has been imported.
- **There is no real data source.** No provider is connected, no actor chosen,
  no credentials stored. See `apify-provider.md`.
- **Matching is deterministic term overlap**, not a model. It is reproducible
  and explainable, and it is not clever.
- **Never run at scale.** Correct on 21 listings; untested on 5,000.
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
- "Your plan for the fair, on your phone."
- "When you meet them, the relationship continues in ABC."

Keep the existing **Coming next** framing. Do not move Event Intelligence into
anything that reads as available, included in a plan, or purchasable.

## Unsafe claims

Each of these is either untrue today or untrue in principle.

| Do not say | Why |
| --- | --- |
| "Available now", "included in Pro", any price | Off in production; no entitlement decided. |
| "Covers every major trade fair", any event names, any exhibitor count | No real event has been imported. Naming a real fair implies a dataset that does not exist. |
| "AI-powered matching", "AI finds your best leads" | V1 has no model in it. |
| "Know who will buy", "predicts your best prospects", any percentage read as a win rate | ABC Match is fit to a stated objective, explicitly not a probability. The product says so on screen and the marketing must not contradict it. |
| "Get their contact details before the event" | No personal data is collected, by design. |
| "Automated outreach", "message exhibitors before you go" | Not built, and out of scope. |
| "Optimised route around the fair", "we schedule your meetings" | The plan is grouped and sorted; it is not a route or a schedule, and says so. |
| Any vendor or infrastructure name — Apify, scraper, crawler, lead scraper | Customer-facing language is "event listing" or "event directory". |
| Screenshots of the demo data presented as real companies | Every exhibitor in it is invented. If a screenshot is used, label it as an illustration. |

## One rule for whoever writes the copy

If a sentence would be false with the flag off and no real data loaded, it is
false today. That is the whole test.
