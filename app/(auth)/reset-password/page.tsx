'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { createClientComponent } from '@/lib/supabase'

/**
 * Choose a new password.
 *
 * Reached from a recovery link, which the auth callback has already exchanged
 * for a session by the time this renders. The session is therefore the proof
 * that the link was genuine — there is no token to read here, and none is read.
 *
 * The only thing this screen changes is the password. Nothing touches the
 * profile, the card, onboarding, contacts or the CRM: somebody who forgot a
 * password has not asked to lose anything.
 */

/** The same rule the sign-up form enforces. Two policies would be one too many. */
const MIN_PASSWORD_LENGTH = 6

type SessionState = 'checking' | 'valid' | 'invalid'

export default function ResetPasswordPage() {
  const router = useRouter()
  const supabase = createClientComponent()

  const [sessionState, setSessionState] = useState<SessionState>('checking')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    ;(async () => {
      /*
        A link that has expired, been used, or been opened in a browser that
        never requested it leaves no session behind. Better to say so now than
        to show a form whose submit was always going to fail.
      */
      const { data, error: sessionError } = await supabase.auth.getSession()
      if (!active) return
      if (sessionError) {
        console.error('[reset-password] session check failed:', sessionError.status ?? 'unknown')
      }
      setSessionState(data.session ? 'valid' : 'invalid')
    })()
    return () => {
      active = false
    }
  }, [supabase])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (saving) return
    setError(null)

    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Use at least ${MIN_PASSWORD_LENGTH} characters.`)
      return
    }
    if (password !== confirm) {
      setError('Those passwords do not match.')
      return
    }

    setSaving(true)
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password })

      if (updateError) {
        // The status, never the provider's message and never the password.
        console.error('[reset-password] update failed:', updateError.status ?? 'unknown')
        setError('Could not update your password. The link may have expired.')
        return
      }

      /*
        Sign out, then send them to sign in.
        The recovery session was minted by a link that has now been used, and
        ending it means the new password is the only thing that opens the
        account — which is what somebody resetting a password expects.
      */
      await supabase.auth.signOut()
      router.push('/login?reset=1')
      router.refresh()
    } catch {
      setError('Could not update your password. Try again.')
    } finally {
      setSaving(false)
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
          <p className="mt-3 text-sm text-text-secondary">Choose a new password</p>
        </div>

        <div
          className="rounded-xl p-4 flex flex-col gap-3"
          style={{
            background: 'rgba(15, 15, 15, 0.6)',
            border: '1px solid rgba(42, 42, 42, 0.7)',
          }}
        >
          {sessionState === 'checking' ? (
            <p className="px-1 py-2 text-xs text-text-secondary" role="status">
              Checking your reset link…
            </p>
          ) : sessionState === 'invalid' ? (
            <>
              <p
                className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-3 text-xs leading-relaxed text-red-300"
                role="alert"
              >
                This reset link is invalid or has expired.
              </p>
              <Link
                href="/forgot-password"
                className="interactive w-full rounded-lg text-center text-xs font-medium py-2.5 opacity-80 hover:opacity-100"
                style={{ background: 'transparent', border: '1px solid #2a2a2a', color: '#999999' }}
              >
                Request a new reset link
              </Link>
            </>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-3">
              <input
                type="password"
                required
                minLength={MIN_PASSWORD_LENGTH}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={`New password (min. ${MIN_PASSWORD_LENGTH} characters)`}
                autoComplete="new-password"
                className="abc-input interactive-input px-3 py-2.5 text-xs opacity-90"
              />
              <input
                type="password"
                required
                minLength={MIN_PASSWORD_LENGTH}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="Confirm new password"
                autoComplete="new-password"
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
                disabled={saving}
                className={`interactive w-full rounded-lg text-xs font-medium py-2.5 transition-opacity ${
                  saving ? 'opacity-40' : 'opacity-80 hover:opacity-100'
                }`}
                style={{ background: 'transparent', border: '1px solid #2a2a2a', color: '#999999' }}
              >
                {saving ? 'Updating…' : 'Update password'}
              </motion.button>
            </form>
          )}
        </div>

        <p className="text-center text-sm text-text-secondary relative">
          <Link href="/login" className="gradient-text font-semibold interactive transition-opacity">
            Back to sign in
          </Link>
        </p>
      </motion.div>
    </div>
  )
}
