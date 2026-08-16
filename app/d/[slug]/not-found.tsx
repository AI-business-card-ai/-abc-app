import Link from 'next/link'

export default function CardNotFound() {
  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#0a0a0b',
        color: '#ffffff',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        fontFamily:
          'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
        textAlign: 'center',
      }}
    >
      <p
        style={{
          fontSize: 10.5,
          fontWeight: 700,
          letterSpacing: '0.18em',
          textTransform: 'uppercase',
          color: '#71717a',
          marginBottom: 14,
        }}
      >
        ABC Card
      </p>
      <h1 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 8px', letterSpacing: '-0.02em' }}>
        Card not found
      </h1>
      <p style={{ color: '#a1a1aa', fontSize: 14, lineHeight: 1.55, margin: '0 0 24px', maxWidth: 320 }}>
        This card does not exist, or its owner has not published it yet.
      </p>
      <Link
        href="https://abccard.io"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: 48,
          padding: '0 22px',
          borderRadius: 13,
          background: '#d9a441',
          color: '#1a1205',
          fontWeight: 600,
          fontSize: 15,
          textDecoration: 'none',
        }}
      >
        Create your own card
      </Link>
    </div>
  )
}
