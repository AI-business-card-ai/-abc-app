'use client'

import { useState } from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { createClientComponent } from '@/lib/supabase'

/**
 * Ask for a reset link.
 *
 * The answer is the same whether or not the address has an account. Telling a
 * stranger "no account for that email" turns this form into a way to find out
 * who has one, and at a trade fair the addresses being typed in are other
 * people's. Supabase behaves the same way on its side; this screen makes sure
 * the UI does not undo that.
 *
 * The link comes back through the app's existing auth callback, which is the
 * one place that exchanges a code for a session.
 */

/** Said no matter what happened, so nothing about the address is revealed. */
const GENERIC_SENT =
  "If an account exists for that email, we've sent a password reset link. Check your inbox."

export default function ForgotPasswordPage() {
  const supabase = createClientComponent()

  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (loading) return
    setLoading(true)
    setError(null)

    try {
      /*
        Back through /auth/callback, not straight to the reset page: the link
        returns a PKCE code, and the callback is where this app exchanges one.
        `flow=recovery` tells it this is a reset rather than a sign-in, so it
        skips the OAuth bookkeeping and sends the person to the reset screen
        even if their onboarding is unfinished.
      */
      const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(
        '/reset-password'
      )}&flow=recovery`

      const { error: sendError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo,
      })

      /*
        A rate limit is worth saying out loud — it is about this browser, not
        about whether the address exists, and silence would just invite more
        submissions. Everything else resolves to the same sentence as success.
      */
      if (sendError?.status === 429) {
        setError('Too many attempts. Try again in a few minutes.')
        return
      }

      // The status, never the address or the provider's wording.
      if (sendError) {
        console.error('[forgot-password] send failed:', sendError.status ?? 'unknown')
      }

      setSent(true)
    } catch {
      setError('Could not send the reset link. Check your connection and try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-bg min-h-screen flex flex-col justify-center px-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="relative flex flex-col gap-8"
      >
        <div className="text-center">
          <h1
            className="gradient-text text-6xl font-black tracking-tight"
            style={{ filter: 'drop-shadow(0 0 24px rgba(233, 166, 47, 0.28))' }}
          >
            ABC
          </h1>
          <p className="mt-3 text-sm text-text-secondary">Reset your password</p>
        </div>

        <div
          className="rounded-xl p-4 flex flex-col gap-3"
          style={{
            background: 'rgba(15, 15, 15, 0.6)',
            border: '1px solid rgba(42, 42, 42, 0.7)',
          }}
        >
          {sent ? (
            <p
              className="rounded-lg px-3 py-3 text-xs leading-relaxed"
              style={{
                background: 'rgba(34, 197, 94, 0.1)',
                border: '1px solid rgba(34, 197, 94, 0.35)',
                color: '#86efac',
              }}
              role="status"
            >
              {GENERIC_SENT}
            </p>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-3">
              <p className="text-xs leading-relaxed text-text-secondary">
                Enter the email you signed up with and we&apos;ll send you a link to choose a new
                password.
              </p>

              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email"
                autoComplete="email"
                className="abc-input interactive-input px-3 py-2.5 text-xs opacity-90"
              />

              {error && (
                <p
                  className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300"
                  role="alert"
                >
                  {error}
                </p>
              )}

              <motion.button
                whileTap={{ scale: 0.98 }}
                type="submit"
                disabled={loading}
                className={`interactive w-full rounded-lg text-xs font-medium py-2.5 transition-opacity ${
                  loading ? 'opacity-40' : 'opacity-80 hover:opacity-100'
                }`}
                style={{ background: 'transparent', border: '1px solid #2a2a2a', color: '#999999' }}
              >
                {loading ? 'Sending…' : 'Send reset link'}
              </motion.button>
            </form>
          )}
        </div>

        <p className="text-center text-sm text-text-secondary relative">
          Remembered it?{' '}
          <Link href="/login" className="gradient-text font-semibold interactive transition-opacity">
            Sign in
          </Link>
        </p>
      </motion.div>
    </div>
  )
}
