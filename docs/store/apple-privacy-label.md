# App Store privacy label — fact matrix (draft)

**Status:** draft, not submitted. Built from `docs/store/data-inventory.md`. Apple's
definitions decide the final answers; anything uncertain is **OWNER REVIEW**.

## Tracking

**No.** ABC contains no advertising, attribution or third-party analytics SDK, does not link
data with third-party data for advertising, and does not share data with data brokers.
**OWNER REVIEW:** confirm no marketing pixels are added to the web origin the apps load.

## Data collected — linked to the user

| Apple category | Data type | Collected | Purpose (Apple) | Notes |
| --- | --- | --- | --- | --- |
| Contact Info | Name | Yes | App Functionality | Profile and public card |
| Contact Info | Email Address | Yes | App Functionality | Account; public card email if the owner adds one |
| Contact Info | Phone Number | Yes | App Functionality | Only if the owner adds it to their card |
| Contact Info | Physical Address | No | — | Free-text "location" on the card only — **OWNER REVIEW** |
| User Content | Photos or Videos | Yes | App Functionality | Profile photo, cover, logo, showcase images the owner uploads. Scanned card photos are processed and not kept |
| User Content | Other User Content | Yes | App Functionality | Card text, links, events, meeting notes, follow-up drafts |
| Contacts | Contacts | **OWNER REVIEW** | App Functionality | ABC never reads the device address book. It stores people the owner scans or types in. Apple's "Contacts" category means the user's address book; data about other people entered by the user is usually disclosed as User Content |
| Identifiers | User ID | Yes | App Functionality | Supabase account id |
| Purchases | Purchase History | **OWNER REVIEW** | App Functionality | No purchase is possible in the app. Web purchases (Stripe) are linked to the account and their state is shown in the app |
| Usage Data | Product Interaction | **OWNER REVIEW** | Analytics / App Functionality | ABC records views and link clicks on the owner's *public card* (by other people, with a source tag and referrer), not in-app behaviour |
| Diagnostics | Crash / Performance | No SDK | — | Server logs only — **OWNER REVIEW** |
| Location | Precise / Coarse | No | — | No location permission |
| Sensitive Info, Health, Financial Info, Browsing History, Search History | — | No | — | Payment card details are entered on Stripe's page on the web, never in the app |

## Data used to track you

None.

## Notes for the questionnaire

- Account deletion is available in the app (Settings → Profile & Account → Delete account).
- Sign in with Apple is offered alongside Google sign-in.
- Optional connections (Gmail, HubSpot, Salesforce, Pipedrive) send the owner's own outgoing
  messages or pushed contacts to the service the owner connected, at the owner's request.
