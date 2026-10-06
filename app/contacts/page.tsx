import { redirect } from 'next/navigation'
import ContactsView from '@/components/contacts/ContactsView'
import { CONTACT_LIST_COLUMNS, type ContactListRow } from '@/lib/contacts-view'
import { createServerComponentClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

export default async function ContactsPage({
  searchParams,
}: {
  /** `?q=` — the search Home's search fields hand over. */
  searchParams?: { q?: string | string[] }
}) {
  const q = searchParams?.q
  const initialQuery = (Array.isArray(q) ? q[0] : q)?.slice(0, 200) ?? ''

  const supabase = createServerComponentClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Middleware already gates this route; this is the safety net.
  if (!user) redirect('/login')

  const { data, error } = await supabase
    .from('scanned_contacts')
    .select(CONTACT_LIST_COLUMNS)
    .eq('user_id', user.id)
    .order('scanned_at', { ascending: false })

  if (error) {
    console.error('[contacts] load failed:', error)
  }

  return (
    <ContactsView
      userId={user.id}
      initialContacts={(data as unknown as ContactListRow[]) ?? []}
      initialError={Boolean(error)}
      initialQuery={initialQuery}
    />
  )
}
