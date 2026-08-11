'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { createClientComponent } from '@/lib/supabase'
import { CARD_PUBLIC_BASE } from '@/lib/card/types'
import CardQrModal from '@/components/card/CardQrModal'

export default function DigitalCardQrSection() {
  const supabase = useMemo(() => createClientComponent(), [])
  const [cardUrl, setCardUrl] = useState<string | null>(null)
  const [slug, setSlug] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [qrOpen, setQrOpen] = useState(false)

  useEffect(() => {
    let active = true

    const load = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user || !active) return

      const { data: profileRow } = await supabase
        .from('abc_profiles')
        .select('card_slug, user_name, card_published')
        .eq('id', user.id)
        .maybeSingle()
      if (!active) return

      const resolvedSlug = profileRow?.card_slug || profileRow?.user_name || null
      setSlug(resolvedSlug)
      if (resolvedSlug) {
        setCardUrl(`${CARD_PUBLIC_BASE}/${resolvedSlug}`)
      } else {
        setCardUrl(`${CARD_PUBLIC_BASE}/…`)
      }
    }

    void load()
    return () => {
      active = false
    }
  }, [supabase])

  if (!cardUrl) return null

  async function copyLink() {
    if (!slug) return
    try {
      await navigator.clipboard.writeText(`${CARD_PUBLIC_BASE}/${slug}`)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('[digital-card-qr] copy failed:', err)
    }
  }

  return (
    <div
      style={{
        background: '#1a1a1a',
        borderRadius: '12px',
        border: '1px solid #2a2a2a',
        padding: '20px',
        marginBottom: '16px',
      }}
    >
      <div
        style={{
          fontSize: '11px',
          letterSpacing: '0.08em',
          marginBottom: '4px',
          fontWeight: 700,
          background: 'linear-gradient(90deg,#f0197d,#00d4d4)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
        }}
      >
        MOJE VIZITKA
      </div>
      <div style={{ fontSize: '12px', color: '#555555', marginBottom: '16px' }}>
        Digitální vizitka, QR a exchange kontaktů
      </div>

      <div
        style={{
          background: '#242424',
          border: '1px solid #2a2a2a',
          borderRadius: '8px',
          padding: '10px 14px',
          marginBottom: '12px',
          color: '#9ca3af',
          fontSize: '12px',
          wordBreak: 'break-all',
          textAlign: 'center',
        }}
      >
        {cardUrl}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
        <button
          type="button"
          onClick={() => void copyLink()}
          disabled={!slug}
          style={{
            padding: '12px',
            borderRadius: '10px',
            border: '1px solid rgba(0, 212, 212, 0.4)',
            background: 'rgba(0, 212, 212, 0.1)',
            color: '#00d4d4',
            fontWeight: 700,
            fontSize: '14px',
            cursor: slug ? 'pointer' : 'not-allowed',
            opacity: slug ? 1 : 0.5,
          }}
        >
          {copied ? '✓ Copied!' : 'Copy Link'}
        </button>
        <button
          type="button"
          onClick={() => setQrOpen(true)}
          disabled={!slug}
          style={{
            padding: '12px',
            borderRadius: '10px',
            border: 'none',
            background: slug ? 'linear-gradient(135deg,#f0197d,#00d4d4)' : '#2a2a2a',
            color: '#ffffff',
            fontWeight: 700,
            fontSize: '14px',
            cursor: slug ? 'pointer' : 'not-allowed',
            opacity: slug ? 1 : 0.5,
          }}
        >
          QR kód
        </button>
      </div>

      <Link
        href="/profile/card"
        style={{
          display: 'block',
          width: '100%',
          marginTop: '8px',
          padding: '12px',
          borderRadius: '10px',
          border: '1px solid #2a2a2a',
          background: '#1a1a1a',
          color: '#ffffff',
          fontWeight: 700,
          fontSize: '14px',
          textAlign: 'center',
          textDecoration: 'none',
          boxSizing: 'border-box',
        }}
      >
        Upravit vizitku →
      </Link>

      {slug ? <CardQrModal slug={slug} open={qrOpen} onClose={() => setQrOpen(false)} /> : null}
    </div>
  )
}
