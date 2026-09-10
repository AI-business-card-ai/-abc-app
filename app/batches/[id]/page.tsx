import { redirect } from 'next/navigation'
import { notFound } from 'next/navigation'
import { createServerComponentClient } from '@/lib/supabase-server'
import { createServerSupabase } from '@/lib/supabase'
import { loadBatch } from '@/lib/scan/batch-store'
import BatchDetailView from '@/components/scan/BatchDetailView'

/**
 * A saved batch, after the fact.
 *
 * Exists so exporting is not a one-time offer on the save screen. Somebody
 * scanning at a stand will press "View contacts" and deal with the CRM on the
 * train home, and without this page that intent has nowhere to land.
 */

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Scan batch — ABC',
}

export default async function BatchPage({ params }: { params: { id: string } }) {
  const auth = createServerComponentClient()
  const {
    data: { user },
  } = await auth.auth.getUser()

  if (!user) redirect('/login')

  // Owner-scoped by the loader: a batch id belonging to somebody else resolves
  // to nothing, which is a 404 rather than a permission message.
  const batch = await loadBatch(createServerSupabase(), user.id, params.id)
  if (!batch) notFound()

  const { data: contacts } = await createServerSupabase()
    .from('scanned_contacts')
    .select('id, name, company, role, email, phone')
    .eq('user_id', user.id)
    .eq('scan_batch_id', params.id)
    .order('created_at', { ascending: true })

  return (
    <BatchDetailView
      batch={batch}
      contacts={(contacts || []).map((row) => ({
        id: String(row.id),
        name: typeof row.name === 'string' ? row.name : '',
        company: typeof row.company === 'string' ? row.company : null,
        role: typeof row.role === 'string' ? row.role : null,
        email: typeof row.email === 'string' ? row.email : null,
        phone: typeof row.phone === 'string' ? row.phone : null,
      }))}
    />
  )
}
