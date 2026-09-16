# Google Play Data safety — fact matrix (draft)

**Status:** draft, not submitted. Built from `docs/store/data-inventory.md`. Google's
definitions decide the final answers; anything uncertain is **OWNER REVIEW**.

## Overview answers

| Question | Draft answer | Basis |
| --- | --- | --- |
| Does the app collect or share user data? | Yes (collects) | Account, profile, card and contact data |
| Is all collected data encrypted in transit? | Yes | HTTPS only; `cleartext: false`, no mixed content |
| Can users request that their data be deleted? | Yes — in the app, and via the web page | Settings → Profile & Account → Delete account; `/account-deletion` |
| Account deletion URL (Play Console) | `https://<canonical origin>/account-deletion` | **OWNER REVIEW:** canonical origin |
| Committed to the Families policy | No — not directed at children | Privacy §10 |
| Independent security review | No | Do not claim one |

## Data sharing

Play does not count as "sharing": transfers to service providers processing on ABC's behalf
(Supabase, Vercel, Anthropic, Resend, Stripe), and transfers the user initiates to a service they
chose (sending mail through their Gmail, pushing contacts to their CRM, adding a Google Wallet
pass). On that basis the draft answer is **No data shared**. **OWNER REVIEW:** confirm this
reading of Play's definitions.

## Data types collected

| Play category | Data type | Collected | Optional? | Purposes | Notes |
| --- | --- | --- | --- | --- | --- |
| Personal info | Name | Yes | Required for a card | App functionality, account management | |
| Personal info | Email address | Yes | Required | App functionality, account management | |
| Personal info | Phone number | Yes | Optional | App functionality | Only if added to the card |
| Personal info | User IDs | Yes | Required | App functionality, account management | Supabase account id |
| Personal info | Other info | Yes | Optional | App functionality | Role, company, links, card text |
| Photos and videos | Photos | Yes | Optional | App functionality | Uploaded card images. Scan photos are processed and not stored — **OWNER REVIEW:** whether transient processing is "collection" |
| Contacts | Contacts | **OWNER REVIEW** | Optional | App functionality | Not the device address book; people the owner scans or types in |
| App activity | App interactions | **OWNER REVIEW** | — | Analytics | Public card views and link clicks, recorded about the owner's card |
| Financial info | Purchase history | **OWNER REVIEW** | — | App functionality | Web purchases only; none in the app |
| Messages | Emails | **OWNER REVIEW** | Optional | App functionality | Drafts and emails the owner sends through a connected Gmail; ABC does not read the inbox |
| Location, Health, Audio, Files and docs, Calendar, Web browsing, Device IDs | — | No | — | — | No such permission or collection; voice-note transcription is not reachable from the UI |

## Permissions to declare

`INTERNET`, `CAMERA` only. No location, contacts, microphone or storage permission.
