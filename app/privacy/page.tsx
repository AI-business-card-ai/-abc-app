import PublicDoc, { type DocClause } from '@/components/landing/PublicDoc'

export const metadata = { title: 'Privacy Policy — ABC', description: 'How ABC AI Business Card handles your data.' }

/*
  Clause text, effective date and metadata are carried over verbatim from the
  release candidate. This file only decides how the document is presented.
*/
const CLAUSES: DocClause[] = [
          { h: '1. Who we are', t: 'ABC — AI Business Card is operated by [LEGAL ENTITY TO BE ADDED — company registration pending]. Contact: support@abccard.io. Service available at abccard.io.' },
          { h: '2. What we collect', t: 'Account info (name, email, and a profile photo if you add one) from email sign-up or from Google or Apple sign-in. Profile data you enter (job title, company, goals). Business card data extracted via AI when you scan a card. Contact context (where you met, notes, follow-up preferences). Payment info processed by Stripe — we never store card details. Basic usage data for service operation.' },
          { h: '3. How we use your data', t: 'To provide core features: scanning, keeping your contacts and meeting notes, generating message drafts. AI-generated messages are always reviewed by you before sending — nothing is ever sent automatically. To manage your subscription and process payments. To send transactional emails (billing, account notifications). To improve service reliability and quality. We never sell your data or your contacts\' data.' },
          { h: '4. AI processing', t: 'Card images and text are processed by Anthropic\'s Claude API for data extraction and message drafting. All providers are contractually bound to process data only on our behalf.' },
          { h: '5. Data sharing', t: 'We share data only with: Vercel (hosting), Supabase (database and auth), Anthropic (AI processing), Stripe (payments) and Resend (email). When you choose to use them, data also goes to: Google (email you send from a Gmail account you connect, and Google Wallet if you add your card to it), Apple (if you sign in with Apple), and HubSpot, Salesforce or Pipedrive (contacts and meetings you push to a CRM you connect). We disclose data only when required by law.' },
          { h: '6. Your contacts\' data', t: 'You are the data controller for contacts you scan. ABC processes this data on your instructions. You are responsible for having a lawful basis to store and contact people whose cards you scan. If a scanned contact requests deletion, contact us at support@abccard.io.' },
          { h: '7. Your rights (GDPR)', t: 'You have the right to access, correct, delete, or export your data. To exercise your rights contact support@abccard.io. You may also lodge a complaint with ÚOOÚ (uoou.gov.cz) in the Czech Republic.' },
          { h: '8. Data retention', t: 'We retain your data while your account is active. You can delete your account at any time in the app under Settings → Profile & Account → Delete account; the Account deletion page (/account-deletion) explains what is removed and what may be kept. You can also request deletion at support@abccard.io — we delete within 30 days except where law requires retention (e.g. billing records).' },
          { h: '9. Security', t: 'Data is encrypted in transit (HTTPS) and stored with row-level access controls. No system is 100% secure but we take reasonable technical and organizational measures.' },
          { h: '10. Children', t: 'ABC is not intended for anyone under 16. We do not knowingly collect data from minors.' },
          { h: '11. Changes', t: 'We may update this policy and will post changes here with an updated date. Material changes will be announced in the app or by email.' },
          { h: '12. Contact', t: 'support@abccard.io' },
        ]

export default function PrivacyPage() {
  return (
    <PublicDoc
      title="Privacy Policy"
      effective="August 8, 2026"
      clauses={CLAUSES}
      otherHref="/terms"
      otherLabel="Terms of Service"
    />
  )
}
