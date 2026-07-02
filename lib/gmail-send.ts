import { onMessageSent } from '@/lib/crm-engine'
import { sendGmailMessage } from '@/lib/gmail'
import {
  getGoogleAccessTokenForUser,
  GoogleReconnectRequiredError,
  GOOGLE_RECONNECT_CODE,
} from '@/lib/google-gmail-auth'
import { createServiceClient } from '@/lib/supabase/service'

export { GoogleReconnectRequiredError, GOOGLE_RECONNECT_CODE }

export async function sendGmailForContact(
  userId: string,
  contactId: string,
  subject: string,
  body: string
) {
  const supabase = createServiceClient()

  const { data: contact } = await supabase
    .from('scanned_contacts')
    .select('id, email')
    .eq('id', contactId)
    .eq('user_id', userId)
    .maybeSingle()

  if (!contact?.email) {
    throw new Error('Contact email not found')
  }

  const accessToken = await getGoogleAccessTokenForUser(userId)
  const sentAt = new Date().toISOString()
  const { messageId } = await sendGmailMessage(accessToken, contact.email, subject, body)

  await onMessageSent(contactId, userId, 'Gmail', body, {
    message_id: messageId,
    sent_at: sentAt,
    subject,
    to: contact.email,
  })

  const { data: updated } = await supabase
    .from('scanned_contacts')
    .select('*')
    .eq('id', contactId)
    .single()

  return {
    contact: updated,
    messageId,
    sentAt,
  }
}
