'use client'

import { useState } from 'react'

type Props = {
  ownerName: string
  ownerUserId: string
  open: boolean
  onClose: () => void
}

/**
 * The reciprocal half of the public card: a visitor hands their details back.
 * Visitor-facing, so it follows the same ABC palette and English copy as the
 * card it opens from.
 */

const inputStyle: React.CSSProperties = {
  width: '100%',
  minHeight: 48,
  background: '#18181b',
  border: '1px solid #232326',
  borderRadius: 13,
  padding: '12px 14px',
  color: '#ffffff',
  fontSize: 16,
  outline: 'none',
  boxSizing: 'border-box',
  fontFamily: 'inherit',
}

const ACCENT = '#d9a441'

export default function CardExchangeModal({ ownerName, ownerUserId, open, onClose }: Props) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [company, setCompany] = useState('')
  const [role, setRole] = useState('')
  const [note, setNote] = useState('')
  const [gdpr, setGdpr] = useState(false)
  const [honeypot, setHoneypot] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  if (!open) return null

  const firstName = ownerName.split(' ')[0]

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!name.trim() || !email.trim()) {
      setError('Name and email are required.')
      return
    }
    if (!gdpr) {
      setError('Please agree to sharing your details before sending.')
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch('/api/card/exchange', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ownerUserId,
          name: name.trim(),
          email: email.trim(),
          phone: phone.trim() || undefined,
          company: company.trim() || undefined,
          role: role.trim() || undefined,
          note: note.trim() || undefined,
          gdpr: true,
          website: honeypot,
        }),
      })
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string }
      if (!res.ok || !data.ok) throw new Error('That did not send. Try again.')
      setSuccess(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That did not send. Try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Send your details to ${firstName}`}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 200,
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
        background: 'rgba(4,4,5,0.72)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 440,
          maxHeight: '90vh',
          overflowY: 'auto',
          background: '#121214',
          border: '1px solid #232326',
          borderRadius: 22,
          padding: 20,
          paddingBottom: 'calc(20px + env(safe-area-inset-bottom))',
          fontFamily:
            'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
        }}
      >
        {success ? (
          <div style={{ textAlign: 'center', padding: '12px 0' }}>
            <p style={{ color: '#ffffff', fontSize: 18, fontWeight: 700, margin: '0 0 8px' }}>
              Sent — {firstName} has your details.
            </p>
            <a
              href="https://abccard.io?ref=exchange"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                minHeight: 48,
                marginTop: 16,
                padding: '0 20px',
                borderRadius: 13,
                background: ACCENT,
                color: '#1a1205',
                fontWeight: 600,
                textDecoration: 'none',
                fontSize: 15,
              }}
            >
              Create your own card
            </a>
            <button
              type="button"
              onClick={onClose}
              style={{
                display: 'block',
                width: '100%',
                minHeight: 48,
                marginTop: 10,
                borderRadius: 13,
                border: '1px solid #232326',
                background: 'transparent',
                color: '#a1a1aa',
                fontSize: 14,
                cursor: 'pointer',
              }}
            >
              Close
            </button>
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#ffffff' }}>
                Send your details
              </h2>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                style={{
                  border: 'none',
                  background: 'transparent',
                  color: '#a1a1aa',
                  fontSize: 22,
                  cursor: 'pointer',
                  minWidth: 44,
                  minHeight: 44,
                }}
              >
                ×
              </button>
            </div>
            <p style={{ margin: '0 0 16px', fontSize: 13.5, lineHeight: 1.5, color: '#a1a1aa' }}>
              {firstName} gets these straight away, so you both leave with a contact.
            </p>

            <form onSubmit={(e) => void handleSubmit(e)} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {/* honeypot */}
              <input
                type="text"
                name="website"
                value={honeypot}
                onChange={(e) => setHoneypot(e.target.value)}
                tabIndex={-1}
                autoComplete="off"
                aria-hidden
                style={{ position: 'absolute', left: -9999, opacity: 0, height: 0, width: 0 }}
              />
              <input
                style={inputStyle}
                placeholder="Name *"
                aria-label="Name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
              <input
                style={inputStyle}
                type="email"
                placeholder="Email *"
                aria-label="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
              <input
                style={inputStyle}
                placeholder="Phone"
                aria-label="Phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
              <input
                style={inputStyle}
                placeholder="Company"
                aria-label="Company"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
              />
              <input
                style={inputStyle}
                placeholder="Job title"
                aria-label="Job title"
                value={role}
                onChange={(e) => setRole(e.target.value)}
              />
              <textarea
                style={{ ...inputStyle, minHeight: 80, resize: 'vertical' }}
                placeholder="Where did you meet?"
                aria-label="Where did you meet?"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />

              <label
                style={{
                  display: 'flex',
                  gap: 10,
                  alignItems: 'flex-start',
                  fontSize: 12.5,
                  color: '#a1a1aa',
                  lineHeight: 1.45,
                  padding: '4px 0',
                }}
              >
                <input
                  type="checkbox"
                  checked={gdpr}
                  onChange={(e) => setGdpr(e.target.checked)}
                  style={{ marginTop: 2, width: 18, height: 18, accentColor: ACCENT }}
                />
                <span>
                  I agree to share my details with {ownerName} and to them being processed under the{' '}
                  <a href="/privacy" target="_blank" rel="noopener noreferrer" style={{ color: ACCENT }}>
                    Privacy Policy
                  </a>
                  .
                </span>
              </label>

              {error ? (
                <p style={{ color: '#ef4444', fontSize: 13, margin: 0 }} role="alert">
                  {error}
                </p>
              ) : null}

              <button
                type="submit"
                disabled={submitting}
                className="interactive-primary"
                style={{
                  minHeight: 52,
                  borderRadius: 13,
                  border: 'none',
                  background: ACCENT,
                  color: '#1a1205',
                  fontWeight: 600,
                  fontSize: 15,
                  cursor: submitting ? 'wait' : 'pointer',
                  opacity: submitting ? 0.7 : 1,
                }}
              >
                {submitting ? 'Sending…' : 'Send my details'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  )
}
