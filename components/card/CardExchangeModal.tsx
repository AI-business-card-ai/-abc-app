'use client'

import { useState } from 'react'

type Props = {
  ownerName: string
  ownerUserId: string
  open: boolean
  onClose: () => void
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  minHeight: 44,
  background: '#242424',
  border: '1px solid #2a2a2a',
  borderRadius: 10,
  padding: '10px 14px',
  color: '#ffffff',
  fontSize: 14,
  outline: 'none',
  boxSizing: 'border-box',
  fontFamily: 'inherit',
}

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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!name.trim() || !email.trim()) {
      setError('Jméno a e-mail jsou povinné.')
      return
    }
    if (!gdpr) {
      setError('Potřebujeme tvůj souhlas se zpracováním údajů.')
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
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Odeslání se nepovedlo.')
      }
      setSuccess(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Odeslání se nepovedlo.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 200,
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
        background: 'rgba(0,0,0,0.65)',
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
          background: '#1a1a1a',
          border: '1px solid #2a2a2a',
          borderRadius: 16,
          padding: 20,
        }}
      >
        {success ? (
          <div style={{ textAlign: 'center', padding: '12px 0' }}>
            <p style={{ color: '#fff', fontSize: 18, fontWeight: 700, margin: '0 0 8px' }}>
              ✓ Hotovo — {ownerName.split(' ')[0]} má tvoje údaje.
            </p>
            <a
              href="https://abccard.io?ref=exchange"
              style={{
                display: 'inline-block',
                marginTop: 16,
                padding: '12px 16px',
                borderRadius: 12,
                background: 'linear-gradient(135deg,#f0197d,#00d4d4)',
                color: '#fff',
                fontWeight: 700,
                textDecoration: 'none',
                fontSize: 14,
              }}
            >
              Chceš taky takovou vizitku? Vytvoř si ji zdarma →
            </a>
            <button
              type="button"
              onClick={onClose}
              style={{
                display: 'block',
                width: '100%',
                marginTop: 12,
                padding: 12,
                borderRadius: 10,
                border: '1px solid #2a2a2a',
                background: 'transparent',
                color: '#999',
                cursor: 'pointer',
              }}
            >
              Zavřít
            </button>
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#fff' }}>
                Poslat vizitku
              </h2>
              <button
                type="button"
                onClick={onClose}
                style={{
                  border: 'none',
                  background: 'transparent',
                  color: '#999',
                  fontSize: 20,
                  cursor: 'pointer',
                }}
              >
                ×
              </button>
            </div>
            <form onSubmit={(e) => void handleSubmit(e)} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
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
              <input style={inputStyle} placeholder="Jméno *" value={name} onChange={(e) => setName(e.target.value)} required />
              <input style={inputStyle} type="email" placeholder="Email *" value={email} onChange={(e) => setEmail(e.target.value)} required />
              <input style={inputStyle} placeholder="Telefon" value={phone} onChange={(e) => setPhone(e.target.value)} />
              <input style={inputStyle} placeholder="Firma" value={company} onChange={(e) => setCompany(e.target.value)} />
              <input style={inputStyle} placeholder="Pozice" value={role} onChange={(e) => setRole(e.target.value)} />
              <textarea
                style={{ ...inputStyle, minHeight: 80, resize: 'vertical' }}
                placeholder="Kde jsme se potkali?"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
              <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 12, color: '#999', lineHeight: 1.4 }}>
                <input
                  type="checkbox"
                  checked={gdpr}
                  onChange={(e) => setGdpr(e.target.checked)}
                  style={{ marginTop: 2 }}
                />
                <span>
                  Souhlasím s předáním svých údajů {ownerName} a zpracováním dle{' '}
                  <a href="/privacy" target="_blank" rel="noopener noreferrer" style={{ color: '#00d4d4' }}>
                    Privacy Policy
                  </a>
                </span>
              </label>
              {error ? <p style={{ color: '#f0197d', fontSize: 13, margin: 0 }}>{error}</p> : null}
              <button
                type="submit"
                disabled={submitting}
                className="interactive-primary"
                style={{
                  minHeight: 48,
                  borderRadius: 12,
                  border: 'none',
                  background: 'linear-gradient(135deg,#f0197d,#00d4d4)',
                  color: '#fff',
                  fontWeight: 700,
                  fontSize: 15,
                  cursor: submitting ? 'wait' : 'pointer',
                  opacity: submitting ? 0.7 : 1,
                }}
              >
                {submitting ? 'Odesílám…' : 'Odeslat vizitku →'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  )
}
