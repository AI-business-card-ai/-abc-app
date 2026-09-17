# ABC Card — native shell (iOS and Android)

**Status: code foundation.** Not ready for App Store or Google Play submission —
see [Before store submission](#before-store-submission).

## What this is

One ABC. The iOS and Android apps are Capacitor 8 shells that load ABC from its
canonical origin and add a native layer for what a WebView cannot do on its own.
Web, PWA, iOS and Android share one product, one backend and one deploy.

**Why the apps load the origin instead of bundled files.** ABC renders on the
server, gates every screen in middleware, keeps its Supabase session in HttpOnly
cookies and works through 74 API routes. A static export would be a second,
lesser ABC. The consequences are deliberate and known:

- The app needs the network to start. `native-shell/www/error.html` explains when
  it has none; nothing is stored or queued on the phone.
- A web deploy changes what the apps show. Native changes (permissions, plugins,
  icons) still need a store release.
- Capacitor documents `server.url` as meant for live reload rather than
  production. ABC uses it on purpose; store review judges whether the native layer
  is more than a website (see [Review risk](#review-risk)).

Working origin: `https://www.abccard.io` — **the canonical origin still needs owner
confirmation before signing.** It is set in one place, `lib/native/config.ts`, and
can be overridden with `ABC_NATIVE_ORIGIN` (https only, never a `*.vercel.app`
deployment hostname).

## Commands

| Command | What it does |
| --- | --- |
| `npm run native:sync` | Writes `native-shell/www/native-origin.js`, then `cap sync` (copies `native-shell/www`, updates plugins in both projects). |
| `npm run native:open:android` / `npm run native:open:ios` | Opens the project in Android Studio / Xcode. |
| `npm run test:native` | The native shell test suite. |

## Identity

- App name: **ABC Card**
- Bundle ID / application ID: **`io.abccard.app` — PROVISIONAL.** Confirm before
  any App Store Connect or Play Console record exists; neither store lets a
  published app change it.
- URL scheme: `io.abccard.app`
- Versions: 1.0 (1) in both projects.

## The native layer

Everything below is loaded only inside the apps (`components/native/NativeShellBridge.tsx`
→ `lib/native/shell.ts`). The web and the PWA never download it.

1. **Runtime seam** — `lib/native/runtime.ts`. The Capacitor bridge in the browser;
   the `ABCCardNative/ios|android` user-agent marker on the server (used only to
   withhold web-only flows, never to authorize).
2. **Link policy** — `lib/native/navigation.ts`. ABC pages stay in the app (both
   ABC origins, and links that ask for a new tab); other sites open in the system
   browser (SFSafariViewController / Chrome Custom Tabs); `mailto:`, `tel:`,
   `sms:` go to the OS; every other scheme is blocked. `window.open` follows the
   same policy.
3. **Sign-in with Google and Apple through the system browser** — see
   [Sign-in](#sign-in-google-and-apple).
4. **Deep links** — `appUrlOpen` and the launch URL, parsed strictly by
   `lib/native/deep-link.ts`.
5. **Share** — Web Share goes to the native share sheet, keeping the Web Share
   contract, so every existing share button works unchanged; clipboard remains the
   fallback.
6. **File handoff** — vCard, CSV, QR image and Apple Wallet pass are fetched with
   the WebView's session, written to the app cache and handed to the system share
   sheet (`lib/native/downloads.ts`). A WebView saves no downloads by itself.
7. **Android back button** — closes a full-screen layer first (the presented card, its QR
   code, the Multi-Card camera, each registered through `lib/native/back-handlers.ts`), then
   walks page history, then minimises the app.
8. **No reload on resume**, reconnect or anything else.
9. **Status bar and safe areas** — light status-bar content over `#0a0a0b`. iOS:
   `contentInset: never`, the page's own `env(safe-area-inset-*)` handles the
   notch and home indicator. Android: `SystemBars.insetsHandling: native` — edge
   to edge with real insets on current WebViews, padded (insets read as zero) on
   older ones. Nothing is padded twice.
10. **Commerce boundary** and **connector gate** — below.
11. **Local error page** when ABC cannot be reached.
12. **Android hardening** — backup and device transfer disabled (the WebView cookie
    holds the session); cleartext and mixed content off; FileProvider limited to
    the cache and the app's own Pictures folder.

## Permissions

**iOS**
- `NSCameraUsageDescription` — scanning cards, badges and QR codes (live camera and
  photo capture in the WebView).
- `NSPhotoLibraryAddUsageDescription` — the share sheet's "Save Image" for a QR code.
- No photo-library read permission: choosing a photo uses the system picker.
- No microphone, location or contacts. The voice-note recorder in
  `components/mobile/ScanContextSheet.tsx` is not used anywhere; if it ever ships,
  it needs `NSMicrophoneUsageDescription` and `RECORD_AUDIO`.

**Android**
- `INTERNET`, `CAMERA` (with the camera feature optional).
- No storage permissions.

## Service worker

- **iOS:** WKWebView runs no service worker without App-Bound Domains, which are not
  enabled (not needed, and they would restrict script injection). No worker.
- **Android:** the WebView runs ABC's worker. The Task #5 policy applies unchanged:
  no private data cached, pages network-only with the offline fallback, retired
  caches deleted.

## Sign-in (Google and Apple)

Google refuses sign-in inside embedded WebViews, and a sign-in that finishes in
Safari or Chrome would set its cookie in that browser, not in the app. So:

1. The app keeps a random nonce and sends only its SHA-256 to
   `POST /api/auth/native/start`. The server seals a PKCE verifier, the nonce hash
   and the destination (AES-256-GCM, ten minutes) and returns Supabase's authorize
   URL with the PKCE challenge.
2. The system browser signs in and returns to `/auth/native/return`, which hands
   `code` and `flow` to `io.abccard.app://auth/callback`.
3. The app posts `code`, `flow` and the nonce to `POST /api/auth/native/complete`.
   The server checks the flow, the nonce and exchanges the code with the sealed
   verifier, then sets the session cookie on the WebView's response. First
   sign-ins get their profile through the same `lib/auth/sign-in-destination.ts`
   the web callback uses.

An intercepted code, or code and flow together, cannot be redeemed without the
nonce; Supabase codes are single use. Web sign-in is unchanged.

**Owner setup before native sign-in works:**
- Set `NATIVE_AUTH_SECRET` (at least 32 random characters) in the server environment.
- `NEXT_PUBLIC_APP_URL` must be the canonical origin.
- Supabase → Authentication → URL configuration: add
  `https://www.abccard.io/auth/native/return` to the redirect allowlist (and the
  apex form if the apex is canonical).
- Real-device QA of both providers.

## Gmail and CRM connectors — IMPLEMENTED (migration not applied)

Every web connector callback proves a signed single-use state cookie *and* a live
ABC session for the same account. In the apps, consent happens in the system
browser, which holds neither, so the apps use their own flow
(`lib/connectors/native.ts`, table `native_connector_attempts`):

1. **Start.** Connect links in the app are intercepted by the shell. From the
   signed-in WebView, `POST /api/connectors/native/start` takes the owner from the
   session, checks ABC Pro, and records an attempt binding owner, provider, the
   SHA-256 of a nonce the app keeps, the SHA-256 of a signed opaque state
   (`abcn.…`) and, for Salesforce, the PKCE verifier encrypted. It answers with the
   provider's authorize URL.
2. **Callback.** The provider returns to the same registered callback as the web
   flow; an `abcn.` state takes the native branch before any web check. One
   statement moves the attempt from pending to exchanging (a replay finds
   nothing), the code is exchanged with the web callbacks' own helpers, and the
   result is stored AES-256-GCM encrypted with the SHA-256 of a fresh handoff
   value. The browser hands back `io.abccard.app://connect/callback?attempt=…&handoff=…`
   — no token, verifier, owner or nonce.
3. **Claim.** The app posts attempt, handoff and nonce to
   `POST /api/connectors/native/claim`. Pro is checked again; one statement
   releases the result only to the session owner holding both values, marks it
   claimed and wipes it; it is saved through `saveCrmConnection` /
   `saveGoogleOAuthTokens` like a web connection.

The nonce makes an intercepted deep link useless to anybody but the app that
started the attempt. The handoff reaches only the device that consented, so an
attempt started on one account and consented to by somebody else cannot be
collected. Attempts expire after ten minutes; expired rows are deleted when a new
attempt starts; account deletion removes them with the other credentials.

Differs from the earlier sketch here, which handed the provider code to the app and
exchanged at the claim: exchanging at the callback keeps each provider's exchange
beside the web callback's, and the handoff gives the same device binding the code
would have.

**Owner steps:** apply `supabase/migrations/20260917120000_native_connector_attempts.sql`
(after `20260916120000_account_deletion.sql`); `CRM_TOKEN_ENCRYPTION_KEY` must be set
(it also signs the native state and encrypts every native result until it is
claimed); no provider console change — the redirect URIs are the existing ones;
real-device QA of all four providers in both apps, including cancelling at the
consent screen.

## Payments — owner decision required

- **Web and PWA:** Stripe, unchanged.
- **Apps:** no web checkout, billing portal or pricing page. Plan & Billing reports
  the plan and says purchases are not available in the app; `/api/billing/checkout`
  refuses app requests; `/pricing` redirects to Plan & Billing. The legacy plan checkout
  (`/api/stripe/checkout`) is retired and answers 410 everywhere; the billing portal
  (`/api/stripe/portal`) is called only from Plan & Billing, which hides it in the apps. Nothing points elsewhere to buy
  (`lib/billing/commerce.ts`).
- **Seam:** `lib/billing/native-store.ts` — store product mappings empty, server
  verification not implemented, grants nothing. A future verified store purchase
  must land in the same `scan_credit_ledger` / `billing_entitlements` model the
  Stripe webhook writes.

**Decision needed before submission.** Apple guideline 3.1.3(b) (multiplatform
services) lets an app unlock things bought elsewhere only if they are also available
to buy in the app with In-App Purchase. Withholding purchases in the iOS app while
honouring web-bought Pro and Smart Scan credits is therefore likely to be questioned
in review. Options: Apple In-App Purchase and Google Play Billing (product IDs,
prices, server verification), or a different product arrangement for the apps —
a commercial and legal decision, not a code default.

## Wallet

- **Apple Wallet:** the pass is generated on the server. In the app it is fetched with
  the session and handed to the share sheet. Whether iOS offers "Add to Apple Wallet"
  from there must be checked on a device; if not, add a small PassKit plugin
  (`PKAddPassesViewController`) that receives the pass bytes. No certificate or key is
  ever in the app.
- **Google Wallet:** `/api/card/wallet/google` redirects to Google's save URL; the
  WebView hands that non-ABC address to the system, which opens Google Wallet. The
  service account stays on the server.

## Deep links — values needed later

Nothing is published yet, and nothing with placeholder values will be.

- **iOS Universal Links:** Apple Team ID; the final bundle ID; the Associated Domains
  capability with `applinks:www.abccard.io` (and `applinks:abccard.io` if used);
  `/.well-known/apple-app-site-association` naming `<Team ID>.<bundle ID>` for
  `/auth/native/return` (and public card paths if wanted).
- **Android App Links:** the final package name; the SHA-256 fingerprint of the release
  signing certificate (the Play App Signing key, from Play Console);
  `/.well-known/assetlinks.json`; an `android:autoVerify="true"` intent filter for
  `https://www.abccard.io/auth/native/return`.

Once verified, the sign-in return can hand back through the verified link instead of
the custom scheme.

## Account deletion — IMPLEMENTED (migration not applied)

Both stores require apps that create accounts to let people delete them in the app.
The code is in place; production still needs its migration and a device check.

- **In the app:** Settings → Profile & Account → Delete account
  (`/settings/account/delete`). The same web screen serves the web app, the installed
  PWA and both store apps, with no Pro, credit or native gate. A typed `DELETE`
  confirms intent; the verified session decides whose account it is.
- **Public page:** `/account-deletion` — the URL for the Google Play deletion form and
  for support. Works signed out.
- **Endpoint:** `POST /api/account/delete`, acting only on the session user. No rate
  limiter: it can only ever delete the caller's own account, every step is
  idempotent, and a second request for the same account waits on the same database
  lock as the first.
- **What happens:** `lib/account/delete.ts` runs `remove_account_data` (one
  transaction: profile and public card, contacts, encounters, follow-up sequences,
  activities, opportunities, scan batches and items, card links, events, views and
  showcase, CRM connections and mappings, the Gmail tokens), then removes the owner's
  folders in the `card-media` and legacy `avatars` buckets, then deletes the Supabase
  Auth user last. A failure stops at that step and the owner can retry.
- **Billing:** deletion is refused with `active_subscription` while a Pro or legacy
  subscription can still charge; ABC has no server-side cancellation, so the owner
  cancels in the Stripe portal first. No refund, reversal or Stripe call. Unused
  credits end with the account.
- **Kept:** `account_deletions`, one non-identifying row per deleted account with a
  summary of credits, purchases (Checkout Session references) and Pro billing, and the
  Stripe customer reference. Ledger and entitlement rows still leave through their own
  cascade when the auth user is deleted. How long the record is kept is not decided.
- **Not done, deliberately:** provider-side token revocation (Google, HubSpot,
  Salesforce, Pipedrive) — none exists in ABC today, so tokens are deleted locally and
  a provider outage cannot block deletion; Google Wallet objects are not expired.
- **Owner steps:** apply `supabase/migrations/20260916120000_account_deletion.sql`;
  decide the retention period for `account_deletions`; enter
  `https://<canonical origin>/account-deletion` in Play Console; verify deletion on a
  real device in both apps.

## Icons and splash — NOT STORE ASSET READY

Both projects carry Capacitor's default icon and splash. The approved ABC handshake /
scan mark is needed as:

- A vector master (SVG or PDF) of the mark, plus the wordmark.
- **iOS:** 1024×1024 PNG app icon, no transparency, square corners; launch screen
  artwork or a plain `#0a0a0b` launch colour.
- **Android:** adaptive icon foreground 432×432 px with the mark inside the central
  264×264 px safe zone; background `#0a0a0b` (or a 432×432 image); monochrome layer for
  themed icons; Android 12+ splash icon from the same mark.
- **Google Play listing:** 512×512 PNG icon (32-bit, ≤ 1 MB) and a 1024×500 feature
  graphic.
- **App Store listing:** screenshots per required device size.

## Building

- **Android:** JDK 21, Android SDK platform 36 and build tools, Android Studio.
  `npm run native:sync`, then build from Android Studio or `android/gradlew`. Gradle
  wrapper 8.14.3, Android Gradle Plugin 8.13.0, minSdk 24, targetSdk 36.
- **iOS:** macOS with an Xcode that supports the iOS 15 deployment target and Swift
  Package Manager. `npm run native:sync`, open the project, choose the team, build. No
  CocoaPods.
- The machine this foundation was built on (Windows, no JDK, Android SDK or Xcode)
  generated and synced both projects but could build neither.

## Before store submission

**Apple (owner-assisted):** confirm bundle ID; Apple Developer App ID with Associated
Domains; Team ID; signing certificates and provisioning; App Store Connect record;
final icon; privacy nutrition labels and privacy policy URL; the purchase decision
above; the account deletion migration applied; TestFlight build; real-device QA (sign-in,
camera scanning, Multi-Card landscape, share, files, Wallet, account deletion); review
notes explaining sign-in and the
native features.

**Google (owner-assisted):** confirm package name; Play Console record; Play App Signing
and the certificate SHA-256 for `assetlinks.json`; the purchase decision above; Data
safety form; content rating and target audience; the account deletion page URL
(`/account-deletion`) in the Data deletion section; internal or
closed testing as the developer account requires; real-device QA.

## Review risk

- **Apple 4.2 (minimum functionality):** an app that loads a website is at real risk.
  ABC's native layer — system-browser sign-in, deep links, the share sheet, file
  handoff, camera scanning, the back button, a local error page — addresses that, but
  approval is not guaranteed. Verified universal links, native Add to Apple Wallet and
  a native purchase path would each strengthen it.
- **Apple 3.1.1 / 3.1.3(b):** see [Payments](#payments--owner-decision-required).
- **Google Play:** the WebView policy disallows apps that are primarily a website
  wrapper, and the Payments policy requires Play Billing for digital goods sold in the
  app. Risk is moderate and depends on the same native value and purchase decision.
