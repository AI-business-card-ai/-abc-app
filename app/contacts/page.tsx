import ContactsClient from '@/components/contacts/ContactsClient'
import { createServerComponentClient } from '@/lib/supabase-server'
import type { ScannedContact } from '@/lib/types'

export default async function ContactsPage() {
  const supabase = createServerComponentClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Middleware already redirects unauthenticated users — this is a safety net.
  if (!user) return null

  const { data } = await supabase
    .from('scanned_contacts')
    .select('*')
    .eq('user_id', user.id)
    .order('scanned_at', { ascending: false })

  return (
    <ContactsClient
      userId={user.id}
      initialContacts={(data as ScannedContact[]) ?? []}
    />
  )
}
