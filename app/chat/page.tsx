import ChatListClient from '@/components/chat/ChatListClient'
import { createServerComponentClient } from '@/lib/supabase-server'
import type { ScannedContact } from '@/lib/types'

export default async function ChatPage() {
  const supabase = createServerComponentClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return null

  const { data } = await supabase
    .from('scanned_contacts')
    .select('*')
    .eq('user_id', user.id)
    .or('messages_sent.gt.0,reply_received.eq.true')
    .order('last_message_date', { ascending: false, nullsFirst: false })

  const rows = ((data as ScannedContact[]) ?? []).filter(
    (c) => (c.messages_sent ?? 0) > 0 || c.reply_received === true
  )
  rows.sort((a, b) => {
    const aTime = a.last_message_date ? new Date(a.last_message_date).getTime() : 0
    const bTime = b.last_message_date ? new Date(b.last_message_date).getTime() : 0
    return bTime - aTime
  })

  return <ChatListClient initialContacts={rows} />
}
