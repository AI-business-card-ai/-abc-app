'use client'

import { useState } from 'react'
import type { ScannedContact } from '@/lib/types'
import { shouldShowLinkedInMismatchWarning } from '@/lib/linkedin-identity'

type Props = {
  contact: ScannedContact
  onUpdated?: (contact: ScannedContact) => void
  compact?: boolean
}

export default function LinkedInMismatchBanner({ contact, onUpdated, compact }: Props) {
  const [busy, setBusy] = useState(false)
  const [manualUrl, setManualUrl] = useState(contact.linkedin_url || '')
  const [error, setError] = useState<string | null>(null)

  if (!shouldShowLinkedInMismatchWarning(contact)) return null

  async function runAction(action: 'reject' | 'set_url') {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/contact/linkedin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contactId: contact.id,
          action,
          linkedinUrl: action === 'set_url' ? manualUrl.trim() : undefined,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Action failed')
      if (json.contact) onUpdated?.(json.contact as ScannedContact)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action failed')
    } finally {
      setBusy(false)
    }
  }

  const cardCompany = contact.company || '—'
  const profileCompany = contact.linkedin_profile_company || '—'

  return (
    <div
      style={{
        marginBottom: compact ? '12px' : '16px',
        padding: compact ? '12px' : '14px',
        borderRadius: '10px',
        border: '1px solid rgba(234, 179, 8, 0.45)',
        background: 'rgba(234, 179, 8, 0.08)',
        color: '#fde68a',
      }}
    >
      <div style={{ fontSize: compact ? '12px' : '13px', fontWeight: 700, marginBottom: '6px' }}>
        ⚠ LinkedIn profile may not match — please verify
      </div>
      <p style={{ margin: '0 0 8px', fontSize: compact ? '11px' : '12px', color: '#fcd34d', lineHeight: 1.45 }}>
        {contact.linkedin_mismatch_reason ||
          `Profile shows a different company than the business card (${profileCompany} vs ${cardCompany}). Data is not used in score or messages.`}
      </p>
      {contact.linkedin_profile_name && (
        <p style={{ margin: '0 0 10px', fontSize: '11px', color: '#eab308' }}>
          LinkedIn: {contact.linkedin_profile_name}
          {contact.linkedin_profile_company ? ` · ${contact.linkedin_profile_company}` : ''}
        </p>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <button
          type="button"
          disabled={busy}
          onClick={() => runAction('reject')}
          style={{
            alignSelf: 'flex-start',
            padding: '8px 12px',
            borderRadius: '8px',
            border: '1px solid rgba(234, 179, 8, 0.5)',
            background: 'rgba(0,0,0,0.25)',
            color: '#fff7ed',
            fontSize: '12px',
            fontWeight: 600,
            cursor: busy ? 'wait' : 'pointer',
          }}
        >
          This isn&apos;t the right LinkedIn profile
        </button>

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <input
            type="url"
            value={manualUrl}
            onChange={(e) => setManualUrl(e.target.value)}
            placeholder="https://linkedin.com/in/..."
            style={{
              flex: '1 1 220px',
              minWidth: '180px',
              padding: '8px 10px',
              borderRadius: '8px',
              border: '1px solid #2a2a2a',
              background: '#141414',
              color: '#ffffff',
              fontSize: '12px',
            }}
          />
          <button
            type="button"
            disabled={busy || !manualUrl.trim()}
            onClick={() => runAction('set_url')}
            style={{
              padding: '8px 12px',
              borderRadius: '8px',
              border: '1px solid rgba(0,212,212,0.45)',
              background: 'rgba(0,212,212,0.12)',
              color: '#00d4d4',
              fontSize: '12px',
              fontWeight: 600,
              cursor: busy ? 'wait' : 'pointer',
            }}
          >
            Use correct URL
          </button>
        </div>
      </div>

      {error && (
        <p style={{ margin: '8px 0 0', fontSize: '11px', color: '#fca5a5' }}>
          {error}
        </p>
      )}
    </div>
  )
}
