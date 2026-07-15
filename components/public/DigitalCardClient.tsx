'use client'

import { useState } from 'react'
import { IconBrandLinkedin, IconMail, IconPhone } from '@tabler/icons-react'
import { buildVCard, downloadVcard } from '@/lib/vcard'

export type PublicCardProfile = {
  userId: string
  full_name: string | null
  company: string | null
  role: string | null
  email: string | null
  phone: string | null
  linkedin_url: string | null
  about?: string | null
}

function initials(name: string | null): string {
  const parts = (name || 'ABC').trim().split(/\s+/).filter(Boolean)
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  return (parts[0]?.slice(0, 2) || 'AB').toUpperCase()
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
  padding: '14px 24px',
  fontWeight: 700,
  fontSize: 15,
  cursor: 'pointer',
  width: '100%',
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: '#1a1a1a',
  border: '1px solid #2a2a2a',
  borderRadius: 10,
  padding: '12px 14px',
  color: '#f0f0f0',
  fontSize: 15,
  outline: 'none',
}

export default function DigitalCardClient({ profile }: { profile: PublicCardProfile }) {
  const [name, setName] = useState('')
  const [company, setCompany] = useState('')
  const [role, setRole] = useState('')
  const [context, setContext] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitSuccess, setSubmitSuccess] = useState(false)

  const displayName = profile.full_name?.trim() || 'ABC User'
  const subtitle = [profile.role, profile.company].filter(Boolean).join(' · ')

  function handleSaveContact() {
    const vcard = buildVCard({
      name: displayName,
      company: profile.company,
      role: profile.role,
      email: profile.email,
      phone: profile.phone,
      linkedin_url: profile.linkedin_url,
    })
    const filename =
      `${displayName.replace(/[^\w\s-]/g, '').trim() || 'contact'}.vcf`
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
    <div style={{ maxWidth: 420, margin: '0 auto', padding: '40px 24px 60px' }}>
      <div style={{ textAlign: 'center', marginBottom: 32 }}>
        <div
          style={{
            width: 116,
            height: 116,
            borderRadius: '50%',
            margin: '0 auto 20px',
            padding: 4,
            background: 'linear-gradient(135deg,#f0197d,#00d4d4)',
            boxShadow: '0 0 32px rgba(0,212,212,0.25), 0 0 48px rgba(240,25,125,0.15)',
          }}
        >
          <div
            style={{
              width: '100%',
              height: '100%',
              borderRadius: '50%',
              background: '#0f0f0f',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <span
              style={{
                ...gradientText,
                fontSize: 36,
                fontWeight: 800,
              }}
            >
              {initials(profile.full_name)}
            </span>
          </div>
        </div>
        <h1 style={{ ...gradientText, fontSize: 28, fontWeight: 900, margin: '0 0 8px' }}>
          {displayName}
        </h1>
        {subtitle ? (
          <p style={{ color: '#9ca3af', fontSize: 15, margin: 0 }}>{subtitle}</p>
        ) : null}
        {profile.about ? (
          <p style={{ color: '#6b7280', fontSize: 14, lineHeight: 1.6, margin: '14px 0 0' }}>
            {profile.about}
          </p>
        ) : null}
      </div>

      <div style={{ display: 'flex', justifyContent: 'center', gap: 16, marginBottom: 28 }}>
        {profile.email ? (
          <a
            href={`mailto:${profile.email}`}
            aria-label="Email"
            style={{ color: '#00d4d4', padding: 10 }}
          >
            <IconMail size={24} />
          </a>
        ) : null}
        {profile.phone ? (
          <a
            href={`tel:${profile.phone}`}
            aria-label="Phone"
            style={{ color: '#00d4d4', padding: 10 }}
          >
            <IconPhone size={24} />
          </a>
        ) : null}
        {profile.linkedin_url ? (
          <a
            href={profile.linkedin_url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="LinkedIn"
            style={{ color: '#00d4d4', padding: 10 }}
          >
            <IconBrandLinkedin size={24} />
          </a>
        ) : null}
      </div>

      <button type="button" onClick={handleSaveContact} style={{ ...gradientBtn, marginBottom: 40 }}>
        💾 Save Contact
      </button>

      <div
        style={{
          background: '#1a1a1a',
          border: '1px solid #2a2a2a',
          borderRadius: 16,
          padding: 24,
        }}
      >
        <h2 style={{ color: '#fff', fontSize: 17, fontWeight: 700, margin: '0 0 20px' }}>
          Leave your info so {displayName.split(' ')[0]} can follow up
        </h2>

        {submitSuccess ? (
          <p style={{ color: '#00d4d4', fontSize: 15, lineHeight: 1.6, margin: 0 }}>
            Thanks! Your info was sent. {displayName.split(' ')[0]} will be in touch.
          </p>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label style={{ display: 'block', color: '#9ca3af', fontSize: 13, marginBottom: 6 }}>
                Your name *
              </label>
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
              <label style={{ display: 'block', color: '#9ca3af', fontSize: 13, marginBottom: 6 }}>
                Company
              </label>
              <input
                type="text"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                style={inputStyle}
                placeholder="Acme Inc."
              />
            </div>
            <div>
              <label style={{ display: 'block', color: '#9ca3af', fontSize: 13, marginBottom: 6 }}>
                Role / title
              </label>
              <input
                type="text"
                value={role}
                onChange={(e) => setRole(e.target.value)}
                style={inputStyle}
                placeholder="Head of Sales"
              />
            </div>
            <div>
              <label style={{ display: 'block', color: '#9ca3af', fontSize: 13, marginBottom: 6 }}>
                Where you met / context
              </label>
              <textarea
                value={context}
                onChange={(e) => setContext(e.target.value)}
                rows={3}
                style={{ ...inputStyle, resize: 'vertical', minHeight: 80 }}
                placeholder="Met at SaaStr London, talked about outbound..."
              />
            </div>
            {submitError ? (
              <p style={{ color: '#f0197d', fontSize: 13, margin: 0 }}>{submitError}</p>
            ) : null}
            <button type="submit" disabled={submitting} style={gradientBtn}>
              {submitting ? 'Sending…' : 'Send my info'}
            </button>
          </form>
        )}
      </div>

      <div
        style={{
          marginTop: 32,
          padding: '24px 20px',
          borderTop: '1px solid #2a2a2a',
          textAlign: 'center',
        }}
      >
        <p style={{ color: '#4b5563', fontSize: 12, margin: '0 0 12px' }}>
          Powered by{' '}
          <a href="/" style={{ ...gradientText, textDecoration: 'none', fontWeight: 700 }}>
            ABC
          </a>{' '}
          — AI Business Card
        </p>
        <a
          href={`/login?connect=${profile.userId}`}
          style={{
            display: 'inline-block',
            padding: '11px 28px',
            borderRadius: 10,
            border: '1px solid rgba(0,212,212,0.4)',
            background: 'rgba(0,212,212,0.08)',
            color: '#00d4d4',
            fontWeight: 700,
            fontSize: 14,
            textDecoration: 'none',
          }}
        >
          Join ABC free
        </a>
      </div>
    </div>
  )
}
