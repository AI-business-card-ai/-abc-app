'use client'

import { useEffect } from 'react'

export default function SettingsError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[settings]', error)
  }, [error])

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center gap-4 px-6 text-center pb-24"
      style={{ background: '#0d0f1a', color: '#f0f0ff' }}
    >
      <p className="text-lg font-semibold">Settings failed to load</p>
      <p className="text-sm max-w-sm leading-relaxed" style={{ color: '#8892b0' }}>
        {error.message || 'An unexpected error occurred. Your profile data may be incomplete — try again or continue with defaults.'}
      </p>
      <button
        type="button"
        onClick={reset}
        className="glow-btn rounded-xl px-6 py-3 font-semibold min-h-[44px]"
      >
        Reload settings
      </button>
    </div>
  )
}
