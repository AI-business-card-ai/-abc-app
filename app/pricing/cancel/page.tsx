'use client'

import Link from 'next/link'

const COLORS = {
  bg: '#0f0f0f',
  cyan: '#00d4d4',
  text: '#ffffff',
  muted: '#999999',
}

export default function PricingCancelPage() {
  return (
    <div
      style={{
        minHeight: '100vh',
        background: COLORS.bg,
        color: COLORS.text,
        fontFamily: 'system-ui, -apple-system, sans-serif',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px 20px',
      }}
    >
      <div style={{ maxWidth: 420, width: '100%', textAlign: 'center' }}>
        <h1 style={{ fontSize: 28, fontWeight: 800, margin: '0 0 12px' }}>
          No problem
        </h1>
        <p style={{ color: COLORS.muted, marginBottom: 32, fontSize: 16 }}>
          You can upgrade anytime.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Link
            href="/pricing"
            style={{
              display: 'block',
              padding: '14px 20px',
              borderRadius: 12,
              fontWeight: 700,
              fontSize: 15,
              textDecoration: 'none',
              background: 'linear-gradient(135deg, #f0197d, #00d4d4)',
              color: '#ffffff',
            }}
          >
            Back to plans
          </Link>
          <Link
            href="/scan"
            style={{
              display: 'block',
              padding: '14px 20px',
              borderRadius: 12,
              fontWeight: 600,
              fontSize: 14,
              textDecoration: 'none',
              background: '#1a1a1a',
              border: '1px solid #2a2a2a',
              color: COLORS.cyan,
            }}
          >
            Continue scanning
          </Link>
        </div>
      </div>
    </div>
  )
}
