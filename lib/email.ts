import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://abccard.io'

export async function sendWelcomeEmail(to: string, name: string) {
  await resend.emails.send({
    from: 'ABC AI Business Card <hello@abccard.io>',
    to,
    subject: 'Welcome to ABC — Scan. Know. Connect.',
    html: `
      <div style="font-family:system-ui;max-width:600px;margin:0 auto;background:#0d0f1a;color:#f0f0ff;padding:40px;border-radius:12px;">
        <h1 style="background:linear-gradient(90deg,#00d4d4,#f0197d);-webkit-background-clip:text;-webkit-text-fill-color:transparent;font-size:28px;">
          Welcome to ABC, ${name}! 🚀
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
    `,
  })
}

export async function sendFollowUpReminder(
  to: string,
  name: string,
  contactName: string,
  dayNumber: number
) {
  await resend.emails.send({
    from: 'ABC AI Business Card <hello@abccard.io>',
    to,
    subject: `⚡ Follow-up reminder: ${contactName} — Day ${dayNumber}`,
    html: `
      <div style="font-family:system-ui;max-width:600px;margin:0 auto;background:#0d0f1a;color:#f0f0ff;padding:40px;border-radius:12px;">
        <h1 style="color:#f0f0ff;font-size:22px;">
          Time to follow up with ${contactName} 👋
        </h1>
        <p style="color:#9ca3af;font-size:15px;line-height:1.6;">
          This is your Day ${dayNumber} reminder. Do not let this contact go cold.
        </p>
        <a href="${appUrl}/contacts" style="display:inline-block;background:linear-gradient(135deg,#00d4d4,#8b5cf6);color:#fff;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:700;font-size:15px;">
          Send follow-up message →
        </a>
        <p style="color:#4b5563;font-size:13px;margin-top:32px;">
          ABC AI Business Card · <a href="${appUrl}" style="color:#00d4d4;">abccard.io</a>
        </p>
      </div>
    `,
  })
}

export async function sendMessageSentConfirmation(
  to: string,
  name: string,
  contactName: string,
  channel: string
) {
  await resend.emails.send({
    from: 'ABC AI Business Card <hello@abccard.io>',
    to,
    subject: `✅ Message sent to ${contactName} via ${channel}`,
    html: `
      <div style="font-family:system-ui;max-width:600px;margin:0 auto;background:#0d0f1a;color:#f0f0ff;padding:40px;border-radius:12px;">
        <h1 style="color:#00d4d4;font-size:22px;">
          ✅ Message sent to ${contactName}
        </h1>
        <p style="color:#9ca3af;font-size:15px;line-height:1.6;">
          Your ${channel} message has been sent. ABC will remind you to follow up in 3 days.
        </p>
        <a href="${appUrl}/pipeline" style="display:inline-block;background:linear-gradient(135deg,#f0197d,#8b5cf6);color:#fff;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:700;font-size:15px;">
          View in Pipeline →
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
  const contactUrl = `${appUrl}/contact/${contactId}`

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
