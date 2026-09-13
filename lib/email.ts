import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://abccard.io'

/** Text for an HTML email body. */
export function escapeEmailHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

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

export async function sendQrConnectNotification(opts: {
  to: string
  ownerName: string
  newUserName: string
}) {
  const { to, ownerName, newUserName } = opts

  await resend.emails.send({
    from: 'ABC AI Business Card <hello@abccard.io>',
    to,
    subject: `${newUserName} joined ABC and saved your card`,
    html: `
      <div style="font-family:system-ui;max-width:600px;margin:0 auto;background:#0d0f1a;color:#f0f0ff;padding:40px;border-radius:12px;">
        <h1 style="background:linear-gradient(90deg,#f0197d,#00d4d4);-webkit-background-clip:text;-webkit-text-fill-color:transparent;font-size:24px;">
          ${newUserName} joined ABC 🎉
        </h1>
        <p style="color:#9ca3af;font-size:15px;line-height:1.6;">
          Hi ${ownerName}, ${newUserName} signed up for ABC from your digital card and saved your contact details.
        </p>
        <a href="${appUrl}/contacts" style="display:inline-block;background:linear-gradient(135deg,#f0197d,#00d4d4);color:#fff;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:700;font-size:15px;">
          Open ABC →
        </a>
        <p style="color:#4b5563;font-size:13px;margin-top:32px;">
          ABC AI Business Card · <a href="${appUrl}" style="color:#00d4d4;">abccard.io</a>
        </p>
      </div>
    `,
  })
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
}) {
  const { to, ownerName, contactName, company, email, phone, role, note, contactId } = opts
  const contactUrl = `${appUrl}/contacts/${contactId}`
  const firmLabel = company ? ` (${company})` : ''

  await resend.emails.send({
    from: 'ABC AI Business Card <hello@abccard.io>',
    to,
    subject: `Nová vizitka: ${contactName}${firmLabel}`,
    html: `
      <div style="font-family:system-ui;max-width:600px;margin:0 auto;background:#0f0f0f;color:#ffffff;padding:40px;border-radius:12px;">
        <h1 style="background:linear-gradient(90deg,#f0197d,#00d4d4);-webkit-background-clip:text;-webkit-text-fill-color:transparent;font-size:24px;">
          Nová vizitka přes tvoji kartu
        </h1>
        <p style="color:#999999;font-size:15px;line-height:1.6;">
          Ahoj ${ownerName}, někdo ti poslal svou vizitku.
        </p>
        <div style="background:#1a1a1a;border-radius:8px;padding:20px;margin:24px 0;border:1px solid #2a2a2a;">
          <p style="color:#ffffff;margin:0 0 8px;font-size:16px;font-weight:700;">${contactName}</p>
          ${role ? `<p style="color:#999999;margin:0 0 4px;">${role}</p>` : ''}
          ${company ? `<p style="color:#999999;margin:0 0 4px;">${company}</p>` : ''}
          ${email ? `<p style="color:#999999;margin:0 0 4px;">${email}</p>` : ''}
          ${phone ? `<p style="color:#999999;margin:0 0 4px;">${phone}</p>` : ''}
          ${note ? `<p style="color:#999999;margin:8px 0 0;font-size:14px;"><strong style="color:#00d4d4;">Poznámka:</strong> ${note}</p>` : ''}
        </div>
        <a href="${contactUrl}" style="display:inline-block;background:linear-gradient(135deg,#f0197d,#00d4d4);color:#fff;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:700;font-size:15px;">
          Otevřít kontakt v ABC →
        </a>
      </div>
    `,
  })
}

export async function sendReverseLeadNotification(opts: {
  to: string
  ownerName: string
  contactName: string
  company?: string
  context?: string
  contactId: string
}) {
  const { to, ownerName, contactName, company, context, contactId } = opts
  const contactUrl = `${appUrl}/contacts/${contactId}`

  await resend.emails.send({
    from: 'ABC AI Business Card <hello@abccard.io>',
    to,
    subject: `New contact from your ABC card: ${contactName}`,
    html: `
      <div style="font-family:system-ui;max-width:600px;margin:0 auto;background:#0d0f1a;color:#f0f0ff;padding:40px;border-radius:12px;">
        <h1 style="background:linear-gradient(90deg,#f0197d,#00d4d4);-webkit-background-clip:text;-webkit-text-fill-color:transparent;font-size:24px;">
          New contact from your ABC card
        </h1>
        <p style="color:#9ca3af;font-size:15px;line-height:1.6;">
          Hi ${ownerName}, someone scanned your digital card and left their details.
        </p>
        <div style="background:#141628;border-radius:8px;padding:20px;margin:24px 0;border:1px solid #2a2d3e;">
          <p style="color:#f0f0ff;margin:0 0 8px;font-size:16px;font-weight:700;">${contactName}</p>
          ${company ? `<p style="color:#9ca3af;margin:0 0 8px;">${company}</p>` : ''}
          ${context ? `<p style="color:#9ca3af;margin:0;font-size:14px;line-height:1.6;"><strong style="color:#00d4d4;">Context:</strong> ${context}</p>` : ''}
        </div>
        <a href="${contactUrl}" style="display:inline-block;background:linear-gradient(135deg,#f0197d,#00d4d4);color:#fff;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:700;font-size:15px;">
          View contact in ABC →
        </a>
        <p style="color:#4b5563;font-size:13px;margin-top:32px;">
          ABC AI Business Card · <a href="${appUrl}" style="color:#00d4d4;">abccard.io</a>
        </p>
      </div>
    `,
  })
}
