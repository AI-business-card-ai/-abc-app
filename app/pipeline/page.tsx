import { redirect } from 'next/navigation'

/**
 * The old Pipeline address. The board grew into ABC CRM, whose default tab is
 * the pipeline, so bookmarks, installed-app shortcuts and old links keep
 * working by arriving there.
 */
export default function PipelinePage() {
  redirect('/crm')
}
