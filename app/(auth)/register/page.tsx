'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { createClientComponent } from '@/lib/supabase'
import AuthOrDivider from '@/components/auth/AuthOrDivider'
import GoogleSignInButton from '@/components/auth/GoogleSignInButton'

export default function RegisterPage() {
  const router = useRouter()
  const supabase = createClientComponent()

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setInfo(null)
    try {
      const { data, error: e2 } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: name } },
      })
      if (e2) throw new Error(e2.message)

      fetch('/api/email/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'welcome',
          to: email,
          name: name || data.user?.user_metadata?.full_name || 'there',
        }),
      }).catch(() => {})

      if (data.session) {
        router.push('/scan')
        router.refresh()
      } else {
        setInfo('Account created. Check your email to confirm, then sign in.')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed.')
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
          <motion.h1
            className="gradient-text text-6xl font-black tracking-tight"
            style={{ filter: 'drop-shadow(0 0 24px rgba(124,58,237,0.4))' }}
          >
            ABC
          </motion.h1>
          <p className="mt-3 text-sm text-text-secondary">Create an account and start scanning.</p>
        </div>

        <div className="flex flex-col gap-5">
          <GoogleSignInButton nextPath="/onboarding" variant="primary" />
          <AuthOrDivider />

          <div
            className="rounded-xl p-4 flex flex-col gap-3"
            style={{
              background: 'rgba(15, 15, 15, 0.6)',
              border: '1px solid rgba(42, 42, 42, 0.7)',
            }}
          >
            <form onSubmit={handleSubmit} className="flex flex-col gap-3">
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Name"
                className="abc-input interactive-input px-3 py-2.5 text-xs opacity-90"
              />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email"
                className="abc-input interactive-input px-3 py-2.5 text-xs opacity-90"
              />
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password (min. 6 characters)"
                className="abc-input interactive-input px-3 py-2.5 text-xs opacity-90"
              />

              {error && (
                <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">
                  {error}
                </p>
              )}
              {info && (
                <p
                  className="rounded-lg px-3 py-2 text-xs"
                  style={{
                    border: '0.5px solid rgba(14,165,233,0.4)',
                    background: 'rgba(14,165,233,0.1)',
                    color: '#38BDF8',
                  }}
                >
                  {info}
                </p>
              )}

              <motion.button
                whileTap={{ scale: 0.98 }}
                type="submit"
                disabled={loading}
                className={`interactive w-full rounded-lg text-xs font-medium py-2.5 transition-opacity ${
                  loading ? 'opacity-40' : 'opacity-80 hover:opacity-100'
                }`}
                style={{
                  background: 'transparent',
                  border: '1px solid #2a2a2a',
                  color: '#999999',
                }}
              >
                {loading ? 'Creating account…' : 'Create account with email'}
              </motion.button>
            </form>
          </div>
        </div>

        <p className="text-center text-sm text-text-secondary relative">
          Already have an account?{' '}
          <Link href="/login" className="gradient-text font-semibold interactive transition-opacity">
            Sign in
          </Link>
        </p>
      </motion.div>
    </div>
  )
}
