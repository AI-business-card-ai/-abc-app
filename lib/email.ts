import { Resend } from 'resend'
import {
  appOrigin,
  contactLink,
  escapeHtml,
  headerText,
  htmlMultiline,
  isSingleEmailAddress,
} from '@/lib/email-safety'

const resend = new Resend(process.env.RESEND_API_KEY)

const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://abccard.io'

/** Text for an HTML email body. The canonical escaper lives in `lib/email-safety`. */
export const escapeEmailHtml = escapeHtml

/** The welcome's body. Its one variable is a name the account holder typed, escaped. */
export function renderWelcomeEmailHtml(name: string): string {
  const safeName = escapeEmailHtml(name)
  return `
      <div style="font-family:system-ui;max-width:600px;margin:0 auto;background:#0d0f1a;color:#f0f0ff;padding:40px;border-radius:12px;">
        <h1 style="background:linear-gradient(90deg,#00d4d4,#f0197d);-webkit-background-clip:text;-webkit-text-fill-color:transparent;font-size:28px;">
          Welcome to ABC, ${safeName}! 🚀
        </h1>
        <p style="color:#9ca3af;font-size:16px;line-height:1.6;">
          You are now part of the future of B2B networking.
        </p>
        <div style="background:#141628;border-radius:8px;padding:24px;margin:24px 0;border:1px solid #2a2d3e;">
          <h2 style="color:#00d4d4;font-size:16px;margin:0 0 16px;">Get started in 3 steps:</h2>
          <p style="color:#9ca3af;margin:8px 0;">📷 <strong style="color:#f0f0ff;">Scan</strong> — Photo any business card</p>
          <p style="color:#9ca3af;margin:8px 0;">🤖 <strong style="color:#f0f0ff;">AI enriches</strong> — LinkedIn, company data, news</p>
          <p style="color:#9ca3af;margin:8px 0;">✉️ <strong style="color:#f0f0ff;">Send</strong> — Personalized message ready in 10 seconds</p>
        </div>
        <a href="${appUrl}/scan" style="display:inline-block;background:linear-gradient(135deg,#f0197d,#8b5cf6);color:#fff;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:700;font-size:15px;">
          Scan your first card →
        </a>
        <p style="color:#4b5563;font-size:13px;margin-top:32px;">
          ABC AI Business Card · Scan. Know. Connect.<br>
          <a href="${appUrl}" style="color:#00d4d4;">abccard.io</a>
        </p>
      </div>
    `
}

/**
 * The welcome email.
 *
 * Sent only through `/api/email/send` and `sendWelcomeForIdentity`, to the
 * signed-in account's own address. The sender is fixed here; nothing about it
 * comes from a request. A provider error is reported as `ok: false`, and only
 * its name reaches the log.
 */
export async function sendWelcomeEmail(to: string, name: string): Promise<{ ok: boolean }> {
  const { error } = await resend.emails.send({
    from: 'ABC AI Business Card <hello@abccard.io>',
    to,
    subject: 'Welcome to ABC — Scan. Know. Connect.',
    html: renderWelcomeEmailHtml(name),
  })

  if (error) {
    console.error('[email] welcome send failed:', error.name ?? 'unknown')
    return { ok: false }
  }
  return { ok: true }
}

/*
  Owner notifications.

  Every name, company, role, address, phone number and note in these emails
  was typed by somebody other than the person receiving them — a visitor at a
  stand, or a new account signing up from a card. So each one is escaped for
  the body and flattened to one line for the subject, through `lib/email-safety`
  and nowhere else. The sender is fixed, the recipient must be exactly one
  address, and no reply-to, cc or bcc is set: nothing a visitor types can become
  a header.
*/

export async function sendQrConnectNotification(opts: {
  to: string
  ownerName: string
  newUserName: string
}): Promise<{ ok: boolean }> {
  return deliver('qr-connect', opts.to, renderQrConnectEmail(opts))
}

export async function sendCardExchangeNotification(opts: {
  to: string
  ownerName: string
  contactName: string
  company?: string
  email?: string
  phone?: string
  role?: string
  note?: string
  contactId: string
}): Promise<{ ok: boolean }> {
  return deliver('card-exchange', opts.to, renderCardExchangeEmail(opts))
}

export async function sendReverseLeadNotification(opts: {
  to: string
  ownerName: string
  contactName: string
  company?: string
  context?: string
  contactId: string
}): Promise<{ ok: boolean }> {
  return deliver('reverse-lead', opts.to, renderReverseLeadEmail(opts))
}

export type RenderedEmail = { subject: string; html: string }

export function renderQrConnectEmail(opts: { ownerName: string; newUserName: string }): RenderedEmail {
  const newUser = headerText(opts.newUserName) || 'Someone'
  const safeNewUser = escapeHtml(newUser)
  const safeOwner = escapeHtml(headerText(opts.ownerName) || 'there')
  const origin = appOrigin(appUrl)

  return {
    subject: `${newUser} joined ABC and saved your card`,
    html: `
      <div style="font-family:system-ui;max-width:600px;margin:0 auto;background:#0d0f1a;color:#f0f0ff;padding:40px;border-radius:12px;">
        <h1 style="background:linear-gradient(90deg,#f0197d,#00d4d4);-webkit-background-clip:text;-webkit-text-fill-color:transparent;font-size:24px;">
          ${safeNewUser} joined ABC 🎉
        </h1>
        <p style="color:#9ca3af;font-size:15px;line-height:1.6;">
          Hi ${safeOwner}, ${safeNewUser} signed up for ABC from your digital card and saved your contact details.
        </p>
        <a href="${escapeHtml(`${origin}/contacts`)}" style="display:inline-block;background:linear-gradient(135deg,#f0197d,#00d4d4);color:#fff;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:700;font-size:15px;">
          Open ABC →
        </a>
        <p style="color:#4b5563;font-size:13px;margin-top:32px;">
          ABC AI Business Card · <a href="${escapeHtml(origin)}" style="color:#00d4d4;">abccard.io</a>
        </p>
      </div>
    `,
  }
}

export function renderCardExchangeEmail(opts: {
  ownerName: string
  contactName: string
  company?: string
  email?: string
  phone?: string
  role?: string
  note?: string
  contactId: string
}): RenderedEmail {
  const name = headerText(opts.contactName) || 'Nový kontakt'
  const company = headerText(opts.company)
  const firmLabel = company ? ` (${company})` : ''
  const line = (value: string | undefined) =>
    value && value.trim() ? `<p style="color:#999999;margin:0 0 4px;">${escapeHtml(value.trim())}</p>` : ''
  const note = opts.note && opts.note.trim() ? htmlMultiline(opts.note) : ''

  return {
    subject: headerText(`Nová vizitka: ${name}${firmLabel}`, 200),
    html: `
      <div style="font-family:system-ui;max-width:600px;margin:0 auto;background:#0f0f0f;color:#ffffff;padding:40px;border-radius:12px;">
        <h1 style="background:linear-gradient(90deg,#f0197d,#00d4d4);-webkit-background-clip:text;-webkit-text-fill-color:transparent;font-size:24px;">
          Nová vizitka přes tvoji kartu
        </h1>
        <p style="color:#999999;font-size:15px;line-height:1.6;">
          Ahoj ${escapeHtml(headerText(opts.ownerName) || 'there')}, někdo ti poslal svou vizitku.
        </p>
        <div style="background:#1a1a1a;border-radius:8px;padding:20px;margin:24px 0;border:1px solid #2a2a2a;">
          <p style="color:#ffffff;margin:0 0 8px;font-size:16px;font-weight:700;">${escapeHtml(name)}</p>
          ${line(opts.role)}
          ${line(opts.company)}
          ${line(opts.email)}
          ${line(opts.phone)}
          ${note ? `<p style="color:#999999;margin:8px 0 0;font-size:14px;"><strong style="color:#00d4d4;">Poznámka:</strong> ${note}</p>` : ''}
        </div>
        <a href="${escapeHtml(contactLink(appUrl, opts.contactId))}" style="display:inline-block;background:linear-gradient(135deg,#f0197d,#00d4d4);color:#fff;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:700;font-size:15px;">
          Otevřít kontakt v ABC →
        </a>
      </div>
    `,
  }
}

export function renderReverseLeadEmail(opts: {
  ownerName: string
  contactName: string
  company?: string
  context?: string
  contactId: string
}): RenderedEmail {
  const name = headerText(opts.contactName) || 'Someone'
  const company = opts.company && opts.company.trim() ? escapeHtml(opts.company.trim()) : ''
  const context = opts.context && opts.context.trim() ? htmlMultiline(opts.context) : ''
  const origin = appOrigin(appUrl)

  return {
    subject: headerText(`New contact from your ABC card: ${name}`, 200),
    html: `
      <div style="font-family:system-ui;max-width:600px;margin:0 auto;background:#0d0f1a;color:#f0f0ff;padding:40px;border-radius:12px;">
        <h1 style="background:linear-gradient(90deg,#f0197d,#00d4d4);-webkit-background-clip:text;-webkit-text-fill-color:transparent;font-size:24px;">
          New contact from your ABC card
        </h1>
        <p style="color:#9ca3af;font-size:15px;line-height:1.6;">
          Hi ${escapeHtml(headerText(opts.ownerName) || 'there')}, someone scanned your digital card and left their details.
        </p>
        <div style="background:#141628;border-radius:8px;padding:20px;margin:24px 0;border:1px solid #2a2d3e;">
          <p style="color:#f0f0ff;margin:0 0 8px;font-size:16px;font-weight:700;">${escapeHtml(name)}</p>
          ${company ? `<p style="color:#9ca3af;margin:0 0 8px;">${company}</p>` : ''}
          ${context ? `<p style="color:#9ca3af;margin:0;font-size:14px;line-height:1.6;"><strong style="color:#00d4d4;">Context:</strong> ${context}</p>` : ''}
        </div>
        <a href="${escapeHtml(contactLink(appUrl, opts.contactId))}" style="display:inline-block;background:linear-gradient(135deg,#f0197d,#00d4d4);color:#fff;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:700;font-size:15px;">
          View contact in ABC →
        </a>
        <p style="color:#4b5563;font-size:13px;margin-top:32px;">
          ABC AI Business Card · <a href="${escapeHtml(origin)}" style="color:#00d4d4;">abccard.io</a>
        </p>
      </div>
    `,
  }
}

/**
 * Hand one owner notification to the provider.
 *
 * The recipient is an owner's stored address, and still has to be exactly one
 * mailbox or nothing is sent. The payload is sender, recipient, subject and
 * body — never a reply-to, cc or bcc.
 */
async function deliver(kind: string, to: string, email: RenderedEmail): Promise<{ ok: boolean }> {
  const recipient = typeof to === 'string' ? to.trim() : ''
  if (!isSingleEmailAddress(recipient)) {
    console.error(`[email] ${kind} not sent: the recipient is not a single address`)
    return { ok: false }
  }

  const { error } = await resend.emails.send({
    from: 'ABC AI Business Card <hello@abccard.io>',
    to: recipient,
    subject: email.subject,
    html: email.html,
  })

  if (error) {
    console.error(`[email] ${kind} send failed:`, error.name ?? 'unknown')
    return { ok: false }
  }
  return { ok: true }
}
