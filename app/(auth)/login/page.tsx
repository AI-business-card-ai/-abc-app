'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { createClientComponent } from '@/lib/supabase'

export default function LoginPage() {
  const router = useRouter()
  const supabase = createClientComponent()

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
      router.push('/scan')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Přihlášení selhalo.')
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

        <form onSubmit={handleSubmit} className="abc-card p-5 flex flex-col gap-4">
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            className="abc-input px-4 py-3 text-sm"
          />
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Heslo"
            className="abc-input px-4 py-3 text-sm"
          />

          {error && (
            <p className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-2.5 text-sm text-red-300">
              {error}
            </p>
          )}

          <motion.button
            whileTap={{ scale: 0.98 }}
            type="submit"
            disabled={loading}
            className={`glow-btn w-full rounded-xl text-white font-semibold py-3.5 ${loading ? 'opacity-40' : ''}`}
          >
            {loading ? 'Přihlašuji...' : 'Přihlásit se'}
          </motion.button>
        </form>

        <p className="text-center text-sm text-text-secondary relative">
          Nemáš účet?{' '}
          <Link href="/register" className="gradient-text font-semibold hover:opacity-80 transition-opacity">
            Registruj se
          </Link>
        </p>
      </motion.div>
    </div>
  )
}
