'use client'

import { useState } from 'react'
import { createClientComponent } from '@/lib/supabase'
import { signInWithApple } from '@/lib/apple-oauth'

type Props = {
  nextPath?: string
  label?: string
  variant?: 'primary' | 'default'
  connectUserId?: string
}

/**
 * Continue with Apple.
 *
 * Deliberately the same shape as the Google button: one component used by both
 * the login and register screens, the same surface treatment, the same failure
 * behaviour. Two sign-in buttons that behave differently would be two things to
 * keep in step, and the difference would show up as inconsistency on the one
 * screen where a stranger is deciding whether to trust the product.
 *
 * The mark is Apple's own glyph in plain white, which is what their guidelines
 * ask for on a dark button. Everything around it is the app's own palette.
 */
export default function AppleSignInButton({
  nextPath = '/dashboard',
  label = 'Continue with Apple',
  variant = 'default',
  connectUserId,
}: Props) {
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)
  const isPrimary = variant === 'primary'

  async function handleClick() {
    // A second press while the first redirect is in flight starts a second
    // OAuth flow, and the two race over the same PKCE cookie.
    if (loading) return

    setLoading(true)
    setFailed(false)
    try {
      const supabase = createClientComponent()
      const { error } = await signInWithApple(supabase, nextPath, connectUserId)
      if (error) {
        /*
          Apple's wording, and Supabase's, stay in the log. "Provider is not
          enabled" is the likely one until the Apple provider is switched on,
          and it is not something to put in front of somebody trying to sign in.
        */
        console.error('[auth] apple sign-in failed:', error.message)
        setFailed(true)
        setLoading(false)
        return
      }
      /*
        On success the browser is already leaving for Apple. `loading` stays set
        deliberately — clearing it in a `finally` re-enabled the button
        mid-redirect, so it looked ready to press again while the page was on
        its way out.
      */
    } catch (err) {
      console.error('[auth] apple sign-in failed:', err)
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
        <svg
          width={isPrimary ? 22 : 18}
          height={isPrimary ? 22 : 18}
          viewBox="0 0 24 24"
          fill="currentColor"
          aria-hidden="true"
        >
          <path d="M17.05 12.66c-.02-2.2 1.8-3.26 1.88-3.31-1.02-1.5-2.61-1.7-3.18-1.73-1.35-.14-2.64.8-3.33.8-.69 0-1.75-.78-2.87-.76-1.48.02-2.84.86-3.6 2.18-1.53 2.66-.39 6.6 1.1 8.76.73 1.06 1.6 2.25 2.75 2.2 1.1-.04 1.52-.71 2.85-.71 1.33 0 1.71.71 2.87.69 1.19-.02 1.94-1.08 2.66-2.14.84-1.23 1.19-2.42 1.21-2.48-.03-.01-2.32-.89-2.34-3.5zM14.9 5.5c.61-.74 1.02-1.77.91-2.8-.88.04-1.94.59-2.57 1.32-.56.65-1.05 1.7-.92 2.7.98.08 1.98-.5 2.58-1.22z" />
        </svg>
        {loading ? 'Redirecting…' : label}
      </button>

      {failed ? (
        <p className="text-center text-[12.5px]" style={{ color: 'var(--abc-overdue)' }} role="alert">
          Could not start Apple sign-in. Try again, or use your email below.
        </p>
      ) : null}
    </div>
  )
}
