# ABC final release test matrix

**Release candidate:** `landing-cinematic-system` @ `bd7199281aa3936352c53e0b6d4cc98b9fd3b3ed`.

Levels:

- **AUTOMATED** — runs in the repository with no network or provider (`npm run test:<suite>`,
  `node scripts/rehearse-migrations.mjs`). Named suites below.
- **LOCAL MANUAL** — `npm run dev` or a local production build in a desktop browser.
- **STAGING** — staging deployment, staging Supabase, Stripe test mode, test provider apps.
- **REAL DEVICE** — iPhone and Android phone: browser, installed PWA, TestFlight / internal
  testing app.
- **PROVIDER LIVE** — production providers (Google verification, Stripe live, Wallet
  publishing, store review).

`●` = must pass at that level. `—` = not applicable. Automated coverage is listed by suite;
nothing that needs a real provider or device is claimed as automated.

| # | Area | What to check | AUTOMATED | LOCAL MANUAL | STAGING | REAL DEVICE | PROVIDER LIVE |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Email/password auth | Register, confirm, sign in, sign out, password reset through `/auth/confirm` (link opened on another device) | `test:auth-links` | ● | ● | ● | ● |
| 2 | Google auth | Web and PWA sign-in; identity scopes only; new account → onboarding | `test:privacy-readiness` (G1) | — | ● | ● | ● |
| 3 | Apple auth | Web sign-in; private relay address accepted | — | — | ● | ● | ● |
| 4 | Onboarding | New account completes onboarding; unfinished accounts are redirected to it | — | ● | ● | ● | — |
| 5 | Card / profile | Edit card, photo upload to own folder, publish, public `/d/<slug>` renders | `test:final-release-cleanup` (storage), `test:security` | ● | ● | ● | — |
| 6 | Present | Full-screen card; QR on top; Escape (web) / Back (Android) closes QR first | `test:final-release-cleanup` (D1–D7) | ● | ● | ● | — |
| 7 | Public QR | QR opens the public card; `?src=qr` counted; scanning an ABC QR in Smart Scan recognises it | — | ● | ● | ● | — |
| 8 | Reverse exchange | Visitor submits the exchange form; owner gets contact + email; rate limit refuses bursts; fails closed without salt | `test:email`, `test:security` | ● | ● | ● | ● |
| 9 | Single Smart Scan | Card photo → contact + meeting; limit/credit shown; nothing stored from the photo | `test:privacy-readiness` (P1), `test:billing` | — | ● | ● | ● |
| 10 | Multi-Card | Several cards in one photo; guided capture; landscape camera; review; save | `test:multi-card` | — | ● | ● | ● |
| 11 | Duplicate person / new encounter | Rescanning a known person links to them and adds a meeting; override creates a separate person | `test:multi-card` | — | ● | ● | — |
| 12 | Meeting context | Where met, discussed, next step, follow-up date saved per meeting | `test:events` | ● | ● | ● | — |
| 13 | Contact delete | Delete a contact saved from a batch; batch history remains | `test:contact-delete`, rehearsal F9 | ● | ● | ● | — |
| 14 | Account delete | Refused while a subscription bills; otherwise removes data, media folders, auth user; `/account-deletion` signed out | `test:account-deletion`, rehearsal F6/F10 | ● | ● | ● | — |
| 15 | Smart Follow-up | Draft generated; regenerate; nothing sent automatically | `test:error-surface`, `test:pro` | — | ● | ● | ● |
| 16 | Gmail | Connect (Messages and Settings → Integrations), send, disconnect, reconnect; web and apps | `test:final-release-cleanup` (C1–C18), `test:native-connectors` | — | ● | ● (Android blocked by B0) | ● (verified app) |
| 17 | HubSpot | Connect, push contact + meeting, disconnect, cancel at consent | `test:native-connectors` | — | ● | ● (Android blocked by B0) | ● |
| 18 | Salesforce | Same, with PKCE | `test:native-connectors` | — | ● | ● (Android blocked by B0) | ● |
| 19 | Pipedrive | Same | `test:native-connectors` | — | ● | ● (Android blocked by B0) | ● |
| 20 | Event Workspace | Meetings grouped by event; filters; person opens contact | `test:events` | ● | ● | ● | — |
| 21 | Scan credit purchase | Pack checkout grants the configured credits once (**no purchase UI yet — B1**) | `test:billing` (webhook, catalog) | — | ● | — | ● |
| 22 | Credit consumption | One accepted card = 1 credit; removed/failed = 0; retry never double-charges; never negative | `test:billing`, `test:multi-card`, rehearsal F2–F4 | — | ● (`SMART_SCAN_LEDGER=on`) | ● | ● |
| 23 | Pro entitlement | Pro Monthly / Annual / Event Pass unlock Smart Follow-up, sequences, Gmail, CRM | `test:pro`, `test:billing` | — | ● | ● | ● |
| 24 | Expiry | Event Pass ends after its days; cancelled subscription ends at period end; features lock | `test:pro` | — | ● | — | ● |
| 25 | Apple Wallet | Pass downloads and adds on iPhone; 501 with missing names when unconfigured | `test:wallet` | — | ● | ● | ● |
| 26 | Google Wallet | Save link adds the card on Android; origin/logo host after the origin decision | `test:wallet` | — | ● | ● | ● (publishing access) |
| 27 | PWA | Install; no private data cached; offline page; update without reload loops | `test:pwa`, `test:pwa-private-cache` | ● | ● | ● | — |
| 28 | Native iOS | TestFlight build loads the canonical origin; sign-in round trip; no purchase UI | `test:native` | — | — | ● | ● (review) |
| 29 | Native Android | Internal build; same; custom-scheme sign-in; connector hand-back after B0 | `test:native` | — | — | ● | ● (review) |
| 30 | Deep links | `io.abccard.app://auth/callback` and `…/connect/callback` open the app; bad links ignored | `test:native`, `test:native-connectors` | — | — | ● | — |
| 31 | Camera permissions | Prompt text matches `Info.plist`; denial handled; Android camera optional | `test:privacy-readiness` (N1, N2) | — | — | ● | — |
| 32 | Share / files | Share card link; vCard, CSV, QR image and `.pkpass` handed to the share sheet; QR saved to Photos | `test:native` | ● (web share) | — | ● | — |
| 33 | Android back | Closes presented card / QR / Multi-Card camera first, then history, then minimises | `test:final-release-cleanup` (D1–D7) | — | — | ● | — |
| 34 | Weak network | Slow 3G: scans and saves show progress and a clear failure; no duplicate saves on retry | `test:launch-ux` | ● (throttled) | ● | ● | — |
| 35 | Offline state | Airplane mode: offline page; nothing claims to be queued | `test:pwa` | ● | ● | ● | — |
| 36 | OAuth cancellation | Cancel at Google/Apple/CRM consent: returns cleanly, no half-connection | `test:native-connectors` (C9) | — | ● | ● | ● |
| 37 | Session expiry | Expired session on a protected page → login; API answers "session ended" wording | `test:launch-ux` | ● | ● | ● | — |
| 38 | Migrations | Five migrations in order; no data loss; functions and policies compile | `node scripts/rehearse-migrations.mjs` | — | ● (pre-flight + post-checks) | — | ● (production post-checks) |

## Automated suites — state on the release candidate

Run on a clean checkout of `bd71992` (Windows worktree, 2026-09-17):

| Suite | Result | Notes |
| --- | --- | --- |
| `test:account-deletion` | 91/91 | |
| `test:auth-links` | 27/27 | |
| `test:billing` | 141/144 | U2, U3, U4 — historical branch-scope pins |
| `test:contact-delete` | 52/52 | |
| `test:email` | 39/40 | 21 — historical branch-scope pin |
| `test:error-surface` | 20/20 | |
| `test:events` | 69/74 | 13a–13e — historical branch-scope pins |
| `test:final-release-cleanup` | 48/48 | |
| `test:launch-ux` | 13/13 | |
| `test:multi-card` | 473/474 | 139 — source-text assertion that fails only on a CRLF checkout; passes on the committed LF text |
| `test:native` | 84/84 | |
| `test:native-connectors` | 61/62 | M6 — same CRLF checkout artefact; passes on LF text |
| `test:privacy-readiness` | 21/21 | |
| `test:pro` | 107/107 | |
| `test:pwa` | 130 passed | |
| `test:pwa-private-cache` | 71 passed, 1 group skipped | skipped group is a historical hotfix scope pin |
| `test:security` | 31/31 | |
| `test:wallet` | 200/200 | |
| `rehearse-migrations` | 33/33 | |

No behavioural failure.
