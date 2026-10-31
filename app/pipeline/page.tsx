import { redirect } from 'next/navigation'

/**
 * The old Pipeline address. The board grew into ABC CRM, whose default tab is
 * the pipeline, so bookmarks, installed-app shortcuts and old links keep
 * working by arriving there.
 *
 * Dynamic on purpose: prerendered, a redirect ships as a 307 with no Location
 * header and a year-long CDN cache, and lands only through a meta refresh.
 * Rendered per request it is a plain 307 to /crm.
 */
export const dynamic = 'force-dynamic'

export default function PipelinePage() {
  redirect('/crm')
}
