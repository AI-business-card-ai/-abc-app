/**
 * The public site's canonical origin.
 *
 * The owner chose www (2026-11-07); the apex redirects to it. Search metadata —
 * canonical links, og:url, robots.txt and sitemap.xml — uses this constant
 * rather than NEXT_PUBLIC_APP_URL, so a preview or a local build still points
 * search engines at the production pages instead of at itself.
 *
 * Links that must work on the host serving them (email, OAuth redirects,
 * Stripe returns) keep using NEXT_PUBLIC_APP_URL. The hard-coded apex card
 * links (`https://abccard.io/d/<slug>`) are product code, listed in
 * docs/launch/launch-contracts.md §3.
 */
export const SITE_URL = 'https://www.abccard.io'

/**
 * The marketing pages search engines should know about, and nothing else.
 *
 * Public cards (/d/, /u/, /card/) are left out on purpose: they are reached
 * through the links and QR codes people share, not through a list of everyone's
 * card, and robots.txt neither invites nor blocks them.
 */
export const PUBLIC_PAGES = ['/', '/pricing', '/privacy', '/terms', '/account-deletion'] as const
