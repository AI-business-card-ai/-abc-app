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
 * are not. Public cards (/d/, /u/, /card/) are deliberately neither listed in
 * the sitemap nor disallowed here, which is how they behaved before this file
 * existed: whether a shared card should appear in search results is an owner
 * decision, not something to change in passing.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [...SIGNED_IN, '/api/', '/auth/'],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  }
}
