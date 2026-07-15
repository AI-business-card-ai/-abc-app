'use client'

import { useEffect, useMemo, useState } from 'react'
import QRCode from 'qrcode'
import { createClientComponent } from '@/lib/supabase'

const CARD_BASE_URL = 'https://abccard.io/card'

export default function DigitalCardQrSection() {
  const supabase = useMemo(() => createClientComponent(), [])
  const [cardUrl, setCardUrl] = useState<string | null>(null)
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    let active = true

    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user || !active) return

      const url = `${CARD_BASE_URL}/${user.id}`
      setCardUrl(url)

      try {
        const dataUrl = await QRCode.toDataURL(url, {
          width: 480,
          margin: 2,
          color: { dark: '#0f0f0f', light: '#ffffff' },
        })
        if (active) setQrDataUrl(dataUrl)
      } catch (err) {
        console.error('[digital-card-qr] QR generation failed:', err)
      }
    }

    void load()
    return () => { active = false }
  }, [supabase])

  if (!cardUrl) return null

  async function copyLink() {
    if (!cardUrl) return
    try {
      await navigator.clipboard.writeText(cardUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('[digital-card-qr] copy failed:', err)
    }
  }

  async function shareLink() {
    if (!cardUrl) return
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'My ABC Digital Business Card',
          url: cardUrl,
        })
        return
      } catch (err) {
        // User cancelled or share failed — fall through to copy
        if (err instanceof Error && err.name === 'AbortError') return
      }
    }
    await copyLink()
  }

  return (
    <div style={{ background: '#1a1a1a', borderRadius: '12px', border: '1px solid #2a2a2a', padding: '20px', marginBottom: '16px' }}>
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
        MY DIGITAL CARD
      </div>
      <div style={{ fontSize: '12px', color: '#555555', marginBottom: '16px' }}>
        Let others scan this QR code to save your contact and leave theirs
      </div>

      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '16px' }}>
        <div style={{ background: '#ffffff', borderRadius: '16px', padding: '12px', lineHeight: 0 }}>
          {qrDataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qrDataUrl} alt="QR code for your digital business card" style={{ width: 200, height: 200, display: 'block' }} />
          ) : (
            <div style={{ width: 200, height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#999999', fontSize: 12 }}>
              Generating…
            </div>
          )}
        </div>
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
          style={{
            padding: '12px',
            borderRadius: '10px',
            border: '1px solid rgba(0, 212, 212, 0.4)',
            background: 'rgba(0, 212, 212, 0.1)',
            color: '#00d4d4',
            fontWeight: 700,
            fontSize: '14px',
            cursor: 'pointer',
          }}
        >
          {copied ? '✓ Copied!' : 'Copy Link'}
        </button>
        <button
          type="button"
          onClick={() => void shareLink()}
          style={{
            padding: '12px',
            borderRadius: '10px',
            border: 'none',
            background: 'linear-gradient(135deg,#f0197d,#00d4d4)',
            color: '#ffffff',
            fontWeight: 700,
            fontSize: '14px',
            cursor: 'pointer',
          }}
        >
          Share
        </button>
      </div>
    </div>
  )
}
