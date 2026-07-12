export const metadata = { title: 'Terms of Service — ABC', description: 'Terms governing use of ABC AI Business Card.' }

export default function TermsPage() {
  return (
    <div style={{ background: '#0f0f0f', minHeight: '100vh', padding: '0 0 60px' }}>
      <div style={{ maxWidth: 680, margin: '0 auto', padding: '32px 24px' }}>
        <a href="/" style={{ display: 'inline-block', marginBottom: 32, fontSize: 20, fontWeight: 900, background: 'linear-gradient(90deg,#f0197d,#00d4d4)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>ABC</a>
        <h1 style={{ color: '#ffffff', fontSize: 28, fontWeight: 900, marginBottom: 8 }}>Terms of Service</h1>
        <p style={{ color: '#666', fontSize: 13, marginBottom: 40 }}>Effective date: August 8, 2026</p>

        {[
          { h: '1. The service', t: 'ABC — AI Business Card ("ABC", "we") lets you scan business cards, enrich contact data using AI, and generate suggested follow-up messages. All AI-generated messages are drafts — you review and approve every message before it is sent. Nothing is ever sent automatically.' },
          { h: '2. Operator', t: 'ABC is operated by [LEGAL ENTITY TO BE ADDED — company registration pending]. Contact: support@abccard.io.' },
          { h: '3. Your account', t: 'You must be at least 16 years old and provide accurate information. You are responsible for all activity under your account. Sign-in is via Google OAuth.' },
          { h: '4. Acceptable use', t: 'You agree not to: scan contacts without a lawful basis or send spam; circumvent scan limits or security measures; access other users\' data; reverse engineer or resell the service; upload unlawful or infringing content. You are solely responsible for complying with GDPR and anti-spam laws when contacting people.' },
          { h: '5. Plans and billing', t: 'ABC offers a free plan (limited lifetime scans) and paid plans billed monthly via Stripe. Prices are at abccard.io/pricing. Subscriptions renew automatically until cancelled. Cancel anytime — takes effect at end of billing period. Fees are non-refundable except where required by law. Price changes notified 30 days in advance.' },
          { h: '6. AI-generated content', t: 'AI outputs (extracted data, enrichment estimates, message drafts, match scores) may be inaccurate. Estimates are labeled where possible. You are responsible for reviewing AI outputs before use.' },
          { h: '7. Your data', t: 'You retain all rights to data you upload and contacts you scan. You grant us a limited license to process this data solely to provide the service. We do not sell your data.' },
          { h: '8. Intellectual property', t: 'ABC software, design, and branding are our property. These Terms grant you a limited, non-exclusive, non-transferable right to use the service for your internal business purposes.' },
          { h: '9. Availability', t: 'We may modify, suspend, or discontinue features at any time. We aim for high availability but do not guarantee uninterrupted service.' },
          { h: '10. Termination', t: 'You may stop using ABC and delete your account at any time. We may suspend accounts that violate these Terms. Upon termination, your data is deleted per our Privacy Policy.' },
          { h: '11. Liability', t: 'The service is provided "as is". To the maximum extent permitted by law, our total liability is limited to amounts you paid us in the preceding 12 months. We are not liable for indirect or consequential damages.' },
          { h: '12. Governing law', t: 'These Terms are governed by Czech law. Disputes are resolved by Czech courts unless mandatory consumer protection rules provide otherwise.' },
          { h: '13. Contact', t: 'support@abccard.io' },
        ].map(({ h, t }) => (
          <div key={h} style={{ marginBottom: 32 }}>
            <h2 style={{ color: '#ffffff', fontSize: 16, fontWeight: 700, marginBottom: 8 }}>{h}</h2>
            <p style={{ color: '#9ca3af', fontSize: 14, lineHeight: 1.7 }}>{t}</p>
          </div>
        ))}

        <div style={{ borderTop: '1px solid #2a2a2a', paddingTop: 24, marginTop: 40 }}>
          <a href="/privacy" style={{ color: '#666', fontSize: 13 }}>Privacy Policy →</a>
        </div>
      </div>
    </div>
  )
}
