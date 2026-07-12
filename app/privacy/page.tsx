export const metadata = { title: 'Privacy Policy — ABC', description: 'How ABC AI Business Card handles your data.' }

export default function PrivacyPage() {
  return (
    <div style={{ background: '#0f0f0f', minHeight: '100vh', padding: '0 0 60px' }}>
      <div style={{ maxWidth: 680, margin: '0 auto', padding: '32px 24px' }}>
        <a href="/" style={{ display: 'inline-block', marginBottom: 32, fontSize: 20, fontWeight: 900, background: 'linear-gradient(90deg,#f0197d,#00d4d4)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>ABC</a>
        <h1 style={{ color: '#ffffff', fontSize: 28, fontWeight: 900, marginBottom: 8 }}>Privacy Policy</h1>
        <p style={{ color: '#666', fontSize: 13, marginBottom: 40 }}>Effective date: August 8, 2026</p>

        {[
          { h: '1. Who we are', t: 'ABC — AI Business Card is operated by [LEGAL ENTITY TO BE ADDED — company registration pending]. Contact: support@abccard.io. Service available at abccard.io.' },
          { h: '2. What we collect', t: 'Account info (name, email, profile photo) via Google OAuth. Profile data you enter (job title, company, goals). Business card data extracted via AI when you scan a card. Contact context (where you met, notes, follow-up preferences). Business enrichment data from third-party providers. Payment info processed by Stripe — we never store card details. Basic usage data for service operation.' },
          { h: '3. How we use your data', t: 'To provide core features: scanning, enriching contacts, generating message drafts. AI-generated messages are always reviewed by you before sending — nothing is ever sent automatically. To manage your subscription and process payments. To send transactional emails (billing, account notifications). To improve service reliability and quality. We never sell your data or your contacts\' data.' },
          { h: '4. AI processing', t: 'Card images and text are processed by Anthropic\'s Claude API for data extraction and message drafting. Contact enrichment uses third-party business data providers. All providers are contractually bound to process data only on our behalf.' },
          { h: '5. Data sharing', t: 'We share data only with: Vercel (hosting), Supabase (database and auth), Anthropic (AI processing), Stripe (payments), Resend (email), and business data enrichment providers. We disclose data only when required by law.' },
          { h: '6. Your contacts\' data', t: 'You are the data controller for contacts you scan. ABC processes this data on your instructions. You are responsible for having a lawful basis to store and contact people whose cards you scan. If a scanned contact requests deletion, contact us at support@abccard.io.' },
          { h: '7. Your rights (GDPR)', t: 'You have the right to access, correct, delete, or export your data. To exercise your rights contact support@abccard.io. You may also lodge a complaint with ÚOOÚ (uoou.gov.cz) in the Czech Republic.' },
          { h: '8. Data retention', t: 'We retain your data while your account is active. Request deletion at support@abccard.io — we delete within 30 days except where law requires retention (e.g. billing records).' },
          { h: '9. Security', t: 'Data is encrypted in transit (HTTPS) and stored with row-level access controls. No system is 100% secure but we take reasonable technical and organizational measures.' },
          { h: '10. Children', t: 'ABC is not intended for anyone under 16. We do not knowingly collect data from minors.' },
          { h: '11. Changes', t: 'We may update this policy and will post changes here with an updated date. Material changes will be announced in the app or by email.' },
          { h: '12. Contact', t: 'support@abccard.io' },
        ].map(({ h, t }) => (
          <div key={h} style={{ marginBottom: 32 }}>
            <h2 style={{ color: '#ffffff', fontSize: 16, fontWeight: 700, marginBottom: 8 }}>{h}</h2>
            <p style={{ color: '#9ca3af', fontSize: 14, lineHeight: 1.7 }}>{t}</p>
          </div>
        ))}

        <div style={{ borderTop: '1px solid #2a2a2a', paddingTop: 24, marginTop: 40 }}>
          <a href="/terms" style={{ color: '#666', fontSize: 13 }}>Terms of Service →</a>
        </div>
      </div>
    </div>
  )
}
