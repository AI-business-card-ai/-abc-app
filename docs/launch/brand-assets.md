# ABC brand and PWA assets — what exists, what is missing

Facts from the code on `feature/landing-production`. Nothing in the app may point at a file in the
"Missing" rows until that file is committed under `public/`: a reference to a file that does not
exist renders a broken icon or link preview everywhere it is used.

## Exists

| File | Size | Referenced by | State |
| --- | --- | --- | --- |
| `public/icons/icon-192.png` | 192×192 | `public/manifest.json`; `app/layout.tsx` as the favicon and the Apple icon | Old "AB" artwork in the retired pink-to-cyan frame |
| `public/icons/icon-512.png` | 512×512 | `public/manifest.json` | Same artwork |
| `public/icons/icon-maskable-512.png` | 512×512 | `public/manifest.json` (`purpose: maskable`) | Same artwork, inside the maskable safe zone |
| `public/icon.svg` | — | Nothing (only excluded from middleware by name) | Retired cyan-to-violet "ABC"; replace or delete |
| `public/abc/abc-global-network-bg.webp` | 1172×941 | Workspace and Events backgrounds | Approved |
| `public/wallet/abc-wallet-logo.png` | 512×512 | Wallet passes | Wallet only |
| `public/hero/abc-hero-visual.webp` | 953×507 | Nothing | Obsolete; shows removed features; must never be used |

## Missing

| Asset | Path to commit | Specification | Then wire it in |
| --- | --- | --- | --- |
| Approved logo | `public/brand/…` (SVG master) | SVG, plus a one-colour version for small sizes | `lib/landing/media.ts` slot `logo` (header and footer switch from the "ABC." wordmark) |
| App icons from the approved logo | the three `public/icons/*` paths above | 192 and 512 PNG; maskable 512 with the mark inside the central 80% | Same paths: no code change |
| Favicon | `public/favicon.ico` and an SVG icon | 16 and 32 px ICO; SVG | `app/layout.tsx` `metadata.icons.icon` |
| Apple touch icon | `public/apple-touch-icon.png` | 180×180 PNG, no transparency | `app/layout.tsx` `metadata.icons.apple` |
| Share image | `public/og/abc-card.png` | 1200×630, logo and promise, readable when small | `openGraph.images` and `twitter.card: 'summary_large_image'` in `app/page.tsx` and `app/pricing/page.tsx` |
| Manifest screenshots | `public/screenshots/…` | At least one 1080×1920 phone and one wide desktop capture, demo data only | `public/manifest.json` `screenshots` |
| Hero photograph | — | See slot `hero` in `lib/landing/media.ts` | Slot `hero` |
| Real screen recording | — | See slot `hero-recording` | Slot `hero-recording` (needs a poster frame) |
| Real product screenshots | — | See slots `screen-*` | One slot per section |

## Decided elsewhere, listed here so they are not forgotten

- Manifest colours: `theme_color` and `background_color` are `#0a0a0b` while the app's viewport colour
  is `#f7f1e6` (the known PWA P8c/P8d test baseline). Dark splash or light splash is an owner decision.
- Manifest `id` stays `/dashboard`: changing it makes existing installs look like a different app.
- Canonical origin: `https://www.abccard.io` (`lib/site.ts`). The apex answers with a temporary 307
  to www today; a permanent 308 is the better signal for search engines and is set in the Vercel
  domain settings, not in code.
