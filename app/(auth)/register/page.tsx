'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { createClient } from '@/lib/supabase-client'

export default function RegisterPage() {
  const router = useRouter()
  const supabase = createClient()

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
      if (data.session) {
        router.push('/scan')
        router.refresh()
      } else {
        setInfo('Účet vytvořen. Zkontroluj email pro potvrzení, pak se přihlas.')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registrace selhala.')
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
          <p className="mt-3 text-sm text-text-secondary">Vytvoř si účet a začni skenovat.</p>
        </div>

        <form onSubmit={handleSubmit} className="abc-card p-5 flex flex-col gap-4">
          <input
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Jméno"
            className="abc-input px-4 py-3 text-sm"
          />
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
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Heslo (min. 6 znaků)"
            className="abc-input px-4 py-3 text-sm"
          />

          {error && (
            <p className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-2.5 text-sm text-red-300">
              {error}
            </p>
          )}
          {info && (
            <p
              className="rounded-xl px-4 py-2.5 text-sm"
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
            className={`glow-btn w-full rounded-xl text-white font-semibold py-3.5 ${loading ? 'opacity-40' : ''}`}
          >
            {loading ? 'Vytvářím účet...' : 'Vytvořit účet'}
          </motion.button>
        </form>

        <p className="text-center text-sm text-text-secondary relative">
          Máš účet?{' '}
          <Link href="/login" className="gradient-text font-semibold hover:opacity-80 transition-opacity">
            Přihlaš se
          </Link>
        </p>
      </motion.div>
    </div>
  )
}
