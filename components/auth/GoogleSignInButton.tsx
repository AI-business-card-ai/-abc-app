'use client'

import { useState } from 'react'
import { createClientComponent } from '@/lib/supabase'
import { signInWithGoogle } from '@/lib/google-oauth'

type Props = {
  nextPath?: string
  label?: string
  variant?: 'primary' | 'default'
  connectUserId?: string
}

/**
 * Sign in with Google.
 *
 * Identity only — `signInWithGoogle` no longer asks for the mailbox, so the
 * consent screen here says who you are and nothing about sending mail.
 *
 * The four colours in the mark are Google's own and stay exactly as they are;
 * a brand mark is not ours to restyle. Everything around them used to be
 * cyan-and-magenta from an earlier palette, which is ABC's chrome rather than
 * Google's, and now matches the rest of the app.
 */
export default function GoogleSignInButton({
  nextPath = '/dashboard',
  label = 'Continue with Google',
  variant = 'default',
  connectUserId,
}: Props) {
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)
  const isPrimary = variant === 'primary'

  async function handleClick() {
    setLoading(true)
    setFailed(false)
    try {
      const supabase = createClientComponent()
      const { error } = await signInWithGoogle(supabase, nextPath, connectUserId)
      if (error) {
        // The provider's own wording is for the log, not the screen.
        console.error('[auth] google sign-in failed:', error.message)
        setFailed(true)
        setLoading(false)
        return
      }
      /*
        On success the browser is already leaving for Google. Deliberately not
        clearing `loading` here: doing it in a `finally` re-enabled the button
        mid-redirect, so it looked ready to press again while the page was on
        its way out.
      */
    } catch (err) {
      console.error('[auth] google sign-in failed:', err)
      setFailed(true)
      setLoading(false)
    }
  }

  return (
    <div className="flex w-full flex-col gap-2">
      <button
        type="button"
        onClick={handleClick}
        disabled={loading}
        className={`flex w-full items-center justify-center gap-3 rounded-btn border border-abc-border bg-abc-raised font-semibold text-abc-text transition-colors duration-200 ease-abc hover:border-abc-border-strong disabled:opacity-60 abc-focus-ring ${
          isPrimary ? 'px-5 py-4 text-base' : 'px-4 py-3 text-sm'
        }`}
      >
        <svg width={isPrimary ? 22 : 18} height={isPrimary ? 22 : 18} viewBox="0 0 48 48" aria-hidden="true">
          <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
          <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.56 2.95-2.23 5.45-4.76 7.11l7.73 6.01c4.51-4.16 7.11-10.28 7.11-17.59z" />
          <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
          <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6.01c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
        </svg>
        {loading ? 'Redirecting…' : label}
      </button>

      {failed ? (
        <p className="text-center text-[12.5px]" style={{ color: 'var(--abc-overdue)' }} role="alert">
          Could not start Google sign-in. Try again, or use your email below.
        </p>
      ) : null}
    </div>
  )
}
