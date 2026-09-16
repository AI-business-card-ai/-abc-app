# ABC data inventory — facts from the code

**Status:** draft for owner review, written from the code on `berlin-privacy-readiness` and
reconciled with `berlin-final-release-cleanup`.
Not legal advice. Nothing here has been submitted anywhere. Items marked **OWNER REVIEW**
need a decision or confirmation this document cannot make.

Every row names where the fact comes from, so it can be re-checked when the code changes.
`npm run test:privacy-readiness` pins the facts that are cheap to pin.

## Who processes what

| Service | Receives | When | Code |
| --- | --- | --- | --- |
| Supabase | All account, profile, card, contact, meeting, billing-state and credential data; auth; card image storage | Always (database, auth, storage) | `lib/supabase*.ts` |
| Vercel | Every request (hosting) | Always | deployment — **OWNER REVIEW:** hosting log retention and region |
| Anthropic (Claude) | Card/badge photos for text extraction; contact, meeting context and the owner's profile preferences for message drafts, event-name normalisation, CRM field estimates and scoring | When the owner scans, or asks for a draft | `lib/claude.ts`, `lib/ai-messages.ts`, `app/api/contact/message/route.ts`, `lib/event-normalizer.ts`, `lib/company-field-estimator.ts`, `lib/ai-scoring.ts` |
| Stripe | Account id and email at checkout; payment details are entered on Stripe's page | Web purchases only; the store apps offer no checkout | `lib/billing/*`, `lib/billing/commerce.ts` |
| Resend | Recipient email and message content | Welcome email; card-exchange and QR-connect notifications to the card owner | `lib/email.ts`, `lib/welcome-email.ts` |
| Google — sign-in | Supabase's default identity scopes (openid, email, profile) | Owner chooses Sign in with Google | `lib/google-oauth.ts` (no `scopes` passed) |
| Google — Gmail | `gmail.send` only, plus `openid email` to name the mailbox; the message the owner sends; on disconnect, the stored token to Google's revocation endpoint | Owner connects Gmail (separate consent) and presses send; owner disconnects Gmail | `lib/google/gmail-connect.ts`, `lib/gmail.ts`, `lib/google/gmail-disconnect.ts` |
| Google — Wallet | Name, role, company, public card URL in a Wallet object | Owner adds their card to Google Wallet | `lib/card/wallet-google.ts` |
| Apple — Sign in | Apple's identity (email or private relay address) | Owner chooses Sign in with Apple | `lib/apple-oauth.ts` |
| Apple Wallet | A pass file generated on the server and downloaded to the owner's device; not sent to Apple by ABC | Owner adds their card to Apple Wallet | `lib/card/wallet-apple.ts` (no web service URL) |
| HubSpot / Salesforce / Pipedrive | The contact, company, meeting and follow-up being pushed | Owner connects a CRM and pushes | `lib/crm/export.ts`, `lib/crm/providers/*` |
| IMG.LY CDN (`staticimgly.com`) | A download request for the background-removal model; **the photo is processed on the device** | Owner creates a hero cutout in the card editor | `lib/card/cutout.ts`, `lib/card/cutout-assets.ts` |

No advertising, analytics, attribution or crash-reporting SDK is present
(`package.json`; no gtag, PostHog, Segment, Sentry or similar in the code).

**Removed providers.** Contact enrichment through Perplexity, Apollo and EnrichLayer, and voice-note
transcription through OpenAI (Whisper), were unreachable from the UI and are removed from the code:
no route, library or component calls them or reads their API keys
(`npm run test:final-release-cleanup` pins this). Enrichment fields written before the removal stay
in the owner's contacts and are deleted with the account.
**OWNER REVIEW:** remove `PERPLEXITY_API_KEY`, `APOLLO_API_KEY`, `ENRICHLAYER_API_KEY` and
`OPENAI_API_KEY` from the hosting environment if they are set, and rotate them at the providers.

## By data category

| Category | What | Stored where | Visible to | Deleted with account |
| --- | --- | --- | --- | --- |
| Account | Email, auth identity, provider (email, Google, Apple) | Supabase Auth | Owner | Yes — auth user deleted last |
| Profile & public card | Name, role, company, phone, WhatsApp, public email, website, location, languages, social links, tagline, card theme, links, events, showcase captions | `abc_profiles`, `card_links`, `card_events`, `card_showcase_items` | Owner; **public** where the owner publishes the card and leaves the field switched on (`redactHiddenFields`) | Yes |
| Uploaded images | Profile photo, cover, logo, hero cutout/graphic, showcase images | Supabase Storage `card-media/<owner id>/…` (public bucket: a file is served by its URL; once `20260918120000_card_media_no_public_listing.sql` is applied listing is limited to each folder's owner and ABC's server, and only the owner can write, replace or delete in their folder); legacy `avatars/<owner id>/…` — **OWNER REVIEW:** the `avatars` bucket's policies are not in the repository; check them in production | Anyone with a file's URL (the public card shows it) | Yes — owner folders removed before the auth user |
| Scanned card photos (Single Scan) | The photo | **Not stored.** Sent to Anthropic, then discarded; only a SHA-256 digest is kept as the idempotency key of a Smart Scan credit | — | Ledger summarised, then removed |
| Multi-Card photos | The photo | **Not stored.** Extracted fields and the model's text (`raw_ocr`) per card are kept in `scan_batch_items` | Owner | Yes |
| Contacts | Data about other people the owner scanned, typed, or received through card exchange: name, email, phone, company, role, LinkedIn URL, notes, AI-drafted messages, pipeline fields | `scanned_contacts` | Owner only (RLS) | Yes |
| Meetings / context | Where met, what was discussed, next step, follow-up date, capture origin | `contact_encounters`, `scan_batches` | Owner only | Yes |
| Follow-ups & activity | Sequences, activities, opportunities | `followup_sequences`, `crm_activities`, `crm_opportunities` | Owner only | Yes |
| Card exchange (reverse lead) | A visitor to a public card submits name, email, phone, company, role | Saved into the **card owner's** contacts; the owner is emailed | Card owner | With the card owner's account; the visitor has no ABC account |
| Public card analytics | Per view: source tag and HTTP referrer; link click counts | `card_views`, `card_links.click_count` | Owner | Yes |
| Rate limiting | Salted HMAC of IP address / email / card, with a hit count and window | `public_rate_limits` | Server only | Not linked to an account; expires with its window |
| Smart Scan credits | Grants, consumptions, balance | `scan_credit_ledger` | Owner (read) | Summarised into `account_deletions`, then removed |
| Pro / purchases | Product, status, periods, Stripe subscription or Checkout Session id, Stripe customer id | `billing_entitlements`, `abc_profiles.stripe_customer_id` | Owner (read) | Summarised, then removed |
| Deletion record | Status, attempts, Stripe customer id, credit/purchase/Pro summaries — no name, email, card or contacts | `account_deletions` | Server only | **Retained** — **OWNER REVIEW:** retention period is not decided |
| Stripe webhook history | Event id, type, status, timestamps; no payload, no owner | `stripe_webhook_events` | Server only | Retained (not personal data) |
| Gmail connection | Connected mailbox address, refresh and access tokens | `abc_profiles` (credential columns not readable by the browser) | Server only | Yes. Also removed when the owner disconnects Gmail (Settings → Integrations), when Google reports the grant revoked, or on account deletion |
| CRM connections | Provider account id, API host, tokens (AES-256-GCM encrypted) | `crm_connections`; object id mappings in `crm_object_mappings` | Server only | Yes. Records pushed into the CRM stay in the CRM |
| Native connection attempts | Owner, provider, hashed state/nonce/handoff, encrypted tokens until claimed (≤ 10 minutes) | `native_connector_attempts` | Server only | Yes |
| Device storage (web/PWA/apps) | Session cookies; pending native sign-in/connect nonce (minutes); small UI preferences | Browser / WebView | Device | Signed out on deletion |

## Google — facts to keep explicit

- **Normal Google sign-in is identity only.** `signInWithGoogle` passes no scopes; Supabase requests
  its defaults (openid, email, profile). Signing in never grants mail access.
- **Gmail is a separate connector with its own consent screen**, started only from the message
  screen ("Connect Gmail to send from here") or from Settings → Integrations, never from sign-in
  (`components/chat/MessageComposer.tsx`, `components/settings/IntegrationsSettingsView.tsx`,
  `app/api/auth/google-gmail/route.ts`).
- **Gmail can be disconnected in the app:** Settings → Integrations → Gmail → Disconnect, with or
  without ABC Pro. ABC clears the connected flag, mailbox address and both tokens for the signed-in
  account, then asks Google to revoke the grant. Revocation is best effort: if Google cannot be
  reached the tokens are still gone from ABC, and the owner can also remove access at
  `myaccount.google.com/permissions`. Google sign-in, the session and the account email are not
  touched (`lib/google/gmail-disconnect.ts`, `app/api/auth/google-gmail/disconnect/route.ts`).
- **Scope: `https://www.googleapis.com/auth/gmail.send`**, with `openid email` to label which
  mailbox was connected.
- **ABC does not read the Gmail inbox.** The only Gmail API call is
  `POST gmail/v1/users/me/messages/send` (`lib/gmail.ts`).
- **ABC does not read Google Contacts** through this connector or anywhere else; no People or
  Contacts API is called.
- Nothing is sent automatically: every Gmail send is a request the owner makes from a message
  screen; there is no scheduled or background sender (no cron, no queue).

## Native apps

- **iOS:** `NSCameraUsageDescription` (scanning cards, badges, QR codes) and
  `NSPhotoLibraryAddUsageDescription` (saving images such as the card QR). No photo-library read,
  location, contacts, microphone or tracking permission.
- **Android:** `INTERNET`, `CAMERA` (camera hardware optional). No storage, location, contacts or
  microphone permission.
- Photos are chosen through the system picker. Files (vCard, CSV, QR image, Apple Wallet pass) are
  handed to the system share sheet. Links to other sites open in the system browser.
- Deep links: `io.abccard.app://auth/callback` (sign-in) and `io.abccard.app://connect/callback`
  (Gmail/CRM connection); neither carries a token.
- The apps offer no purchase (`lib/billing/commerce.ts`).
- Android Back closes a full-screen layer first (the presented card, its QR code, the Multi-Card
  camera), then goes back in page history, then minimises the app (`lib/native/shell.ts`,
  `lib/native/back-handlers.ts`). The web, PWA and iOS are unaffected.

## Privacy and Terms — what changed and what is left

Corrected on this branch because the text was factually wrong or incomplete:

1. Privacy §2 said account information comes "via Google OAuth". Accounts are also created with
   email and password, and with Sign in with Apple.
2. Privacy §5 said data is shared "only with" a fixed list that omitted services the owner chooses
   to use: Google (Gmail sending, Google Wallet), Apple (sign-in), HubSpot, Salesforce, Pipedrive.
3. Privacy §8 did not mention in-app account deletion, which now exists.
4. Privacy §2, §3, §4 and §5 and Terms §1 described contact enrichment by third-party business data
   providers. Those providers are removed from the code, so those sentences are removed.

Left for owner or legal review — not changed:

- **OWNER REVIEW:** Privacy §1 legal entity placeholder.
- **OWNER REVIEW:** Privacy effective date after the corrections above.
- **OWNER REVIEW:** Privacy §8 support-request deletion timeframe and "except where law requires
  retention" — the in-app deletion keeps an anonymised purchase and credit summary so payments can
  be accounted for; whether and how long that is kept is a legal decision.
- **OWNER REVIEW:** Terms §6 still lists "enrichment estimates" among AI outputs. The CRM field
  estimates made with Anthropic still exist; the wording is a legal choice.
- **OWNER REVIEW:** the home page ("AI messages + enrichment") and the pricing page ("Priority
  enrichment") still advertise enrichment. That copy is part of the pricing and plan decision and
  was not changed.
- **OWNER REVIEW:** Terms §10 says an account can be deleted at any time; in-app deletion requires
  cancelling a renewing ABC Pro subscription first.
- **OWNER REVIEW:** controller/processor wording for contact data received through card exchange.
- **OWNER REVIEW:** Supabase and Vercel regions and hosting log retention.
