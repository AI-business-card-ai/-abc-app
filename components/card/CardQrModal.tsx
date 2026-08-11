'use client'

import { useEffect, useState } from 'react'
import { CARD_PUBLIC_BASE } from '@/lib/card/types'

type Props = {
  slug: string
  open: boolean
  onClose: () => void
}

export default function CardQrModal({ slug, open, onClose }: Props) {
  const [copied, setCopied] = useState(false)
  const cardUrl = `${CARD_PUBLIC_BASE}/${slug}?src=qr`
  const qrSrc = slug ? `/api/card/qr/${encodeURIComponent(slug)}?size=512` : ''

  useEffect(() => {
    if (!open) setCopied(false)
  }, [open])

  if (!open || !slug) return null

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(cardUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('[CardQrModal] copy failed:', err)
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 210,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0,0,0,0.7)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 400,
          background: '#1a1a1a',
          border: '1px solid #2a2a2a',
          borderRadius: 16,
          padding: 24,
          textAlign: 'center',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
          <h2 style={{ margin: 0, color: '#fff', fontSize: 18, fontWeight: 800 }}>QR kód</h2>
          <button
            type="button"
            onClick={onClose}
            style={{ border: 'none', background: 'transparent', color: '#999', fontSize: 22, cursor: 'pointer' }}
          >
            ×
          </button>
        </div>

        <div
          style={{
            background: '#fff',
            borderRadius: 16,
            padding: 16,
            display: 'inline-block',
            lineHeight: 0,
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qrSrc} alt="QR kód vizitky" width={240} height={240} style={{ display: 'block' }} />
        </div>

        <p style={{ color: '#999', fontSize: 13, margin: '14px 0 18px', lineHeight: 1.4 }}>
          Vytiskni na roll-up nebo jmenovku na veletrh
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <a
            href={`/api/card/qr/${encodeURIComponent(slug)}?size=512`}
            download={`${slug}-qr.png`}
            className="interactive"
            style={{
              padding: 12,
              borderRadius: 10,
              border: '1px solid rgba(0,212,212,0.4)',
              background: 'rgba(0,212,212,0.1)',
              color: '#00d4d4',
              fontWeight: 700,
              textDecoration: 'none',
              fontSize: 14,
            }}
          >
            Stáhnout PNG
          </a>
          <a
            href={`/api/card/qr/${encodeURIComponent(slug)}?size=2048`}
            download={`${slug}-qr-print.png`}
            className="interactive"
            style={{
              padding: 12,
              borderRadius: 10,
              border: '1px solid #2a2a2a',
              background: '#242424',
              color: '#fff',
              fontWeight: 700,
              textDecoration: 'none',
              fontSize: 14,
            }}
          >
            Stáhnout pro tisk 2048px
          </a>
          <button
            type="button"
            onClick={() => void copyLink()}
            className="interactive"
            style={{
              padding: 12,
              borderRadius: 10,
              border: 'none',
              background: 'linear-gradient(135deg,#f0197d,#00d4d4)',
              color: '#fff',
              fontWeight: 700,
              fontSize: 14,
              cursor: 'pointer',
            }}
          >
            {copied ? '✓ Zkopírováno' : 'Kopírovat odkaz'}
          </button>
        </div>
      </div>
    </div>
  )
}
