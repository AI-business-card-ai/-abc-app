'use client'

import { Suspense, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { motion } from 'framer-motion'
import { createClientComponent } from '@/lib/supabase'
import AuthOrDivider from '@/components/auth/AuthOrDivider'
import GoogleSignInButton from '@/components/auth/GoogleSignInButton'

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function LoginContent() {
  const router = useRouter()
  const supabase = createClientComponent()
  const searchParams = useSearchParams()

  const rawConnect = searchParams.get('connect')
  const connectUserId = rawConnect && UUID_RE.test(rawConnect) ? rawConnect : undefined

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const { error: e2 } = await supabase.auth.signInWithPassword({ email, password })
      if (e2) throw new Error(e2.message)
      if (connectUserId) {
        // Email login skips the OAuth callback — run the connect flow via API
        fetch('/api/card/connect', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ownerUserId: connectUserId }),
        }).catch(() => {})
      }
      router.push('/scan')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign in failed.')
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
          <p className="mt-3 text-sm text-text-secondary">Scan. Know. Connect.</p>
        </div>

        <div className="flex flex-col gap-5">
          <GoogleSignInButton nextPath="/dashboard" variant="primary" connectUserId={connectUserId} />
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
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email"
                className="abc-input px-3 py-2.5 text-xs opacity-90"
              />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                className="abc-input px-3 py-2.5 text-xs opacity-90"
              />

              {error && (
                <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">
                  {error}
                </p>
              )}

              <motion.button
                whileTap={{ scale: 0.98 }}
                type="submit"
                disabled={loading}
                className={`w-full rounded-lg text-xs font-medium py-2.5 transition-opacity ${
                  loading ? 'opacity-40' : 'opacity-80 hover:opacity-100'
                }`}
                style={{
                  background: 'transparent',
                  border: '1px solid #2a2a2a',
                  color: '#999999',
                }}
              >
                {loading ? 'Signing in…' : 'Sign in with email'}
              </motion.button>
            </form>
          </div>
        </div>

        <p className="text-center text-sm text-text-secondary relative">
          Don&apos;t have an account?{' '}
          <Link href="/register" className="gradient-text font-semibold hover:opacity-80 transition-opacity">
            Sign up
          </Link>
        </p>
      </motion.div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginContent />
    </Suspense>
  )
}
