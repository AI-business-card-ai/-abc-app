'use client'

import { useEffect, useState } from 'react'
import QRCode from 'qrcode'

const DEMO_URL = 'https://abccard.io/u/martin'

const gradientText = {
  background: 'linear-gradient(90deg, #f0197d, #00d4d4)',
  WebkitBackgroundClip: 'text',
  WebkitTextFillColor: 'transparent',
  backgroundClip: 'text',
} as const

export default function DemoQrCode() {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let active = true

    QRCode.toDataURL(DEMO_URL, {
      width: 200,
      margin: 1,
      color: { dark: '#0f0f0f', light: '#ffffff' },
    })
      .then((dataUrl) => {
        if (active) setQrDataUrl(dataUrl)
      })
      .catch((err) => {
        console.error('[demo-qr] generation failed:', err)
        if (active) setFailed(true)
      })

    return () => { active = false }
  }, [])

  return (
    <div
      style={{
        width: 240,
        borderRadius: 32,
        background: 'linear-gradient(145deg, #1c1c1c, #0a0a0a)',
        padding: 8,
        boxShadow: '0 16px 48px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.06)',
        margin: '0 auto',
      }}
    >
      <div
        style={{
          borderRadius: 26,
          background: '#0f0f0f',
          border: '1px solid #2a2a2a',
          padding: '20px 16px',
          textAlign: 'center',
        }}
      >
        <p style={{ margin: '0 0 12px', fontSize: 13, fontWeight: 800, ...gradientText }}>
          My Digital Card
        </p>
        <div
          style={{
            background: '#ffffff',
            borderRadius: 14,
            padding: 12,
            display: 'inline-block',
            lineHeight: 0,
          }}
        >
          {qrDataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={qrDataUrl}
              alt="QR code for abccard.io/u/martin"
              width={140}
              height={140}
              style={{ display: 'block', borderRadius: 4 }}
            />
          ) : failed ? (
            <div
              style={{
                width: 140,
                height: 140,
                borderRadius: 4,
                background: 'linear-gradient(135deg, #f0197d, #00d4d4)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 28,
                fontWeight: 900,
                color: '#fff',
              }}
            >
              QR
            </div>
          ) : (
            <div
              style={{
                width: 140,
                height: 140,
                borderRadius: 4,
                background: '#f3f4f6',
              }}
            />
          )}
        </div>
        <p style={{ margin: '12px 0 0', fontSize: 10, color: '#9ca3af' }}>
          abccard.io/u/martin
        </p>
      </div>
    </div>
  )
}
