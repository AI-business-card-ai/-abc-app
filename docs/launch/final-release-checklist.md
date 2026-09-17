# ABC final release checklist

**Release candidate:** `landing-cinematic-system` @ `bd7199281aa3936352c53e0b6d4cc98b9fd3b3ed`
(contains `berlin-final-release-cleanup` @ `8f9f2a1` and `landing-rc-sync` @ `145550a`), plus the code
blocker fixes on `release-final-blocker-fixes` (from `launch-owner-runbook` @ `6bc90dd`).
**As of:** 2026-09-17. A box is ticked only for work verified in the repository. **No external
action has been done** — every console, device and store box is open.

Details for each item: [owner-launch-runbook.md](owner-launch-runbook.md). Facts:
[launch-contracts.md](launch-contracts.md).

## CODE COMPLETE

Verified present in the combined release candidate:

- [x] PWA private-data cache hardening (`next.config.js`, `public/sw-cache-cleanup.js`; `test:pwa`, `test:pwa-private-cache`)
- [x] Native iOS/Android shell (`capacitor.config.ts`, `ios/`, `android/`, `lib/native/shell.ts`; `test:native`)
- [x] Native sign-in flow (`app/api/auth/native/*`, `app/auth/native/return`)
- [x] Native connector OAuth claim-back (`app/api/connectors/native/*`, `lib/connectors/native.ts`; `test:native-connectors`)
- [x] Account deletion (`app/api/account/delete`, `/settings/account/delete`, `/account-deletion`; `test:account-deletion`)
- [x] Auth token-hash confirmation route (`app/auth/confirm`; `test:auth-links`)
- [x] Error-surface sanitisation (`lib/api/errors.ts`; `test:error-surface`)
- [x] Gmail disconnect (`app/api/auth/google-gmail/disconnect`; `test:final-release-cleanup`)
- [x] Card-media storage migration (`20260918120000_card_media_no_public_listing.sql`)
- [x] Multi-Card (`components/scan/MultiCardClient.tsx`; `test:multi-card`)
- [x] Event Workspace (`app/events`; `test:events`)
- [x] Smart Scan ledger foundation (`20260912120000_smart_scan_credit_ledger.sql`, `lib/billing/*`; `test:billing`)
- [x] Pro entitlements (`lib/entitlements.ts`, `lib/billing/pro-features.ts`; `test:pro`)
- [x] Gmail, HubSpot, Salesforce, Pipedrive connectors (`app/api/auth/*`)
- [x] Apple Wallet and Google Wallet routes (`app/api/card/wallet/*`; `test:wallet`)
- [x] Cinematic landing (`components/landing/*`)
- [x] Privacy, Terms and Account deletion links in the public footer
- [x] No dead enrichment providers in shipped code; no Apify implementation
- [x] No App Store / Google Play availability claim on the landing
- [x] No enrichment marketing on the landing page
- [x] Local migration rehearsal passes (`node scripts/rehearse-migrations.mjs`, 33/33)
- [x] Typecheck, lint, production build, `git diff --check`
- [x] **B0** Android intent filter for `io.abccard.app://connect/callback` (`test:release-blockers`; device QA still open below)
- [x] **B1** Legacy `/pricing` catalog retired: `/pricing` shows the current model, no Upgrade button, legacy checkout answers 410 (`test:release-blockers`)
- [x] **B1a** No reachable legacy Growth (or other legacy) checkout (`test:release-blockers`)
- [x] Obsolete `scripts/setup-stripe.ts` removed

Open code follow-ups (need a decision, then a development task):

- [ ] **B6** Smart Scan Pack purchase control, gated with the `SMART_SCAN_LEDGER` rollout
- [ ] Canonical-origin constants, if the owner's choice requires them (launch-contracts §3)
- [ ] `.well-known` AASA / assetlinks publication (optional for launch)
- [ ] Native icons and splash (Capacitor defaults today) — FINAL BRAND ASSETS REQUIRED

## OWNER DECISION

- [ ] Canonical origin (`www` vs apex)
- [ ] Bundle ID / Android application ID (provisional `io.abccard.app`)
- [ ] Smart Scan charge timing (read vs save)
- [ ] Smart Scan pack quantities (€8 / €17 / €28)
- [ ] Pro Event Pass price
- [ ] Pro Monthly price
- [ ] Pro Annual price
- [ ] Event Pass duration
- [ ] IAP / Play Billing strategy
- [ ] Grandfathering of legacy subscribers
- [ ] When to build the Smart Scan Pack purchase control
- [ ] Legal entity, Privacy/Terms effective date, Terms §3/§5/§6 corrections
- [ ] `account_deletions` retention period; "within 30 days" wording; refund policy
- [ ] OWNER REVIEW — unlimited scan exception (`lib/scan-limits.ts`, `SCAN_LIMIT_EXEMPT_EMAILS`)
- [ ] Final brand assets
- [ ] Store availability wording
- [ ] When to set `SMART_SCAN_LEDGER=on`

## EXTERNAL CONFIGURATION

Vercel

- [ ] Domains and apex/www redirect
- [ ] Production environment variables (launch-contracts §1)
- [ ] `EXCHANGE_RATE_LIMIT_SALT`, `NATIVE_AUTH_SECRET`, `CRM_TOKEN_ENCRYPTION_KEY` generated and set
- [ ] Obsolete keys removed; provider keys revoked (Perplexity, Apollo, EnrichLayer, OpenAI)

Supabase

- [ ] Site URL
- [ ] Redirect URLs (`/auth/callback`, `/auth/native/return`)
- [ ] Google provider
- [ ] Apple provider
- [ ] Email templates switched to `/auth/confirm` token-hash links
- [ ] `avatars` bucket policy audit (P7)
- [ ] Pre-flight P1–P7 on staging and production
- [ ] Five migrations applied in order on staging, post-checks match
- [ ] Five migrations applied in order on production, post-checks match

Google Cloud

- [ ] Branding / consent screen with privacy and terms URLs; domain verified
- [ ] Sign-in OAuth client with the Supabase callback
- [ ] Gmail API enabled; Gmail client with `/api/auth/google-gmail/callback`
- [ ] Scopes: `openid`, `email`, `gmail.send` only
- [ ] Verification demo video recorded
- [ ] Sensitive-scope verification submitted and approved

CRMs

- [ ] HubSpot app redirect URL and scopes; env set
- [ ] Salesforce connected app callback, scopes `api refresh_token`, PKCE; env set
- [ ] Pipedrive app callback and scopes `contacts:full`, `activities:full`; env set

Stripe

- [ ] Test-mode products and prices; env set on staging
- [ ] Test-mode webhook with the four events
- [ ] Customer portal allows cancellation
- [ ] Legacy prices archived in Stripe; legacy price env kept while legacy subscribers exist
- [ ] Live-mode products, prices, webhook; env set on production

Apple

- [ ] Team ID noted
- [ ] App ID with Sign in with Apple
- [ ] Services ID, return URL, key; Supabase Apple provider set; secret renewal calendared
- [ ] Pass Type ID, certificate, WWDR; wallet env set; certificate expiry calendared
- [ ] App Store Connect record
- [ ] Signing and provisioning
- [ ] AASA (optional)

Google Wallet / Android

- [ ] Wallet issuer; Google Wallet API enabled; service account added; env set
- [ ] Wallet publishing access requested
- [ ] JDK 21 and Android SDK 36 build machine
- [ ] Play Console record
- [ ] Play App Signing SHA-256 noted
- [ ] assetlinks.json (optional)

Email

- [ ] MX records
- [ ] `david@`, `hello@`, `support@`, `privacy@`, `billing@`
- [ ] Resend domain verified for `hello@abccard.io`
- [ ] Delivery tests to every address

## STAGING QA

- [ ] Staging deployment with staging Supabase and test-mode Stripe
- [ ] Migration post-checks match on staging
- [ ] Every `STAGING` row in [test-matrix.md](test-matrix.md) passes
- [ ] `SMART_SCAN_LEDGER=on` rehearsed on staging (opening balance, consume, no double charge)
- [ ] Existing public profile photo URLs still load after migration 5

## PRODUCTION QA

- [ ] Backup / restore point confirmed before migrations
- [ ] Production migrations applied and post-checks match
- [ ] Application deployed after migrations; build SHA matches the release
- [ ] Smoke test (runbook J.7)
- [ ] One live Stripe purchase and refund
- [ ] Every `PROVIDER LIVE` row in [test-matrix.md](test-matrix.md) passes on production

## APPLE STORE

- [ ] Bundle ID final
- [ ] Icons, launch screen, screenshots
- [ ] App Privacy answers (`docs/store/apple-privacy-label.md`) with no OWNER REVIEW left
- [ ] Review notes and demo account (`docs/store/app-review-notes.md`)
- [ ] Purchase strategy resolved (guideline 3.1.3(b))
- [ ] TestFlight build passes `REAL DEVICE` rows on iPhone
- [ ] Submitted for review

## GOOGLE PLAY

- [ ] Package name final
- [ ] Icon, feature graphic, screenshots
- [ ] Data safety (`docs/store/google-play-data-safety.md`) with no OWNER REVIEW left
- [ ] Data deletion URL `<origin>/account-deletion`
- [ ] Content rating and target audience
- [x] B0 fixed in code (Android connector return intent filter)
- [ ] Native connectors (Gmail, HubSpot, Salesforce, Pipedrive) verified on a real Android device
- [ ] Internal/closed testing build passes `REAL DEVICE` rows on Android
- [ ] Submitted for review

## POST-LAUNCH

- [ ] 48-hour watch: Vercel 5xx, Supabase errors, Stripe webhook deliveries, Resend delivery
- [ ] No `native_auth_unavailable`, `app_origin_not_configured` or `webhook_not_configured` in logs
- [ ] Google Wallet publishing access approved
- [ ] Apple Sign in secret and Pass Type certificate renewal dates in the calendar
- [ ] Skew Protection considered
- [ ] Legacy subscribers handled per the grandfathering decision
