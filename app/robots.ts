import type { MetadataRoute } from 'next'
import { SITE_URL } from '@/lib/site'

/**
 * Every signed-in route, as `protectedRoutes` in middleware.ts names them: those
 * answer a crawler with a redirect to /login, so there is nothing to index.
 * scripts/test-landing-seo.ts fails if the two lists drift apart.
 */
const SIGNED_IN = [
  '/home',
  '/my-card',
  '/scan',
  '/contacts',
  '/follow-ups',
  '/events',
  '/chat',
  '/settings',
  '/profile',
  '/pipeline',
  '/crm',
  '/onboarding',
  '/dashboard',
]

/**
 * robots.txt — served at /robots.txt.
 *
 * Marketing pages are open; signed-in routes, the API and the auth callbacks
 * are not. Public cards (/d/, /u/, /card/) are neither listed in the sitemap
 * nor disallowed here: each card page says noindex itself, and a crawler has to
 * be allowed to fetch the page to read that.
 *
 * The one API path allowed is the card share image. A link preview fetches it
 * from /api/card/og/<slug>, and some preview crawlers obey robots.txt. The
 * route answers only for published cards.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/', '/api/card/og/'],
        disallow: [...SIGNED_IN, '/api/', '/auth/'],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  }
}
