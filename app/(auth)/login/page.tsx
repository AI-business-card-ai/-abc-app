'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { createClient } from '@/lib/supabase-client'

export default function LoginPage() {
  const router = useRouter()
  const supabase = createClient()

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
    <div className="min-h-screen flex flex-col justify-center px-6">
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className="flex flex-col gap-8">
        <div className="text-center">
          <h1 className="gradient-text text-5xl font-black">ABC</h1>
          <p className="mt-2 text-sm text-[#6B7280]">Scan. Know. Connect.</p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" className="bg-[#0D0A18] border-[0.5px] border-[#1A0E30] focus:border-[#7C3AED] text-[#F0EAFF] rounded-lg px-4 py-3 text-sm outline-none placeholder:text-[#6B7280]" />
          <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Heslo" className="bg-[#0D0A18] border-[0.5px] border-[#1A0E30] focus:border-[#7C3AED] text-[#F0EAFF] rounded-lg px-4 py-3 text-sm outline-none placeholder:text-[#6B7280]" />

          {error && <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-2 text-sm text-red-300">{error}</p>}

          <button type="submit" disabled={loading} className={`glow-btn w-full rounded-xl text-white font-semibold py-3.5 ${loading ? 'opacity-40' : ''}`}>
            {loading ? 'Přihlašuji...' : 'Přihlásit se'}
          </button>
        </form>

        <p className="text-center text-sm text-[#6B7280]">
          Nemáš účet? <Link href="/register" className="gradient-text font-semibold">Registruj se</Link>
        </p>
      </motion.div>
    </div>
  )
}
