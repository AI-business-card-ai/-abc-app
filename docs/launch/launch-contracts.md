# ABC launch contracts — facts from the code

**Status:** written from the combined release candidate `landing-cinematic-system` @
`bd7199281aa3936352c53e0b6d4cc98b9fd3b3ed` on 2026-09-17. Nothing here has been
configured, submitted or deployed. Values in `<angle brackets>` are owner decisions or
console values the repository cannot know. **No secret values appear in this document.**

Every row names the code it comes from, so it can be re-checked when the code changes.

- [1. Environment variables](#1-environment-variables)
- [2. Callback and URL matrix](#2-callback-and-url-matrix)
- [3. Canonical origin dependencies](#3-canonical-origin-dependencies)
- [4. Native app ID dependencies](#4-native-app-id-dependencies)
- [5. Provider scopes](#5-provider-scopes)
- [6. Release blockers found in the code](#6-release-blockers-found-in-the-code)

---

## 1. Environment variables

Extracted from every `process.env.*`, `process.env['…']` and named `env[...]` lookup in
`app/`, `lib/`, `components/`, `middleware.ts`, `next.config.js` and
`capacitor.config.ts`. 60 names in total; test scripts are excluded.

`.env.local.example` lists only 17 names and is **not** a complete inventory — use this table.

### Required for the base app

| Variable | Read by | Format / behaviour when missing |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | `lib/supabase*.ts`, `middleware.ts`, native auth routes | Project URL. App cannot start without it. Public (shipped to the browser). |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `lib/supabase*.ts`, `middleware.ts` | Anon / publishable key. Public. |
| `SUPABASE_SERVICE_ROLE_KEY` | `lib/supabase.ts`, `lib/supabase/service.ts` | Server only. Every privileged route fails without it. Never in a client file (verified: no `'use client'` file reads it). |
| `NEXT_PUBLIC_APP_URL` | `lib/auth/redirect.ts`, `lib/email.ts`, `lib/billing/stripe.ts`, `lib/google/gmail-connect.ts`, `app/api/auth/native/start`, `app/api/stripe/*`, `app/page.tsx`, `app/api/card/context` | The canonical origin, no trailing slash. Drives email links, landing `metadataBase`/canonical, Stripe return URLs, the Gmail redirect URI and the native sign-in return. Several fall back to `https://abccard.io` when unset (`lib/email.ts`, `app/page.tsx`, `lib/email-safety.ts`); Stripe checkout answers `app_origin_not_configured`; native sign-in answers `native_auth_unavailable`. |
| `ANTHROPIC_API_KEY` | `lib/claude.ts`, `lib/ai-messages.ts`, `lib/ai-scoring.ts`, `lib/event-normalizer.ts`, `lib/company-field-estimator.ts`, `app/api/contact/message`, `app/api/onboarding/complete`, `app/api/pipeline/insights` | Card/badge extraction, Smart Follow-up and message drafts. Scanning does not work without it. |
| `RESEND_API_KEY` | `lib/email.ts`, `app/api/email/send` | Welcome email and card-exchange / QR-connect notifications. Sender is hard-coded `hello@abccard.io` (`lib/email.ts`). |
| `EXCHANGE_RATE_LIMIT_SALT` | `lib/rate-limit.ts` | HMAC salt for public rate limits. **Fails closed:** unset, the public card exchange (`app/api/card/exchange`) refuses submissions. |

### Required for Google sign-in and Apple sign-in

No application variable. Both are Supabase Auth providers (`lib/google-oauth.ts`,
`lib/apple-oauth.ts`) configured in the Supabase dashboard. Google sign-in requests no
scopes beyond Supabase's defaults.

### Required for Gmail

| Variable | Read by | Notes |
| --- | --- | --- |
| `GOOGLE_CLIENT_ID` | `lib/google/gmail-connect.ts`, `lib/google-gmail-auth.ts` | The Google OAuth client used for the Gmail connector (and token refresh). |
| `GOOGLE_CLIENT_SECRET` | same | Server only. |
| `CRM_TOKEN_ENCRYPTION_KEY` | `lib/crm/oauth-state.ts` | Also signs the Gmail connector's OAuth state cookie. Without it Gmail connect throws. |
| `NEXT_PUBLIC_APP_URL` | `lib/google/gmail-connect.ts` | Builds the redirect URI. |

### Required for CRM connectors

| Variable | Read by | Notes |
| --- | --- | --- |
| `CRM_TOKEN_ENCRYPTION_KEY` | `lib/crm/encryption.ts`, `lib/crm/oauth-state.ts`, `lib/connectors/native.ts` | Base64 of exactly 32 bytes (AES-256-GCM). Throws if missing or the wrong length. **Rotating it makes every stored CRM token and in-flight native attempt unreadable** — owners would reconnect. |
| `HUBSPOT_CLIENT_ID`, `HUBSPOT_CLIENT_SECRET`, `HUBSPOT_REDIRECT_URI` | `lib/crm/hubspot-oauth.ts` | All three required; unset = HubSpot not configured. |
| `SALESFORCE_CLIENT_ID`, `SALESFORCE_CLIENT_SECRET`, `SALESFORCE_REDIRECT_URI` | `lib/crm/salesforce-oauth.ts` | All three required. |
| `SALESFORCE_LOGIN_HOST` | `lib/crm/salesforce-oauth.ts` | Optional; defaults to `https://login.salesforce.com`. |
| `PIPEDRIVE_CLIENT_ID`, `PIPEDRIVE_CLIENT_SECRET`, `PIPEDRIVE_REDIRECT_URI` | `lib/crm/pipedrive-oauth.ts` | All three required. |

### Required for Apple Wallet

`lib/card/wallet.ts` (`APPLE_REQUIRED`), read in `lib/card/wallet-apple.ts`. PEM values may
be stored as PEM or base64 of the PEM.

| Variable | Notes |
| --- | --- |
| `APPLE_PASS_TYPE_IDENTIFIER` | The Pass Type ID (`pass.…`). |
| `APPLE_TEAM_IDENTIFIER` | Apple Developer Team ID. |
| `APPLE_PASS_CERTIFICATE` | Pass Type ID certificate, PEM. |
| `APPLE_PASS_PRIVATE_KEY` | That certificate's private key, PEM. |
| `APPLE_WWDR_CERTIFICATE` | Apple WWDR intermediate certificate, PEM. |
| `APPLE_PASS_PRIVATE_KEY_PASSPHRASE` | **Optional** (`APPLE_OPTIONAL`) — only if the key is encrypted. |

### Required for Google Wallet

`lib/card/wallet.ts` (`GOOGLE_REQUIRED`), read in `lib/card/wallet-google.ts`.

| Variable | Notes |
| --- | --- |
| `GOOGLE_WALLET_ISSUER_ID` | Numeric issuer ID from the Google Pay & Wallet Console. |
| `GOOGLE_WALLET_SERVICE_ACCOUNT_EMAIL` | Service account with Wallet Object issuer access. |
| `GOOGLE_WALLET_SERVICE_ACCOUNT_KEY` | The service account's private key (PEM, with literal `\n` accepted, or base64). |
| `GOOGLE_WALLET_CLASS_ID` | Either `<issuer>.<suffix>` or just the suffix. The code creates the Generic class if it does not exist. |

### Required for billing

`lib/billing/stripe.ts`, `lib/billing/catalog.ts`, `lib/billing/ledger.ts`.

| Variable | Notes |
| --- | --- |
| `STRIPE_SECRET_KEY` | Must match `sk_test_…`, `sk_live_…`, `rk_test_…` or `rk_live_…`; otherwise billing reports not configured. |
| `STRIPE_WEBHOOK_SECRET` | Must match `whsec_…`; otherwise `/api/stripe/webhook` answers 503. |
| `STRIPE_PRICE_SCAN_PACK_8` + `SCAN_PACK_8_CREDITS` | €8 pack. A pack is purchasable only when **both** are set; the credit count is **not decided**. |
| `STRIPE_PRICE_SCAN_PACK_17` + `SCAN_PACK_17_CREDITS` | €17 pack; same rule. |
| `STRIPE_PRICE_SCAN_PACK_28` + `SCAN_PACK_28_CREDITS` | €28 pack; same rule. |
| `STRIPE_PRICE_PRO_EVENT` + `PRO_EVENT_PASS_DAYS` | Pro Event Pass; duration **not decided**. |
| `STRIPE_PRICE_PRO_MONTHLY` | Pro Monthly subscription. |
| `STRIPE_PRICE_PRO_ANNUAL` | Pro Annual subscription. |
| `SMART_SCAN_LEDGER` | `on` switches scan allowance from legacy plan counters to the credit ledger (`lib/billing/ledger.ts`); anything else = legacy. On first read with the ledger on, remaining legacy allowance is carried over once as an opening balance (`lib/scan/entitlement.ts`). |
| `STRIPE_PRICE_STARTER`, `STRIPE_PRICE_GROWTH`, `STRIPE_PRICE_PRO`, `STRIPE_PRICE_TEAM` | **Legacy** `/pricing` subscriptions (`lib/stripe-prices.ts`). See blocker B1. |

### Required for the native apps

| Variable | Where | Notes |
| --- | --- | --- |
| `NATIVE_AUTH_SECRET` | server, `lib/native/auth-flow.ts` | At least 32 characters. Unset or shorter: native sign-in declines to start. Web sign-in never uses it. |
| `CRM_TOKEN_ENCRYPTION_KEY` | server | Native Gmail/CRM connections (see above). |
| `ABC_NATIVE_ORIGIN` | build machine only, `capacitor.config.ts` | **Optional**; defaults to `https://www.abccard.io`. Must be a bare `https` origin and not a `*.vercel.app` host. |

### Platform-provided

`NODE_ENV`, `VERCEL_URL`, `VERCEL_GIT_COMMIT_SHA` (copied to `NEXT_PUBLIC_BUILD_SHA` by
`next.config.js`). Nothing to set.

### Dead — no longer read by any shipped code

| Variable | Status |
| --- | --- |
| `PERPLEXITY_API_KEY` | Removed with contact enrichment. Not read. |
| `APOLLO_API_KEY` | Removed. Not read. |
| `ENRICHLAYER_API_KEY` | Removed. Not read. |
| `OPENAI_API_KEY` | Removed with voice-note transcription. Not read. |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Listed in `.env.local.example`; no code reads it (checkout is server-created). |

The four removed provider names are still referenced only in tests that assert they are
absent (`scripts/test-final-release-cleanup.ts`, `scripts/test-native-shell.ts`) and in
docs. **Owner:** delete them from every hosting environment and revoke them at the
providers.

---

## 2. Callback and URL matrix

`<origin>` = the canonical origin, i.e. the value of `NEXT_PUBLIC_APP_URL`.
`<project-ref>` = the Supabase project reference in `NEXT_PUBLIC_SUPABASE_URL`.

| Contract | Exact value | Source | Registered where |
| --- | --- | --- | --- |
| Supabase OAuth provider callback (Google, Apple sign-in) | `https://<project-ref>.supabase.co/auth/v1/callback` | Supabase platform; `lib/native/auth-flow.ts` builds `…/auth/v1/authorize` | Google Cloud OAuth client (sign-in) → Authorized redirect URIs; Apple Services ID → Return URLs |
| App auth callback (web OAuth, sign-up confirmation fallback, password reset) | `<origin>/auth/callback?next=…` | `lib/auth/redirect.ts` (uses the browser origin, falls back to `NEXT_PUBLIC_APP_URL`), `app/(auth)/forgot-password/page.tsx` | Supabase → Auth → URL Configuration → Redirect URLs |
| Email token-hash confirmation | `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=…` | `app/auth/confirm/route.ts`, `docs/auth-email-links.md` | Supabase email templates (uses Site URL; no allowlist entry needed) |
| Native sign-in return | `<origin>/auth/native/return?flow=<sealed>` | `app/api/auth/native/start/route.ts`, `lib/native/deep-link.ts` | Supabase Redirect URLs |
| Native custom scheme — sign-in | `io.abccard.app://auth/callback?code=…&flow=…` | `lib/native/deep-link.ts`, `AndroidManifest.xml`, `Info.plist` | Nothing to register (app manifest) |
| Native custom scheme — connectors | `io.abccard.app://connect/callback?attempt=…&handoff=…` (or `&result=cancelled|failed`) | `lib/native/deep-link.ts` | Nothing to register |
| Gmail connector callback | `<origin>/api/auth/google-gmail/callback` | `lib/google/gmail-connect.ts` (derived from `NEXT_PUBLIC_APP_URL`) | Google Cloud OAuth client used for `GOOGLE_CLIENT_ID` → Authorized redirect URIs |
| HubSpot callback | `<origin>/api/auth/hubspot/callback` | route `app/api/auth/hubspot/callback`; value comes from `HUBSPOT_REDIRECT_URI` | HubSpot app → Auth → Redirect URL; must equal the env value exactly |
| Salesforce callback | `<origin>/api/auth/salesforce/callback` | route `app/api/auth/salesforce/callback`; `SALESFORCE_REDIRECT_URI` | Salesforce Connected App → Callback URL |
| Pipedrive callback | `<origin>/api/auth/pipedrive/callback` | route `app/api/auth/pipedrive/callback`; `PIPEDRIVE_REDIRECT_URI` | Pipedrive Marketplace app → Callback URL |
| Native connector callbacks | same four callbacks as above | `lib/connectors/native.ts` (an `abcn.` state takes the native branch) | No extra provider entry |
| Stripe webhook | `<origin>/api/stripe/webhook` | `app/api/stripe/webhook/route.ts` | Stripe → Developers → Webhooks |
| Stripe checkout return (Pro, Scan Packs) | `<origin>/settings/billing?checkout=success&session_id={CHECKOUT_SESSION_ID}` / `?checkout=cancelled` | `lib/billing/checkout.ts` | Set per session by code; nothing to register |
| Stripe checkout return (legacy plans) | `<origin>/pricing/success?session_id={CHECKOUT_SESSION_ID}` / `<origin>/pricing/cancel` | `app/api/stripe/checkout/route.ts` | Set per session by code |
| Account deletion (public) | `<origin>/account-deletion` | `app/account-deletion/page.tsx` | Google Play → Data safety → Delete account URL; App Store review notes |
| Privacy | `<origin>/privacy` | `app/privacy/page.tsx` | App Store Connect, Play Console, Google OAuth consent screen |
| Terms | `<origin>/terms` | `app/terms/page.tsx` | Google OAuth consent screen; store listings |
| Support contact | `mailto:support@abccard.io` — **no support route exists** | `components/landing/PublicFooter.tsx`, `app/account-deletion/page.tsx` | Store listings (support URL can be `<origin>/` or a mailto per store rules — owner) |
| Apple App Site Association | `<origin>/.well-known/apple-app-site-association` — **not published** | `native-shell/README.md` | Publish only with the real Team ID and bundle ID |
| Android asset links | `<origin>/.well-known/assetlinks.json` — **not published** | `native-shell/README.md` | Publish only with the real package name and Play App Signing SHA-256 |
| Google Wallet save | `GET <origin>/api/card/wallet/google` → 302 to Google's save URL `https://pay.google.com/gp/v/save/<jwt>`; JWT `origins: ['https://abccard.io']`; logo `https://abccard.io/wallet/abc-wallet-logo.png` | `lib/card/wallet-google.ts` (`GOOGLE_WALLET_ORIGIN`) | Google Pay & Wallet Console issuer |
| Apple Wallet pass | `GET <origin>/api/card/wallet/apple` → `.pkpass` download; no pass web service URL; pass links to `https://abccard.io/d/<slug>` | `lib/card/wallet-apple.ts`, `lib/card/types.ts` (`CARD_PUBLIC_BASE`) | Nothing to register |
| Public card | `https://abccard.io/d/<slug>` (hard-coded apex) | `lib/card/types.ts`, `app/api/card/resolve/[slug]` | — |

Middleware (`middleware.ts`) does not protect `/.well-known/*`, `/auth/*`, `/api/*`,
`/privacy`, `/terms` or `/account-deletion`, so provider fetchers and signed-out visitors
reach them.

---

## 3. Canonical origin dependencies

The code already treats both `https://www.abccard.io` and `https://abccard.io` as ABC
(`lib/native/config.ts` `ABC_WEB_ORIGINS`, `lib/scan/qr-parse.ts`). It does **not** agree on
which one is canonical: the native default is `www`, while the hard-coded links and
fallbacks listed below use the apex.

**Once the owner confirms the canonical origin, these change:**

| Place | Today | Changes by |
| --- | --- | --- |
| `NEXT_PUBLIC_APP_URL` (Vercel) | unknown | configuration |
| Landing `metadataBase` / `canonical` / `og:url` | `NEXT_PUBLIC_APP_URL`, fallback apex (`app/page.tsx`) | configuration |
| Email links (welcome, exchange notifications) | `NEXT_PUBLIC_APP_URL`, fallback apex (`lib/email.ts`, `lib/email-safety.ts`) | configuration |
| Stripe success / cancel / portal return | `NEXT_PUBLIC_APP_URL` | configuration |
| Gmail redirect URI | `NEXT_PUBLIC_APP_URL` + `/api/auth/google-gmail/callback` | configuration + Google Cloud |
| HubSpot / Salesforce / Pipedrive redirect URIs | `*_REDIRECT_URI` env | configuration + each provider console |
| Native sign-in return | `NEXT_PUBLIC_APP_URL` + `/auth/native/return` | configuration + Supabase allowlist |
| Native app origin (what the WebView loads) | `ABC_NATIVE_ORIGIN`, default `https://www.abccard.io` (`lib/native/config.ts`) | build configuration; code default if apex is chosen |
| Supabase Site URL | unknown | Supabase dashboard |
| Supabase Redirect URLs | unknown | Supabase dashboard |
| Supabase email templates | `{{ .SiteURL }}` | follows Site URL |
| Apple Sign In (Services ID domains / return URLs) | Supabase callback; site domain | Apple Developer |
| Google Wallet `origins` claim and logo URI | `https://abccard.io` hard-coded (`lib/card/wallet-google.ts`) | **code** if `www` is canonical and the apex does not serve the logo |
| Public card links, QR codes, Wallet pass links, card resolve API | `https://abccard.io/d/<slug>` hard-coded (`lib/card/types.ts`, `app/api/card/resolve/[slug]`) | **code**, or keep and rely on an apex → www redirect |
| OG image for public cards | `https://abccard.io/api/card/og/<slug>` (`app/d/[slug]/page.tsx`) | **code**, or redirect |
| Card footer / exchange modal / 404 "made with ABC" links | apex (`components/card/DigitalCardView.tsx`, `CardExchangeModal.tsx`, `app/d/[slug]/not-found.tsx`) | code, or redirect |
| AASA / assetlinks | not published | must be served on the canonical host (and on the apex if apex links should open the app) |
| Store listings, OAuth consent screen, Play deletion URL | not entered | consoles |
| Legal text | "Service available at abccard.io", "Prices are at abccard.io/pricing" | legal decision |

If the apex redirects to `www` with a permanent redirect that preserves path and query,
every hard-coded apex link keeps working; the only code item that needs checking on
staging is Google Wallet (the `origins` claim and the logo host).

---

## 4. Native app ID dependencies

Provisional ID `io.abccard.app` (not changed by this task). Current references:

| File | Use |
| --- | --- |
| `lib/native/config.ts` | `NATIVE_APP_ID`, `NATIVE_URL_SCHEME` |
| `capacitor.config.ts` | `appId` (from `NATIVE_APP_ID`) |
| `ios/App/App.xcodeproj/project.pbxproj` | `PRODUCT_BUNDLE_IDENTIFIER` (Debug and Release) |
| `ios/App/App/Info.plist` | `CFBundleURLName` and `CFBundleURLSchemes` (custom scheme) |
| `android/app/build.gradle` | `namespace`, `applicationId` |
| `android/app/src/main/java/io/abccard/app/MainActivity.java` | Java package (and directory) |
| `android/app/src/main/res/values/strings.xml` | `package_name`, `custom_url_scheme` |
| `android/app/src/main/AndroidManifest.xml` | custom-scheme intent filter (via `custom_url_scheme`) |
| `lib/native/deep-link.ts` | `io.abccard.app://auth/callback`, `io.abccard.app://connect/callback` |
| `scripts/test-native-shell.ts`, `scripts/test-native-connectors.ts` | assertions |
| `native-shell/README.md`, `docs/store/*` | documentation |

**What depends on the final confirmation:**

- iOS bundle identifier → Apple Developer App ID (with Sign in with Apple and Associated
  Domains capabilities if used) → provisioning profiles → App Store Connect record
  (**the bundle ID cannot be changed after the first upload**).
- Android application ID → Play Console app (**permanent after the first upload**) → Play App
  Signing key → its SHA-256 for `assetlinks.json`.
- Custom URL scheme `io.abccard.app://` → sign-in and connector hand-back (server pages
  write it; the apps listen for it).
- AASA `appIDs`: `<Team ID>.<bundle ID>`; `assetlinks.json` `package_name`.
- Provider redirects: none use the app ID (all providers return to web callbacks, which
  hand back through the scheme).

---

## 5. Provider scopes

| Provider | Scopes | Source |
| --- | --- | --- |
| Google sign-in | Supabase defaults (openid, email, profile); none added | `lib/google-oauth.ts` |
| Gmail connector | `openid email https://www.googleapis.com/auth/gmail.send` | `lib/google/gmail-connect.ts` |
| Google Wallet (server) | `https://www.googleapis.com/auth/wallet_object.issuer` | `lib/card/wallet-google.ts` |
| HubSpot | `oauth crm.objects.contacts.read crm.objects.contacts.write crm.objects.companies.read crm.objects.companies.write` | `lib/crm/hubspot-oauth.ts` |
| Salesforce | `api refresh_token`, with PKCE (S256) | `lib/crm/salesforce-oauth.ts` |
| Pipedrive | not sent in the URL; the Pipedrive app must be configured with `contacts:full` and `activities:full` | `lib/crm/pipedrive-oauth.ts` |
| Apple sign-in | none | `lib/apple-oauth.ts` |

---

## 6. Release blockers found in the code

Code changes are **not** made by this audit. Each item needs an owner decision first.

**B0 — Android cannot receive the native connector hand-back (code change needed).**
Connecting Gmail, HubSpot, Salesforce or Pipedrive in the store apps ends with the browser
opening `io.abccard.app://connect/callback?attempt=…&handoff=…` (`lib/native/deep-link.ts`,
`lib/native/handback-page.ts`). The only custom-scheme intent filter in
`android/app/src/main/AndroidManifest.xml` is
`<data android:scheme="@string/custom_url_scheme" android:host="auth" android:path="/callback" />`,
which matches sign-in (`io.abccard.app://auth/callback`) but not host `connect`. The
manifest was last changed by the native shell commit (`fbd3b78`); the native connector
commit (`4efaeb9`) did not add a filter. On Android the hand-back therefore resolves to no
app and the connection cannot be claimed. iOS registers the whole scheme
(`CFBundleURLSchemes`) and is not affected. Static finding: confirm on an Android device;
the fix is an additional intent filter for host `connect`, path `/callback` (not made here).

**B1 — The in-app upgrade path sells the legacy plans (owner decision, then code).**
Settings → Plan & Billing → **Upgrade** links to `/pricing` (`components/settings/BillingSettingsView.tsx`),
which sells monthly USD subscriptions Starter $29, Growth $49, Pro $89, Team $199
(`lib/stripe-prices.ts`, `app/pricing/page.tsx`) with lifetime scan caps, and lists
features the product does not have: "Priority enrichment" (enrichment was removed),
"Shared contacts" and "Team pipeline" (the landing FAQ says shared team workspaces are not
available). This contradicts the locked commercial model (free card, Smart Scan Packs,
ABC Pro) shown on the landing page. There is also no in-app purchase UI for Smart Scan
Packs (the catalog and `/api/billing/checkout` support them; nothing calls them).
`scripts/setup-stripe.ts` creates obsolete products ("Unlimited scans") — **do not run it.**

**B1a — A legacy Growth purchase cannot be recorded (verify in production).** The last
migration that sets `abc_profiles_plan_check` (`20260712160000_internal_test_plan.sql`)
allows `free, starter, pro, team, INTERNAL_TEST` — no `growth`. Replaying the repository
migrations locally, `update abc_profiles set plan = 'growth'` is rejected (23514), so the
webhook's `legacyPlanActivated` would fail after the customer has paid and Stripe would
retry. Production may differ (some migrations were applied by hand); check with the query
in the runbook before any legacy plan is sold.

**B2 — Legal text out of date (legal decision).** Terms §3 says sign-in is via Google OAuth
(email and Apple exist); Terms §5 describes monthly paid plans; Terms §6 still lists
"enrichment estimates"; Privacy and Terms carry the legal-entity placeholder and the
August 8, 2026 effective date.

**B3 — Store purchase strategy (commercial and legal decision).** The apps offer no purchase
but honour web-bought Pro and credits (`lib/billing/commerce.ts`); Apple guideline
3.1.3(b) risk is documented in `native-shell/README.md`.

**B4 — Native icons and splash are Capacitor defaults** (`native-shell/README.md`) — not
store-ready; needs the approved brand assets.

**B5 — Hard-coded privileged e-mail addresses (owner confirmation).** `lib/scan-limits.ts`
grants unmetered scanning to the founder address and to one additional personal address
(`SCAN_LIMIT_EXEMPT_EMAILS`). Confirm the second address is still intended before launch.

Not blockers, but decisions the code is waiting on: canonical origin (§3), final app ID
(§4), Smart Scan pack quantities and Pro prices/duration (billing env above), whether to
switch `SMART_SCAN_LEDGER` on, retention period for `account_deletions`.
