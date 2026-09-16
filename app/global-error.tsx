'use client'

import { useEffect } from 'react'

/**
 * When the root layout itself fails, app/error.tsx cannot help: it renders
 * inside that layout. This replaces the whole document, so it carries its own
 * <html> and <body> and inline styles — the stylesheet may be what failed.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('[app] root layout failed:', error.digest ?? error.name)
  }, [error])

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#0a0a0b',
          color: '#f5f5f4',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          textAlign: 'center',
          padding: 'max(24px, env(safe-area-inset-top)) 24px max(24px, env(safe-area-inset-bottom))',
        }}
      >
        <main>
          <p style={{ fontSize: 17, fontWeight: 600, margin: '0 0 8px' }}>ABC could not be opened</p>
          <p style={{ fontSize: 14, color: '#a8a29e', margin: '0 0 20px' }}>Something went wrong. Try again.</p>
          <button
            type="button"
            onClick={reset}
            style={{ height: 48, padding: '0 20px', borderRadius: 12, border: 0, background: '#d9a441', color: '#1a1205', fontSize: 15, fontWeight: 600 }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  )
}
