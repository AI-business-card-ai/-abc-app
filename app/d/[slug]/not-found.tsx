import Link from 'next/link'

export default function CardNotFound() {
  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#0f0f0f',
        color: '#fff',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        fontFamily: 'system-ui, -apple-system, sans-serif',
        textAlign: 'center',
      }}
    >
      <p style={{ fontSize: 14, color: '#00d4d4', fontWeight: 700, marginBottom: 8 }}>ABC</p>
      <h1 style={{ fontSize: 22, fontWeight: 800, margin: '0 0 8px' }}>Karta nenalezena</h1>
      <p style={{ color: '#999', fontSize: 14, margin: '0 0 24px' }}>
        Tato digitální vizitka neexistuje nebo není veřejná.
      </p>
      <Link
        href="https://abccard.io"
        style={{
          padding: '12px 20px',
          borderRadius: 12,
          background: 'linear-gradient(135deg,#f0197d,#00d4d4)',
          color: '#fff',
          fontWeight: 700,
          textDecoration: 'none',
        }}
      >
        Vytvoř si svou vizitku →
      </Link>
    </div>
  )
}
