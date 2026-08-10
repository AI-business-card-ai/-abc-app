import PipelineClient from '@/components/pipeline/PipelineClient'
import { createServerComponentClient } from '@/lib/supabase-server'
import type { ScannedContact } from '@/lib/types'

export default async function PipelinePage() {
  const supabase = createServerComponentClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return null

  const { data } = await supabase
    .from('scanned_contacts')
    .select('*')
    .eq('user_id', user.id)
    .order('scanned_at', { ascending: false })

  return (
    <PipelineClient
      userId={user.id}
      initialContacts={(data as ScannedContact[]) ?? []}
    />
  )
}
