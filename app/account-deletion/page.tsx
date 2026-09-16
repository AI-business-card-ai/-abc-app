export const metadata = {
  title: 'Delete your ABC account — ABC',
  description: 'How to delete your ABC account, what is deleted and what may be kept.',
}

/**
 * The public account deletion page.
 *
 * Linked from the app stores and from support, so it must work signed out and
 * must say only what the product actually does: the steps are the real screens,
 * the lists match lib/account/delete.ts and 20260916120000_account_deletion, and
 * no retention period is stated because none has been decided.
 */

const SUPPORT_EMAIL = 'support@abccard.io'

const SECTIONS: { h: string; items: string[] }[] = [
  {
    h: 'Delete your account in ABC',
    items: [
      'Sign in to ABC — on the web, in the installed app, or in the ABC Card app for iPhone or Android.',
      'Open Settings, then Profile & Account, then Delete account.',
      'Type DELETE and confirm. Your account is deleted straight away and you are signed out.',
      'If you have an ABC Pro subscription that still renews, you will be asked to cancel it in Plan & Billing first, so that nobody is charged for an account that no longer exists.',
    ],
  },
  {
    h: 'If you cannot sign in',
    items: [
      'If you signed up with an email and password, reset your password from the sign-in screen, then delete your account as above.',
      'If you signed in with Google or Apple, use the same button again.',
      `If you still cannot get in, email ${SUPPORT_EMAIL} from the email address on the account and ask for it to be deleted.`,
    ],
  },
  {
    h: 'What is deleted',
    items: [
      'Your profile and public card, including its links, events, showcase and uploaded images. Your card link stops working.',
      'Your contacts, meeting history, notes, follow-ups, activities and opportunities.',
      'Your scan sessions and CRM sync records.',
      'The Gmail, HubSpot, Salesforce and Pipedrive connections ABC stored for you.',
      'Your sign-in account.',
    ],
  },
  {
    h: 'What may be kept',
    items: [
      'A record that the account was deleted, with a summary of its purchases, Smart Scan credits and ABC Pro billing. It does not include your name, email, card or contacts. It is kept so payments can still be accounted for.',
      'Records that payment providers such as Stripe keep themselves.',
      'Unused Smart Scan credits and any remaining ABC Pro time end with the account and are not refunded automatically.',
    ],
  },
  {
    h: 'What ABC cannot delete',
    items: [
      'Emails you sent through Gmail, records you pushed into a CRM and files you exported stay in those services.',
      'Passes saved to Apple Wallet or Google Wallet stay there until removed; the card link inside them stops working.',
      'Other ABC users who saved your card as a contact keep their own record of meeting you.',
    ],
  },
]

export default function AccountDeletionPage({
  searchParams,
}: {
  searchParams?: { deleted?: string }
}) {
  const justDeleted = searchParams?.deleted === '1'

  return (
    <div style={{ background: '#0f0f0f', minHeight: '100vh', padding: '0 0 60px' }}>
      <div style={{ maxWidth: 680, margin: '0 auto', padding: '32px 24px' }}>
        <a href="/" style={{ display: 'inline-block', marginBottom: 32, fontSize: 20, fontWeight: 900, background: 'linear-gradient(90deg,#f0197d,#00d4d4)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>ABC</a>
        <h1 style={{ color: '#ffffff', fontSize: 28, fontWeight: 900, marginBottom: 8 }}>Delete your ABC account</h1>
        <p style={{ color: '#9ca3af', fontSize: 14, lineHeight: 1.7, marginBottom: 32 }}>
          You can delete your ABC account and the data that belongs to it at any time, from inside ABC.
        </p>

        {justDeleted ? (
          <div role="status" style={{ border: '1px solid #2a2a2a', borderRadius: 12, padding: '16px 18px', marginBottom: 32 }}>
            <p style={{ color: '#ffffff', fontSize: 15, fontWeight: 700 }}>Your ABC account has been deleted.</p>
            <p style={{ color: '#9ca3af', fontSize: 14, lineHeight: 1.7, marginTop: 4 }}>You have been signed out.</p>
          </div>
        ) : null}

        {SECTIONS.map(({ h, items }) => (
          <div key={h} style={{ marginBottom: 32 }}>
            <h2 style={{ color: '#ffffff', fontSize: 16, fontWeight: 700, marginBottom: 8 }}>{h}</h2>
            <ul style={{ color: '#9ca3af', fontSize: 14, lineHeight: 1.7, paddingLeft: 20, listStyle: 'disc' }}>
              {items.map((item) => (
                <li key={item} style={{ marginBottom: 6 }}>{item}</li>
              ))}
            </ul>
          </div>
        ))}

        <div style={{ marginBottom: 32 }}>
          <h2 style={{ color: '#ffffff', fontSize: 16, fontWeight: 700, marginBottom: 8 }}>Questions</h2>
          <p style={{ color: '#9ca3af', fontSize: 14, lineHeight: 1.7 }}>
            Contact <a href={`mailto:${SUPPORT_EMAIL}`} style={{ color: '#ffffff' }}>{SUPPORT_EMAIL}</a>.
          </p>
        </div>

        <div style={{ borderTop: '1px solid #2a2a2a', paddingTop: 24, marginTop: 40, display: 'flex', gap: 20, flexWrap: 'wrap' }}>
          <a href="/settings/account/delete" style={{ color: '#666', fontSize: 13 }}>Delete my account →</a>
          <a href="/forgot-password" style={{ color: '#666', fontSize: 13 }}>Reset password →</a>
          <a href="/privacy" style={{ color: '#666', fontSize: 13 }}>Privacy Policy →</a>
        </div>
      </div>
    </div>
  )
}
