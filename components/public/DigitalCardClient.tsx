'use client'

import { useEffect, useState } from 'react'

export type PublicCardProfile = {
  userId: string
  full_name: string | null
  company: string | null
  role: string | null
  email: string | null
  phone: string | null
  linkedin_url: string | null
  website: string | null
  about?: string | null
}

function initials(name: string | null): string {
  const parts = (name || 'ABC').trim().split(/\s+/).filter(Boolean)
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  return (parts[0]?.slice(0, 2) || 'AB').toUpperCase()
}

function normalizeWebsiteHref(url: string): string {
  return /^https?:\/\//i.test(url) ? url : `https://${url}`
}

const gradientText: React.CSSProperties = {
  background: 'linear-gradient(90deg,#f0197d,#00d4d4)',
  WebkitBackgroundClip: 'text',
  WebkitTextFillColor: 'transparent',
}

const gradientBtn: React.CSSProperties = {
  background: 'linear-gradient(135deg,#f0197d,#00d4d4)',
  color: '#fff',
  border: 'none',
  borderRadius: 12,
  height: 48,
  fontWeight: 700,
  fontSize: 15,
  cursor: 'pointer',
  width: '100%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  height: 44,
  background: '#111111',
  border: '1px solid #2a2a2a',
  borderRadius: 8,
  padding: '0 14px',
  color: '#ffffff',
  fontSize: 14,
  outline: 'none',
  boxSizing: 'border-box',
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  color: '#6b7280',
  fontSize: 12,
  marginBottom: 6,
}

export default function DigitalCardClient({ profile }: { profile: PublicCardProfile }) {
  const [mounted, setMounted] = useState(false)
  const [name, setName] = useState('')
  const [company, setCompany] = useState('')
  const [role, setRole] = useState('')
  const [context, setContext] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitSuccess, setSubmitSuccess] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const displayName = profile.full_name?.trim() || 'ABC User'
  const firstName = displayName.split(' ')[0]
  const subtitle = [profile.role, profile.company].filter(Boolean).join(' · ')

  const actions = [
    profile.email
      ? { key: 'email', label: '📧 Email', href: `mailto:${profile.email}` }
      : null,
    profile.phone
      ? { key: 'phone', label: '📞 Call', href: `tel:${profile.phone}` }
      : null,
    profile.linkedin_url
      ? { key: 'linkedin', label: '💼 LinkedIn', href: profile.linkedin_url, external: true }
      : null,
    profile.website
      ? { key: 'website', label: '🌐 Website', href: normalizeWebsiteHref(profile.website), external: true }
      : null,
  ].filter(Boolean) as { key: string; label: string; href: string; external?: boolean }[]

  async function handleSaveContact() {
    const { buildVCard, downloadVcard } = await import('@/lib/vcard')
    const vcard = buildVCard({
      name: displayName,
      company: profile.company,
      role: profile.role,
      email: profile.email,
      phone: profile.phone,
      linkedin_url: profile.linkedin_url,
    })
    const filename = `${displayName.replace(/[^\w\s-]/g, '').trim() || 'contact'}.vcf`
    downloadVcard(vcard, filename)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitError(null)

    const trimmedName = name.trim()
    if (!trimmedName) {
      setSubmitError('Please enter your name.')
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch('/api/card/reverse-lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: profile.userId,
          name: trimmedName,
          company: company.trim() || undefined,
          role: role.trim() || undefined,
          context: context.trim() || undefined,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Something went wrong. Please try again.')
      }
      setSubmitSuccess(true)
      setName('')
      setCompany('')
      setRole('')
      setContext('')
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      style={{
        maxWidth: 420,
        margin: '0 auto',
        minHeight: '100vh',
        background: '#0a0a0a',
        overflowX: 'hidden',
        opacity: mounted ? 1 : 0,
        transition: 'opacity 0.3s ease',
      }}
    >
      {/* HEADER */}
      <div
        style={{
          position: 'relative',
          padding: '48px 24px 28px',
          textAlign: 'center',
          overflow: 'hidden',
        }}
      >
        <div
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            background: 'radial-gradient(circle at 50% 30%, rgba(240,25,125,0.08), transparent 60%)',
            pointerEvents: 'none',
          }}
        />
        <div
          style={{
            position: 'relative',
            width: 80,
            height: 80,
            borderRadius: '50%',
            margin: '0 auto 18px',
            padding: 2,
            background: 'linear-gradient(135deg,#f0197d,#00d4d4)',
          }}
        >
          <div
            style={{
              width: '100%',
              height: '100%',
              borderRadius: '50%',
              background: '#0a0a0a',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <span style={{ color: '#ffffff', fontSize: 26, fontWeight: 700 }}>
              {initials(profile.full_name)}
            </span>
          </div>
        </div>
        <h1
          style={{
            position: 'relative',
            color: '#ffffff',
            fontSize: 22,
            fontWeight: 700,
            letterSpacing: '-0.02em',
            margin: '0 0 6px',
          }}
        >
          {displayName}
        </h1>
        {subtitle ? (
          <p style={{ position: 'relative', color: '#6b7280', fontSize: 14, margin: 0 }}>
            {subtitle}
          </p>
        ) : null}
        {profile.about ? (
          <p
            style={{
              position: 'relative',
              color: '#9ca3af',
              fontSize: 13,
              fontStyle: 'italic',
              lineHeight: 1.5,
              margin: '8px 0 0',
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
          >
            {profile.about}
          </p>
        ) : null}
      </div>

      <div
        style={{
          height: 1,
          margin: '0 24px',
          background: 'linear-gradient(90deg,#f0197d,#00d4d4)',
          opacity: 0.4,
        }}
      />

      <div style={{ padding: '28px 24px 60px' }}>
        {/* CONTACT ACTIONS */}
        {actions.length > 0 ? (
          <div
            style={{
              display: 'flex',
              gap: 10,
              overflowX: 'auto',
              paddingBottom: 4,
              marginBottom: 24,
              scrollbarWidth: 'none',
            }}
          >
            {actions.map((a) => (
              <a
                key={a.key}
                href={a.href}
                target={a.external ? '_blank' : undefined}
                rel={a.external ? 'noopener noreferrer' : undefined}
                style={{
                  flexShrink: 0,
                  height: 36,
                  padding: '0 16px',
                  borderRadius: 999,
                  background: '#1a1a1a',
                  border: '1px solid #2a2a2a',
                  color: '#ffffff',
                  fontSize: 13,
                  fontWeight: 600,
                  textDecoration: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  whiteSpace: 'nowrap',
                }}
              >
                {a.label}
              </a>
            ))}
          </div>
        ) : null}

        {/* SAVE CONTACT */}
        <button type="button" onClick={() => void handleSaveContact()} style={gradientBtn}>
          💾 Save to Contacts
        </button>
        <p style={{ color: '#6b7280', fontSize: 11, textAlign: 'center', margin: '8px 0 32px' }}>
          Saves directly to your phone&apos;s contacts
        </p>

        {/* DIVIDER */}
        <p style={{ color: '#4b5563', fontSize: 11, textAlign: 'center', margin: '0 0 20px' }}>
          — or leave your contact —
        </p>

        {/* REVERSE LEAD FORM */}
        {submitSuccess ? (
          <div style={{ textAlign: 'center', padding: '24px 0' }}>
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: '50%',
                background: 'rgba(34,197,94,0.12)',
                border: '1px solid rgba(34,197,94,0.4)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 14px',
                fontSize: 20,
                color: '#22c55e',
              }}
            >
              ✓
            </div>
            <p style={{ color: '#ffffff', fontSize: 15, fontWeight: 600, margin: 0 }}>
              Sent! {firstName} will be in touch.
            </p>
          </div>
        ) : (
          <div>
            <h2 style={{ color: '#ffffff', fontSize: 15, fontWeight: 600, margin: '0 0 16px' }}>
              Let {firstName} know who you are
            </h2>
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={labelStyle}>Your name *</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  style={inputStyle}
                  placeholder="Jane Smith"
                />
              </div>
              <div>
                <label style={labelStyle}>Your company</label>
                <input
                  type="text"
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  style={inputStyle}
                  placeholder="Acme Inc."
                />
              </div>
              <div>
                <label style={labelStyle}>Your role</label>
                <input
                  type="text"
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  style={inputStyle}
                  placeholder="Head of Sales"
                />
              </div>
              <div>
                <label style={labelStyle}>Where did you meet? / context</label>
                <textarea
                  value={context}
                  onChange={(e) => setContext(e.target.value)}
                  rows={3}
                  style={{ ...inputStyle, height: 'auto', padding: '10px 14px', resize: 'vertical' }}
                  placeholder="Met at SaaStr London, talked about outbound..."
                />
              </div>
              {submitError ? (
                <p style={{ color: '#f0197d', fontSize: 13, margin: 0 }}>{submitError}</p>
              ) : null}
              <button type="submit" disabled={submitting} style={{ ...gradientBtn, opacity: submitting ? 0.7 : 1 }}>
                {submitting ? 'Sending…' : 'Send my contact →'}
              </button>
            </form>
          </div>
        )}
      </div>

      {/* FOOTER */}
      <div
        style={{
          padding: '20px 24px 32px',
          borderTop: '1px solid #1f1f1f',
          textAlign: 'center',
        }}
      >
        <p style={{ color: '#4b5563', fontSize: 11, margin: '0 0 10px' }}>
          <span style={{ ...gradientText, fontWeight: 800 }}>ABC</span> · Powered by abccard.io
        </p>
        <a
          href={`/login?connect=${profile.userId}`}
          style={{ color: '#4b5563', fontSize: 11, textDecoration: 'none' }}
        >
          Get your free digital card →
        </a>
      </div>
    </div>
  )
}
