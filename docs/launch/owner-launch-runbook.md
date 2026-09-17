# ABC launch — owner runbook

**For:** David (product owner). **Written from:** `landing-cinematic-system` @
`bd7199281aa3936352c53e0b6d4cc98b9fd3b3ed`, the combined release candidate (core release
candidate `berlin-final-release-cleanup` @ `8f9f2a1` plus the landing and cinematic landing
commits), plus the code blocker fixes on `release-final-blocker-fixes` (from `launch-owner-runbook` @ `6bc90dd`). **Status:** nothing in this runbook has been done yet. No secrets are written here;
every `<value>` is entered by you in the named console.

Companion documents:

- [launch-contracts.md](launch-contracts.md) — every environment variable, callback URL,
  origin and app-ID dependency, and the release blockers found in the code.
- [migration-rehearsal.md](migration-rehearsal.md) — the local migration rehearsal and the
  exact pre-flight, apply and post-check SQL.
- [final-release-checklist.md](final-release-checklist.md) — tick-box view of this runbook.
- [test-matrix.md](test-matrix.md) — what to test where.
- `docs/store/*` — privacy label, Data safety, review notes, OAuth verification script.
- `native-shell/README.md` — native build, signing and store detail.
- `docs/auth-email-links.md` — Supabase email template links.

Every step says **WHERE**, **ENTER**, **EXPECT** and **VERIFY**.

---

## 0. Dependency order

Do the sections in this order. A later step needs the output of an earlier one.

1. **A** — decisions (canonical origin and app ID unlock everything else).
2. **Code follow-ups** (§A.12) — commission the blocker fixes; they need A's answers.
3. **H.1–H.3** — domain email and sender DNS (support and privacy addresses appear in
   consoles and legal pages).
4. **B.1–B.2** — domains on Vercel (the canonical origin must serve before callbacks work).
5. **C.1–C.2** — Supabase URL configuration.
6. **D** and **F.1–F.4** — Google and Apple identity (they need the Supabase callback).
7. **B.3** — the rest of the Vercel environment (needs client IDs and secrets from D, F, E, G).
8. **C.4–C.6** — staging migration rehearsal, then production migrations.
9. **E** — Stripe (needs prices decided and the origin live).
10. **F.5–F.6**, **G.1–G.3** — wallets.
11. **F.7–F.10**, **G.4–G.9** — native builds and store records (need the app ID and assets).
12. **I** — real-device QA on staging, then production.
13. **J** — release.

---

## A. Final product decisions

None of these are decided in the code. Each is a one-line answer from you; the code or
configuration then follows it.

| # | Decision | Why it blocks | Where the answer goes |
| --- | --- | --- | --- |
| A.1 | **Canonical origin** — e.g. `https://www.abccard.io` with `https://abccard.io` redirecting to it, or the reverse | Every callback, Supabase Site URL, email link, native origin, AASA/assetlinks | `NEXT_PUBLIC_APP_URL`, launch-contracts §3 |
| A.2 | **Bundle ID / Android application ID** (provisional `io.abccard.app`) | Permanent after the first store upload; custom URL scheme | launch-contracts §4 |
| A.3 | **Smart Scan charge timing** — read time (today, single scan charged when read) or save time | Free-read abuse vs paying for discarded scans | Code change if moved |
| A.4 | **Smart Scan pack quantities** for €8 / €17 / €28 | Packs cannot be sold until set | `SCAN_PACK_8_CREDITS`, `SCAN_PACK_17_CREDITS`, `SCAN_PACK_28_CREDITS` |
| A.5 | **Pro Event Pass price** | Stripe price | Stripe product + `STRIPE_PRICE_PRO_EVENT` |
| A.6 | **Pro Monthly price** | Stripe price | `STRIPE_PRICE_PRO_MONTHLY` |
| A.7 | **Pro Annual price** | Stripe price | `STRIPE_PRICE_PRO_ANNUAL` |
| A.8 | **Event Pass duration** (days) | Grant length | `PRO_EVENT_PASS_DAYS` |
| A.9 | **IAP / Play Billing strategy** — in-app purchase, or another arrangement | Apple 3.1.3(b) review risk (`native-shell/README.md`) | Code and store products |
| A.10 | **Grandfathering** of legacy Starter/Growth/Pro/Team subscribers and their lifetime scan caps | Legacy plans still exist in the database and Stripe | Stripe and data migration plan |
| A.11 | **Smart Scan Pack purchase control** — when to build it, together with the `SMART_SCAN_LEDGER` rollout (the legacy `/pricing` catalog is already retired in code) | No pack can be bought in the app; pack checkout is not gated on the ledger (launch-contracts B6) | Code change after A.3 and A.4 |
| A.12 | **Commission code follow-ups** (not owner console work): the Scan Pack purchase control per A.11; origin constants if A.1 needs them (launch-contracts §3). B0, B1 and B1a are closed in code. | Remaining code work | Development task |
| A.13 | Legal: legal entity, Privacy/Terms effective date, Terms §3/§5/§6 corrections, `account_deletions` retention period, "within 30 days" wording, refund policy | Store submission and legal accuracy | Legal pages |
| A.14 | Second hard-coded unmetered e-mail in `lib/scan-limits.ts` — keep or remove | Privileged access | Code change if removed |
| A.15 | Final brand assets — app icon, splash, store graphics | Store submission | `native-shell/README.md` → Icons |
| A.16 | Store availability wording on the landing page | The landing claims no store availability today | Landing copy |

**VERIFY:** every row has a written answer before section B.

---

## B. Vercel / hosting

### B.1 Domains

- **WHERE:** Vercel → Project → Settings → Domains.
- **ENTER:** both `abccard.io` and `www.abccard.io`; set the non-canonical one to redirect
  (permanent) to the canonical one chosen in A.1.
- **EXPECT:** both show valid configuration and certificates.
- **VERIFY:** `curl -sI https://<non-canonical host>/d/test?x=1` returns 301/308 with
  `location: https://<canonical host>/d/test?x=1` (path and query preserved — public card
  links and QR codes use `https://abccard.io/d/<slug>`).

### B.2 Staging

- **WHERE:** Vercel → a Preview deployment of the release branch, or a separate staging
  project with its own Supabase project.
- **ENTER:** the same variables as B.3 with **test-mode** Stripe keys and a staging Supabase.
- **EXPECT:** a stable staging URL.
- **VERIFY:** the landing page loads; `/privacy`, `/terms`, `/account-deletion` load signed out.
  Note: `ABC_NATIVE_ORIGIN` refuses `*.vercel.app` hosts — native staging builds need a
  custom staging domain.

### B.3 Production environment variables

- **WHERE:** Vercel → Project → Settings → Environment Variables (Production; repeat for
  Preview/staging with test values).
- **ENTER:** the full inventory in [launch-contracts.md §1](launch-contracts.md#1-environment-variables).
  Minimum for a working base app: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
  `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_APP_URL` (= A.1, no trailing slash),
  `ANTHROPIC_API_KEY`, `RESEND_API_KEY`, `EXCHANGE_RATE_LIMIT_SALT`.
  - `EXCHANGE_RATE_LIMIT_SALT`: a long random value generated by you (e.g. 32+ random
    bytes). Without it the public card exchange refuses submissions.
  - `NATIVE_AUTH_SECRET`: at least 32 random characters. Needed only for native sign-in.
  - `CRM_TOKEN_ENCRYPTION_KEY`: base64 of exactly 32 random bytes (e.g. output of
    `openssl rand -base64 32`, run by you). Needed for Gmail, all CRMs and native
    connectors. **Never rotate casually** — stored CRM tokens become unreadable.
  - Mark every non-`NEXT_PUBLIC_` variable as sensitive.
- **EXPECT:** a redeploy picks the values up.
- **VERIFY:** after redeploy, sign in on production and:
  - scan a card (Anthropic works);
  - submit the exchange form on a public card from a private window (rate-limit salt works;
    the owner receives the Resend email);
  - `GET /api/billing/status` while signed in lists products with `available` flags.

### B.4 Remove obsolete keys

- **WHERE:** Vercel → Environment Variables (all environments); the provider consoles.
- **ENTER:** delete `PERPLEXITY_API_KEY`, `APOLLO_API_KEY`, `ENRICHLAYER_API_KEY`,
  `OPENAI_API_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` if present; revoke the four
  provider keys at Perplexity, Apollo, EnrichLayer and OpenAI.
- **EXPECT:** no code reads them (launch-contracts §1).
- **VERIFY:** the variables list no longer shows them; a redeploy succeeds.

### B.5 Skew Protection (later)

- **WHERE:** Vercel → Project → Settings (Skew Protection, plan-dependent).
- **ENTER:** enable after launch if clients on an old build hit new server actions during
  deploys.
- **VERIFY:** not required for launch.

---

## C. Supabase

### C.1 Site URL and redirect URLs

- **WHERE:** Supabase → Authentication → URL Configuration.
- **ENTER:**
  - Site URL: `<origin>` (A.1).
  - Redirect URLs: `<origin>/auth/callback` and `<origin>/auth/native/return`. The code
    appends query strings (`?next=…`, `?flow=…`); if Supabase does not accept them against
    the exact entries, use `<origin>/auth/callback**` and `<origin>/auth/native/return**`.
    Add the staging origin's equivalents to the staging project.
- **EXPECT:** saved.
- **VERIFY:** Google sign-in on the web returns to `/dashboard` (or onboarding), not to the
  bare Site URL. A native sign-in (after F/G builds) returns to the app.

### C.2 Email templates (token hash)

- **WHERE:** Supabase → Authentication → Email Templates.
- **ENTER:** exactly the links in `docs/auth-email-links.md` (Confirm signup, Reset password,
  Magic link if enabled, Invite if used, Change email address), replacing
  `{{ .ConfirmationURL }}`.
- **EXPECT:** templates saved.
- **VERIFY:** the five tests in `docs/auth-email-links.md` (sign up on a laptop and confirm on a
  phone; reset from the iPhone PWA and open in Safari; reset from Android Gmail; reuse an
  expired link; tamper `next=`).

### C.3 Providers

- **WHERE:** Supabase → Authentication → Providers → Google; → Apple.
- **ENTER:** Google: the Client ID and Client secret of the sign-in OAuth client from D.2.
  Apple: the Services ID, Team ID, Key ID and the key (or generated secret) from F.3.
- **EXPECT:** both enabled. Supabase shows its callback URL
  `https://<project-ref>.supabase.co/auth/v1/callback` — that value goes into D.2 and F.3.
- **VERIFY:** sign in with each provider on the web; a new account reaches onboarding.

### C.4 Pre-flight on staging and production (read-only)

- **WHERE:** Supabase → SQL Editor (staging project first).
- **ENTER:** queries P1–P7 from [migration-rehearsal.md](migration-rehearsal.md#owner-sql--pre-flight-read-only).
- **EXPECT:** P1 all `false`; P3 tables present and `card-media` public; P4 `0`; P5 no rows.
- **VERIFY:** save the outputs. If P4 is not `0`, decide on the cleanup statement first. If P2
  shows an incomplete history, **do not use `supabase db push`**.
- **P6** tells you whether a legacy Growth subscription could be recorded. No new legacy checkout
  can be created (B1a closed); this only matters for a legacy session opened before the deploy.
- **P7** is the `avatars` bucket policy audit — confirm nothing lets `anon` list or write
  `avatars`.

### C.5 Apply the five migrations — staging, then production

- **WHERE:** Supabase → Database → Backups (confirm a restorable backup / PITR), then SQL
  Editor.
- **ENTER:** each file wrapped in `begin;` … `commit;`, strictly in this order, with its
  post-check after each:
  1. `supabase/migrations/20260911120000_contact_delete_batch_history.sql`
  2. `supabase/migrations/20260912120000_smart_scan_credit_ledger.sql`
  3. `supabase/migrations/20260916120000_account_deletion.sql`
  4. `supabase/migrations/20260917120000_native_connector_attempts.sql`
  5. `supabase/migrations/20260918120000_card_media_no_public_listing.sql`
- **EXPECT:** each commits; each post-check matches
  [migration-rehearsal.md](migration-rehearsal.md#owner-sql--post-checks).
- **VERIFY:** the post-check after 4 returns `removes_native_attempts = true`; after 5 an
  existing profile photo URL still loads and a public card with a photo still renders.
  **Out-of-order application does not raise an error but breaks account deletion or
  Multi-Card save** — do not skip the post-checks.
- Deploy the application code **after** the production migrations: the release code calls
  the new functions.

### C.6 Smart Scan ledger rollout (`SMART_SCAN_LEDGER`)

- **WHERE:** Vercel env (staging first).
- **ENTER:** leave unset (legacy plan counters) until A.3, A.4 and the purchase path (A.11)
  are done. Then set `SMART_SCAN_LEDGER=on` on staging.
- **EXPECT:** on first scan-entitlement read, each owner's remaining legacy allowance is
  carried into the ledger once as an `opening_balance` (`legacy_bridge`); the founder stays
  unmetered and never touches the ledger.
- **VERIFY:** on staging, a free account with 3 legacy scans left shows 3 credits; one
  accepted card consumes 1; a failed or removed card consumes 0; retrying a save does not
  charge twice. `select kind, source, delta from public.scan_credit_ledger where user_id =
  '<staging test user>'` shows one `opening_balance` then `consume` rows. Only then set it in
  production.

---

## D. Google Cloud — sign-in and Gmail

One Google Cloud project can hold both clients. Sign-in (via Supabase) and the Gmail
connector are separate consents in the product.

### D.1 Branding / consent screen

- **WHERE:** Google Cloud Console → Google Auth Platform (formerly "OAuth consent screen") →
  Branding and Audience.
- **ENTER:** app name `ABC Card` (or the approved name), support email (`support@…` from H),
  logo (approved asset), home page `<origin>/`, privacy policy `<origin>/privacy`, terms
  `<origin>/terms`, authorized domain `abccard.io`, developer contact email. User type:
  External.
- **EXPECT:** saved; domain ownership verified in Google Search Console for `abccard.io`.
- **VERIFY:** the consent screen preview shows the name, logo and links.

### D.2 Sign-in OAuth client (used by Supabase)

- **WHERE:** Google Auth Platform → Clients → Create client → Web application.
- **ENTER:** Authorized redirect URI: `https://<project-ref>.supabase.co/auth/v1/callback`
  (copied from C.3).
- **EXPECT:** a Client ID and secret — enter them in Supabase C.3, not in Vercel.
- **VERIFY:** web Google sign-in works; the consent shows only name, email and profile.

### D.3 Gmail connector client

- **WHERE:** Google Auth Platform → Clients (the same client as D.2 or a separate one);
  APIs & Services → Library → **Gmail API** → Enable.
- **ENTER:** Authorized redirect URI: `<origin>/api/auth/google-gmail/callback` (add the
  staging equivalent for staging). If D.2's client is reused, it then lists both redirect
  URIs.
- **ENTER in Vercel:** `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` = this client.
- **EXPECT:** connecting Gmail from Messages or Settings → Integrations shows Google's consent
  for "Send email on your behalf".
- **VERIFY:** connect, send a follow-up, see it in the mailbox's Sent folder.

### D.4 Scopes and verification

- **WHERE:** Google Auth Platform → Data access; then Verification Center.
- **ENTER:** `openid`, `email` (non-sensitive) and
  `https://www.googleapis.com/auth/gmail.send` (sensitive). Nothing else — the code requests
  nothing else (launch-contracts §5).
- **EXPECT:** sensitive-scope verification is required before external users see an
  unverified-app warning removed.
- **VERIFY:** submit with the justification text and the demo video recorded from
  `docs/store/google-oauth-verification.md` (shots 1–11 include connect, send, Sent folder,
  Settings → Integrations → Disconnect, and reconnect). Record on production (or staging with
  the production client) after C.1 and B.3.

### D.5 Disconnect flow check

- **WHERE:** ABC Settings → Integrations → Gmail.
- **ENTER:** press Disconnect.
- **EXPECT:** "Not connected"; Google's `myaccount.google.com/permissions` no longer lists ABC
  (revocation is best effort; ABC's copy of the tokens is gone either way); Google sign-in to
  ABC still works.
- **VERIFY:** sending from a contact now asks to connect Gmail again.

---

## E. Stripe

The obsolete `scripts/setup-stripe.ts` (legacy Starter/Growth/Pro/Team products) has been removed —
**do not recreate those products.** The live catalog is `lib/billing/catalog.ts`; create its
products by hand in the Dashboard once the prices are decided.

### E.1 Products and prices (test mode first)

- **WHERE:** Stripe Dashboard → test mode → Product catalog.
- **ENTER:**
  - Smart Scan Pack €8, €17, €28 — one-time EUR prices.
  - ABC Pro Event Pass — one-time price (A.5).
  - ABC Pro Monthly — recurring monthly (A.6).
  - ABC Pro Annual — recurring yearly (A.7).
- **ENTER in Vercel (Preview/staging):** `STRIPE_PRICE_SCAN_PACK_8/17/28`,
  `SCAN_PACK_8/17/28_CREDITS` (A.4), `STRIPE_PRICE_PRO_EVENT`, `PRO_EVENT_PASS_DAYS` (A.8),
  `STRIPE_PRICE_PRO_MONTHLY`, `STRIPE_PRICE_PRO_ANNUAL`, `STRIPE_SECRET_KEY` (`sk_test_…` or a
  restricted `rk_test_…`).
- **EXPECT:** `GET /api/billing/status` shows each configured product `available: true`; a pack
  with no credit count stays unavailable (by design).
- **VERIFY:** Settings → Plan & Billing lists the Pro options. Scan Packs have **no purchase
  button in the app yet** (A.11) — do not configure pack price IDs in production until that
  control and the ledger rollout exist.

### E.2 Legacy plans (decision A.10)

- **WHERE:** Stripe → Product catalog (existing Starter/Growth/Pro/Team prices).
- **ENTER:** ABC no longer creates legacy checkouts (`/api/stripe/checkout` answers 410). Archive the
  legacy prices in Stripe so nothing else can reuse them; keep
  `STRIPE_PRICE_STARTER/GROWTH/PRO/TEAM` in Vercel while legacy subscribers exist (the webhook uses
  them to recognise those subscriptions); handle existing subscribers per A.10.
- **VERIFY:** `/pricing` shows no Starter, Growth or Team; Settings → Plan & Billing shows no Upgrade
  button. Run P6 (C.4) only to know whether a legacy session opened before the deploy could still be
  recorded.

### E.3 Webhook

- **WHERE:** Stripe → Developers → Webhooks → Add endpoint (test mode, then live).
- **ENTER:** URL `<origin>/api/stripe/webhook`; events `checkout.session.completed`,
  `checkout.session.async_payment_succeeded`, `customer.subscription.updated`,
  `customer.subscription.deleted`.
- **ENTER in Vercel:** `STRIPE_WEBHOOK_SECRET` = the endpoint's signing secret (`whsec_…`).
- **EXPECT:** deliveries answer 200.
- **VERIFY:** a test purchase of Pro Monthly creates one `billing_entitlements` row; resending
  the same event shows `duplicate` handling (no second grant); a pack purchase (once A.11 is built)
  grants exactly the configured credits once.

### E.4 Customer portal

- **WHERE:** Stripe → Settings → Billing → Customer portal.
- **ENTER:** allow cancelling subscriptions (the app relies on the portal; ABC has no
  server-side cancellation, and account deletion is refused while a subscription still bills).
- **VERIFY:** Settings → Plan & Billing → Manage subscription opens the portal and returns to
  the app.

### E.5 Native purchase restriction

- **WHERE:** the apps (after F/G builds).
- **EXPECT:** no checkout, no pricing page (`/pricing` redirects to Plan & Billing), a note that
  purchases are not available in the app; web-bought Pro and credits are honoured.
- **VERIFY:** on both devices. Resolve A.9 before submission.

### E.6 Live mode

- Repeat E.1, E.3, E.4 in live mode with `sk_live_…`/`rk_live_…` and the live webhook secret
  in Production env only. **VERIFY** with one real low-value purchase and a refund issued by
  you in Stripe.

---

## F. Apple

### F.1 Developer account and Team ID

- **WHERE:** developer.apple.com → Membership.
- **EXPECT:** an active organisation membership (legal entity from A.13).
- **VERIFY:** note the Team ID (used by `APPLE_TEAM_IDENTIFIER`, AASA, Sign in with Apple).

### F.2 App ID

- **WHERE:** Certificates, Identifiers & Profiles → Identifiers → App IDs.
- **ENTER:** bundle ID from A.2; capabilities: Sign in with Apple; Associated Domains (only if
  universal links will be published).
- **VERIFY:** the identifier appears with those capabilities.

### F.3 Sign in with Apple (web, via Supabase)

- **WHERE:** Identifiers → Services IDs; Keys.
- **ENTER:** a Services ID with Sign in with Apple enabled; Domains: `abccard.io` (and `www`
  per A.1) and `<project-ref>.supabase.co`; Return URL:
  `https://<project-ref>.supabase.co/auth/v1/callback`. Create a Sign in with Apple key and
  download the `.p8` once.
- **ENTER in Supabase C.3:** Services ID, Team ID, Key ID and the key/secret as Supabase's Apple
  provider asks. A client secret generated from the key is valid for at most six months —
  put its renewal date in the calendar.
- **VERIFY:** web and native "Sign in with Apple" create/sign in an account.

### F.4 Native sign-in prerequisites

- **ENTER:** `NATIVE_AUTH_SECRET` (B.3); C.1 includes `<origin>/auth/native/return`.
- **VERIFY:** section I.

### F.5 Apple Wallet pass certificate

- **WHERE:** Identifiers → Pass Type IDs; Certificates → Pass Type ID Certificate; Apple PKI page
  for the WWDR intermediate.
- **ENTER in Vercel:** `APPLE_PASS_TYPE_IDENTIFIER` (`pass.…`), `APPLE_TEAM_IDENTIFIER`,
  `APPLE_PASS_CERTIFICATE` (PEM or base64 PEM), `APPLE_PASS_PRIVATE_KEY` (PEM or base64 PEM),
  `APPLE_WWDR_CERTIFICATE` (the WWDR intermediate matching the certificate, PEM),
  `APPLE_PASS_PRIVATE_KEY_PASSPHRASE` only if the key is encrypted.
- **EXPECT:** before configuration `/api/card/wallet/apple` answers 501 with the `missing`
  names; after, it downloads a `.pkpass`.
- **VERIFY:** on an iPhone, My Card → Add to Apple Wallet adds a pass that opens the public card.
  In the iOS app, check whether the share sheet offers "Add to Apple Wallet"
  (`native-shell/README.md` → Wallet).

### F.6 Certificate expiry

- **VERIFY:** note the Pass Type ID certificate expiry date; calendar a renewal.

### F.7 App Store Connect record

- **WHERE:** App Store Connect → Apps → New App.
- **ENTER:** bundle ID (A.2), name, primary language, SKU; privacy policy URL `<origin>/privacy`;
  support URL; App Privacy answers from `docs/store/apple-privacy-label.md`; review notes from
  `docs/store/app-review-notes.md` with a demo account.
- **VERIFY:** the record saves; no answer is marked OWNER REVIEW when submitting.

### F.8 Signing and provisioning

- **WHERE:** Xcode (macOS) → the `ios/App` project → Signing & Capabilities.
- **ENTER:** the team; automatic signing; the bundle ID. Build after `npm run native:sync`
  (with `ABC_NATIVE_ORIGIN` = canonical origin if it is not `https://www.abccard.io`).
- **VERIFY:** an archive builds.

### F.9 Universal links (optional for launch)

- **ENTER:** `/.well-known/apple-app-site-association` naming `<Team ID>.<bundle ID>` for
  `/auth/native/return` (and `/auth/confirm` if wanted), served as JSON on the canonical host;
  Associated Domains `applinks:<canonical host>`. Needs a code change to publish the file and
  its content type.
- **VERIFY:** only after publication, on a device. The custom scheme works without it.

### F.10 TestFlight

- **WHERE:** App Store Connect → TestFlight.
- **ENTER:** upload the archive; internal testers.
- **VERIFY:** section I on a real iPhone.

---

## G. Google Wallet and Android

### G.1 Google Wallet issuer

- **WHERE:** Google Pay & Wallet Console.
- **ENTER:** create the issuer account (business details from A.13).
- **EXPECT:** an Issuer ID.
- **VERIFY:** note it for `GOOGLE_WALLET_ISSUER_ID`.

### G.2 Service account

- **WHERE:** Google Cloud Console → APIs & Services → Library → Google Wallet API → Enable;
  IAM & Admin → Service Accounts → create; Keys → add JSON key; Pay & Wallet Console → Users →
  add the service account email.
- **ENTER in Vercel:** `GOOGLE_WALLET_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_WALLET_SERVICE_ACCOUNT_KEY`
  (the key's `private_key` PEM, or base64 of it), `GOOGLE_WALLET_ISSUER_ID`,
  `GOOGLE_WALLET_CLASS_ID` (e.g. `<issuer>.abc_card` — your choice; the code creates the
  Generic class if missing).
- **EXPECT:** `/api/card/wallet/google` stops answering 501 and redirects to Google's save
  page.
- **VERIFY:** on an Android phone, Add to Google Wallet saves the card. The pass logo loads from
  `https://abccard.io/wallet/abc-wallet-logo.png` and the JWT `origins` is
  `https://abccard.io` — if A.1 makes `www` canonical, confirm this still works on staging
  (launch-contracts §3).

### G.3 Wallet publishing

- **WHERE:** Pay & Wallet Console.
- **EXPECT:** demo mode until Google approves publishing access.
- **VERIFY:** request publishing access before launch; until approved, only test accounts can
  save.

### G.4 Android toolchain

- **WHERE:** the build machine.
- **ENTER:** JDK 21; Android SDK platform 36 and build tools; Android Studio. Gradle wrapper
  8.14.3 and Android Gradle Plugin 8.13.0 are pinned in the project; minSdk 24, targetSdk 36.
- **VERIFY:** `npm run native:sync`, then a release build from Android Studio or
  `android/gradlew`.

### G.5 Package ID

- **ENTER:** A.2. Confirm before the first Play upload (permanent).

### G.6 Play Console record

- **WHERE:** Play Console → Create app.
- **ENTER:** name, default language, app/game, free/paid; App content → Privacy policy
  `<origin>/privacy`; Data safety from `docs/store/google-play-data-safety.md`; Data deletion →
  `<origin>/account-deletion`; content rating; target audience.
- **VERIFY:** App content shows every section complete.

### G.7 Play App Signing and SHA-256

- **WHERE:** Play Console → Setup → App integrity → App signing.
- **EXPECT:** after the first upload, the app signing key certificate SHA-256.
- **VERIFY:** note it for `assetlinks.json`.

### G.8 assetlinks.json (optional for launch)

- **ENTER:** `/.well-known/assetlinks.json` with `package_name` (A.2) and the SHA-256 from
  G.7, plus an `android:autoVerify="true"` intent filter for `<origin>/auth/native/return`.
  Needs a code change.
- **VERIFY:** only after publication. The custom scheme works without it, for sign-in and for the
  connector hand-back (both have their own intent filter).

### G.9 Testing track

- **WHERE:** Play Console → Testing → Internal testing (then closed testing if the developer
  account requires it).
- **ENTER:** upload the signed bundle; testers.
- **VERIFY:** section I on a real Android phone.

---

## H. Email and Google Workspace

### H.1 Mailboxes

- **WHERE:** Google Workspace Admin (or the chosen mail host).
- **ENTER:** `david@`, and `hello@`, `support@`, `privacy@`, `billing@` as mailboxes, groups or
  aliases. The code and legal pages use `support@abccard.io` (legal pages, landing, account
  deletion) and `hello@abccard.io` (sender in `lib/email.ts`). `privacy@` and `billing@` are
  not referenced in code.
- **VERIFY:** send a test message to each address from an outside account; it arrives.

### H.2 MX

- **WHERE:** DNS for `abccard.io`.
- **ENTER:** the Workspace MX records if not already present.
- **VERIFY:** H.1 deliveries arrive.

### H.3 Resend sender domain

- **WHERE:** Resend → Domains → `abccard.io`.
- **ENTER:** the SPF/DKIM (and return-path) DNS records Resend shows; keep them compatible with
  Workspace SPF.
- **EXPECT:** domain verified.
- **VERIFY:** sign up a new account → welcome email from `hello@abccard.io` lands in the inbox
  (not spam); submit a public card exchange → the owner gets the notification.

### H.4 Supabase auth email

- **WHERE:** Supabase → Authentication → Emails / SMTP settings.
- **ENTER:** custom SMTP if you do not want Supabase's default sender limits (your choice).
- **VERIFY:** C.2 tests deliver.

---

## I. Real-device QA

Use [test-matrix.md](test-matrix.md). Run on staging first, then production. Devices: a
current iPhone (Safari, installed PWA, TestFlight app) and a current Android phone (Chrome,
installed PWA, internal-testing app).

| Area | Pass condition |
| --- | --- |
| Google login | web, PWA and both apps; the app returns to itself after the system browser |
| Apple login | same |
| Email confirmation / password recovery | the C.2 tests, including opening links on another device |
| Gmail | connect, send, disconnect, reconnect — web and both apps (**Android connector return fixed in code; first real-device check**) |
| Pricing and Plan & Billing | `/pricing` shows the free card, packs €8 / €17 / €28 without counts and ABC Pro without prices; no Starter, Growth or Team anywhere; Plan & Billing has no Upgrade button; in the apps `/pricing` opens Plan & Billing |
| HubSpot, Salesforce, Pipedrive | connect, push a contact and meeting, disconnect; cancel at the consent screen returns cleanly |
| Camera | permission prompt wording; scanning a card, badge and QR code |
| Smart Scan | single scan saves a contact and meeting; credit/limit shown correctly |
| Multi-Card | several cards in one photo; landscape camera; review; save; Android Back leaves the camera |
| Present / QR | full-screen card, QR opens on top; Android Back closes QR, then the card |
| vCard | download/share opens the contact on the device |
| Wallet | Apple Wallet on iPhone, Google Wallet on Android |
| Event Workspace | meetings recorded with the same event appear together under Events; filters work; a person opens their contact |
| Account deletion | Settings → Profile & Account → Delete account; refused while a subscription bills; completes otherwise; `/account-deletion` loads signed out |
| Deep links | sign-in and connector hand-back open the app |
| Android back | closes overlays first, then history, then minimises |
| Offline | airplane mode shows the offline page; nothing claims to be queued |
| Billing gating | Pro features locked without Pro; apps show no purchase |

---

## J. Release

| # | Step | WHERE | VERIFY |
| --- | --- | --- | --- |
| J.1 | Staging carries the release branch, staging env and test-mode Stripe | Vercel | landing + sign-in work |
| J.2 | Migration rehearsal on staging (C.4, C.5) | Supabase staging | all post-checks match |
| J.3 | QA on staging (I) | devices | test-matrix staging rows pass |
| J.4 | Production backup | Supabase → Backups | a restore point exists |
| J.5 | Production pre-flight and migrations (C.4, C.5) | Supabase production | post-checks match |
| J.6 | Deploy the application | Vercel production (merge/promote per your process) | the deployment shows the release SHA (`NEXT_PUBLIC_BUILD_SHA`) |
| J.7 | Smoke test | production | sign in (Google, Apple, email); scan a card; public card and QR; exchange form; Gmail send; one CRM push; wallet add; `/pricing`, `/privacy`, `/terms`, `/account-deletion` |
| J.8 | Stripe live (E.6) | Stripe live | one purchase + refund |
| J.9 | Store submissions | App Store Connect, Play Console | TestFlight/internal build approved for review; all OWNER REVIEW answers resolved |
| J.10 | Post-release checks (first 48 hours) | Vercel logs, Supabase logs, Stripe webhook deliveries, Resend | no 5xx spike; webhooks 200; emails delivered; no `native_auth_unavailable` or `app_origin_not_configured` in logs |
