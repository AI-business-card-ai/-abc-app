'use client'

export default function ProfileError({ error }: { error: Error }) {
  return (
    <div style={{ padding: '40px', color: '#f0197d', background: '#0d0f1a', minHeight: '100vh' }}>
      <h2>Profile Error</h2>
      <pre style={{ fontSize: '12px', marginTop: '16px' }}>{error.message}</pre>
    </div>
  )
}
