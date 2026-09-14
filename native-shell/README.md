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
7. **Android back button** — walks page history, then minimises the app.
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

## Gmail and CRM connectors — blocker in the apps

Every connector callback proves a signed single-use state cookie *and* a live ABC
session for the same account. In the apps, consent must happen in the system
browser, which holds neither, so both proofs correctly fail. Relaxing either would
let somebody start a connection for their own account and have another person
finish it. Until the native design is built, the four connect routes send the app
back to Integrations (`lib/native/connect-gate.ts`), which explains; connections
made on the web keep working in the app.

**Design to build** (keeps every existing property):
1. `POST /api/connectors/native/start` from the signed-in WebView: the server seals
   owner, provider, nonce hash and (Salesforce) the PKCE verifier, and returns the
   provider's authorize URL.
2. Consent in the system browser; the provider returns to the ABC callback.
3. The callback stores nothing. It validates the sealed state and hands code and
   state back to the app.
4. The app posts code, state and nonce from the WebView. The server requires the
   live session user to equal the sealed owner and the nonce to match, then
   exchanges the code (same `redirect_uri`) and stores the tokens. Provider codes
   are single use; the state expires.

This moves each provider's token exchange out of its callback and needs tests per
provider.

## Payments — owner decision required

- **Web and PWA:** Stripe, unchanged.
- **Apps:** no web checkout, billing portal or pricing page. Plan & Billing reports
  the plan and says purchases are not available in the app; `/api/billing/checkout`
  refuses app requests; `/pricing` redirects to Plan & Billing. The legacy
  `/api/stripe/checkout` and `/api/stripe/portal` routes are called only from those
  withheld screens and are left untouched until the legacy pricing flow is replaced,
  when they should get the same refusal. Nothing points elsewhere to buy
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

## Account deletion — MISSING (store blocker)

Both stores require apps that create accounts to let people delete them in the app.
ABC has no account deletion today, although the Terms say it does. It needs, at least:

- An authenticated endpoint acting only on the session user, with explicit
  confirmation (recent re-authentication or a typed confirmation) and rate limiting,
  reachable from Settings in the web app and the apps, plus a public web page
  describing the process (Google Play requires one).
- Defined deletion of: the profile and public card (slug released, card media in
  Storage), contacts, encounters, follow-up sequences, scan batches and items, card
  views, CRM connections and mappings (tokens deleted and revoked with the provider
  where possible), the Gmail grant.
- Billing: active Stripe subscriptions cancelled (or deletion blocked until they are);
  records the law requires kept; `scan_credit_ledger` history anonymised or retained
  per a retention decision; no automatic refund of credits.
- Supabase Auth user deleted last, through the service role, after the data.
- A non-identifying audit record that a deletion happened.
- A migration if foreign keys need new cascade rules — to be decided with the data
  model, not improvised.

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
above; account deletion; TestFlight build; real-device QA (sign-in, camera scanning,
Multi-Card landscape, share, files, Wallet); review notes explaining sign-in and the
native features.

**Google (owner-assisted):** confirm package name; Play Console record; Play App Signing
and the certificate SHA-256 for `assetlinks.json`; the purchase decision above; Data
safety form; content rating and target audience; account deletion page; internal or
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
