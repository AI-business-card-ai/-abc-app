'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { IconMail, IconPhone, IconWorld, IconBrandLinkedin, IconLogout } from '@tabler/icons-react'
import { createClient } from '@/lib/supabase-client'
import BottomNav from '@/components/ui/BottomNav'
import type { ABCProfile } from '@/lib/types'

const STYLES: { key: ABCProfile['communication_style']; label: string }[] = [
  { key: 'direct', label: 'Přímý' },
  { key: 'formal', label: 'Formální' },
  { key: 'casual', label: 'Neformální' },
]
const LANGUAGES = ['EN', 'CZ', 'DE', 'Mix']

const EMPTY: Omit<ABCProfile, 'id'> = {
  full_name: '', company: '', role: '', email: '', phone: '', linkedin_url: '', website: '',
  communication_style: 'direct', outreach_language: 'EN', goals: '', plan: 'free', scans_used: 0, scans_limit: 30,
}

const inputClass = 'bg-[#0D0A18] border-[0.5px] border-[#1A0E30] focus:border-[#7C3AED] text-[#F0EAFF] rounded-lg px-3 py-2 outline-none w-full text-sm'

export default function SettingsPage() {
  const router = useRouter()
  const supabase = createClient()

  const [userId, setUserId] = useState<string | null>(null)
  const [profile, setProfile] = useState<Omit<ABCProfile, 'id'>>(EMPTY)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState(false)

  useEffect(() => {
    let active = true
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      if (!active) return
      setUserId(user.id)
      const { data } = await supabase.from('abc_profiles').select('*').eq('id', user.id).maybeSingle()
      if (!active) return
      if (data) {
        const { id: _id, ...rest } = data as ABCProfile
        setProfile({ ...EMPTY, ...rest })
      } else {
        setProfile((p) => ({ ...p, email: user.email ?? '' }))
      }
      setLoading(false)
    })()
    return () => { active = false }
  }, [router, supabase])

  function update<K extends keyof typeof profile>(key: K, value: (typeof profile)[K]) {
    setProfile((p) => ({ ...p, [key]: value }))
  }

  async function save() {
    if (!userId) return
    setSaving(true)
    setError(null)
    try {
      const { error: e } = await supabase.from('abc_profiles').upsert({ id: userId, ...profile })
      if (e) throw new Error(e.message)
      setToast(true)
      setTimeout(() => setToast(false), 3000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Uložení selhalo.')
    } finally {
      setSaving(false)
    }
  }

  async function signOut() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center text-[#6B7280]">Načítám...</div>

  const initials = profile.full_name?.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase() || '?'

  return (
    <div className="min-h-screen bg-[#07050E] pb-28">
      {/* PROFILE HERO */}
      <div className="p-6 flex flex-col items-center gap-2 relative" style={{ background: '#1A0A2E' }}>
        <button onClick={signOut} className="absolute right-4 top-6 w-9 h-9 rounded-full border border-[#1A0E30] flex items-center justify-center text-[#6B7280]">
          <IconLogout size={18} />
        </button>
        <div className="rounded-full p-[2px]" style={{ background: 'linear-gradient(135deg,#7C3AED,#0EA5E9)' }}>
          <div className="w-20 h-20 rounded-full flex items-center justify-center text-2xl font-bold text-[#F0EAFF]" style={{ background: '#0D0A18' }}>{initials}</div>
        </div>
        <input value={profile.full_name ?? ''} onChange={(e) => update('full_name', e.target.value)} placeholder="Tvé jméno" className="bg-transparent text-center text-xl font-bold text-[#F0EAFF] outline-none" />
        <div className="flex gap-2">
          <input value={profile.role ?? ''} onChange={(e) => update('role', e.target.value)} placeholder="Role" className="w-28 text-center text-xs bg-[#0D0A18] border-[0.5px] border-[#1A0E30] focus:border-[#7C3AED] text-[#6B7280] rounded-lg px-2 py-1 outline-none" />
          <input value={profile.company ?? ''} onChange={(e) => update('company', e.target.value)} placeholder="Firma" className="w-28 text-center text-xs bg-[#0D0A18] border-[0.5px] border-[#1A0E30] focus:border-[#7C3AED] text-[#6B7280] rounded-lg px-2 py-1 outline-none" />
        </div>
      </div>

      {/* VIZITKA */}
      <div className="abc-card mx-4 mt-4 p-4 flex flex-col gap-3">
        <span className="gradient-text text-[10px] tracking-widest font-bold">TVOJE VIZITKA</span>
        <Row icon={<IconMail size={16} />} value={profile.email ?? ''} onChange={(v) => update('email', v)} placeholder="email@firma.cz" />
        <Row icon={<IconPhone size={16} />} value={profile.phone ?? ''} onChange={(v) => update('phone', v)} placeholder="+420 ..." />
        <Row icon={<IconWorld size={16} />} value={profile.website ?? ''} onChange={(v) => update('website', v)} placeholder="firma.cz" />
        <Row icon={<IconBrandLinkedin size={16} />} value={profile.linkedin_url ?? ''} onChange={(v) => update('linkedin_url', v)} placeholder="linkedin.com/in/..." />
      </div>

      {/* CÍLE */}
      <div className="abc-card mx-4 mt-3 p-4 flex flex-col gap-2">
        <span className="text-[10px] tracking-widest text-[#3A2060]">CÍLE</span>
        <textarea value={profile.goals ?? ''} onChange={(e) => update('goals', e.target.value)} placeholder="Koho hledáš a proč..." className={`${inputClass} min-h-[80px] resize-none`} />
      </div>

      {/* STYL */}
      <div className="abc-card mx-4 mt-3 p-4 flex flex-col gap-2">
        <span className="text-[10px] tracking-widest text-[#3A2060]">KOMUNIKAČNÍ STYL</span>
        <div className="flex gap-2">
          {STYLES.map((s) => (
            <Chip key={s.key} active={profile.communication_style === s.key} onClick={() => update('communication_style', s.key)}>{s.label}</Chip>
          ))}
        </div>
      </div>

      {/* JAZYK */}
      <div className="abc-card mx-4 mt-3 p-4 flex flex-col gap-2">
        <span className="text-[10px] tracking-widest text-[#3A2060]">JAZYK</span>
        <div className="flex gap-2">
          {LANGUAGES.map((l) => (
            <Chip key={l} active={profile.outreach_language === l} onClick={() => update('outreach_language', l)}>{l}</Chip>
          ))}
        </div>
      </div>

      {/* PLÁN */}
      <div className="abc-card mx-4 mt-3 p-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="rounded-full px-3 py-1 text-xs font-bold uppercase text-white" style={{ background: 'linear-gradient(135deg,#7C3AED,#0EA5E9)' }}>{profile.plan}</span>
          <span className="text-xs text-[#6B7280]">{profile.scans_used}/{profile.scans_limit} skenů</span>
        </div>
        {profile.plan === 'free' && (
          <button className="glow-btn rounded-xl text-white px-4 py-2 text-sm">Přejít na Pro →</button>
        )}
      </div>

      {error && <p className="mx-4 mt-3 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-2 text-sm text-red-300">{error}</p>}

      <div className="mx-4 mt-4 mb-24">
        <button onClick={save} disabled={saving} className={`glow-btn w-full rounded-xl text-white font-semibold py-3.5 ${saving ? 'opacity-40' : ''}`}>
          {saving ? 'Ukládám...' : 'Uložit profil'}
        </button>
      </div>

      <AnimatePresence>
        {toast && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }} className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 rounded-full px-5 py-2 text-sm font-medium text-white" style={{ background: '#16A34A' }}>
            Profil uložen ✓
          </motion.div>
        )}
      </AnimatePresence>

      <BottomNav />
    </div>
  )
}

function Row({ icon, value, onChange, placeholder }: { icon: React.ReactNode; value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border-[0.5px] border-[#1A0E30] bg-[#0D0A18] px-3 py-2">
      <span className="text-[#6B7280]">{icon}</span>
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="flex-1 bg-transparent text-sm text-[#F0EAFF] outline-none placeholder:text-[#6B7280]" />
    </div>
  )
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className="px-4 py-2 rounded-full text-xs border transition-colors" style={active ? { borderColor: '#7C3AED', color: '#A78BFA', background: '#1A0A2E' } : { borderColor: '#1A0E30', color: '#6B7280' }}>
      {children}
    </button>
  )
}
