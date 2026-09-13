import { headerText, htmlMultiline, isSingleEmailAddress } from '@/lib/email-safety'

/**
 * Send one message from the owner's own Gmail.
 *
 * The raw message is assembled here, which makes this the place a header could
 * be injected. So the recipient — a contact's stored address — must be exactly
 * one mailbox, and the subject is one line with no control characters. The body
 * is the owner's text, escaped for HTML by the canonical helper with its line
 * breaks kept. Gmail's own error text is logged by status only and never passed
 * on.
 */
export async function sendGmailMessage(
  accessToken: string,
  to: string,
  subject: string,
  body: string
) {
  const recipient = typeof to === 'string' ? to.trim() : ''
  if (!isSingleEmailAddress(recipient)) {
    throw new Error('Invalid recipient address')
  }

  const message = [
    `To: ${recipient}`,
    `Subject: ${headerText(subject, 500)}`,
    'Content-Type: text/html; charset=utf-8',
    '',
    htmlMultiline(body),
  ].join('\n')

  const encodedMessage = Buffer.from(message)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')

  const response = await fetch(
    'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ raw: encodedMessage }),
    }
  )

  if (!response.ok) {
    console.error('[gmail] send failed with status', response.status)
    throw new Error('Failed to send Gmail message')
  }

  const data = (await response.json()) as { id?: string }
  if (!data.id) {
    throw new Error('Gmail API did not return a message id')
  }

  return { messageId: data.id }
}
