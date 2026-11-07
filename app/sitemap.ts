import type { MetadataRoute } from 'next'
import { PUBLIC_PAGES, SITE_URL } from '@/lib/site'

/**
 * sitemap.xml — the marketing pages, on the canonical origin.
 *
 * No lastModified: nothing in the build knows when each page's content last
 * changed, and a build timestamp would claim every page changed on every
 * deployment.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return PUBLIC_PAGES.map((page) => ({ url: page === '/' ? `${SITE_URL}/` : `${SITE_URL}${page}` }))
}
