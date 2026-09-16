'use client'

import { useEffect } from 'react'
import Link from 'next/link'

/**
 * The last line before a blank screen.
 *
 * Settings and Profile have boundaries of their own; everywhere else an error
 * thrown while rendering used to fall through to Next's unstyled default, which
 * on a phone reads as the app having broken. This keeps the app's chrome, says
 * what happened in words of ours, and offers the two things that help: try the
 * same screen again, or go home. The error itself is never shown — its message
 * can quote anything — and only its digest reaches the console.
 */
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('[app] render failed:', error.digest ?? error.name)
  }, [error])

  return (
    <div className="mx-auto w-full max-w-[560px] abc-page-top px-4 pb-12 text-center">
      <p className="text-[15px] font-semibold text-abc-text">This screen could not be opened</p>
      <p className="mt-1.5 text-[13px] leading-[1.5] text-abc-secondary">
        Something went wrong while loading it. Try again, or go back to your home screen.
      </p>
      <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
        <button
          type="button"
          onClick={reset}
          className="inline-flex h-[48px] items-center justify-center rounded-btn bg-abc-gold px-5 text-[15px] font-semibold text-[#1a1205] transition-[filter] hover:brightness-[1.06] abc-focus-ring"
        >
          Try again
        </button>
        <Link
          href="/home"
          className="inline-flex h-[48px] items-center justify-center rounded-btn border border-abc-border bg-abc-raised px-5 text-[15px] font-medium text-abc-text transition-colors hover:border-abc-border-strong abc-focus-ring"
        >
          Go home
        </Link>
      </div>
    </div>
  )
}
