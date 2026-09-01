export default function CardNotFound() {
  return (
    <div
      style={{
        background: '#0f0f0f',
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      <div style={{ textAlign: 'center', maxWidth: 360 }}>
        <p
          style={{
            fontSize: 22,
            fontWeight: 800,
            background: 'var(--accent-gradient)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            marginBottom: 8,
          }}
        >
          Card not found
        </p>
        <p style={{ color: '#9ca3af', fontSize: 15 }}>
          This digital business card does not exist or is no longer available.
        </p>
      </div>
    </div>
  )
}
