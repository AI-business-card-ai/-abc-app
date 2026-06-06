'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import {
  IconMail,
  IconPhone,
  IconWorld,
  IconBrandLinkedin,
  IconLogout,
} from '@tabler/icons-react'
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

const chipStyle = (active: boolean): React.CSSProperties =>
  active
    ? { border: '0.5px solid #7C3AED', color: '#A78BFA', background: '#1A0A2E' }
    : { border: '0.5px solid #1A0E30', color: '#3A2060', background: 'transparent' }

export default function SettingsPage() {
  const router = useRouter()
  const supabase = createClient()

  const [userId, setUserId] = useState<string | null>(null)
  const [profile, setProfile] = useState<Omit<ABCProfile, 'id'>>(EMPTY)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState(false)
  const [editingField, setEditingField] = useState<string | null>(null)

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

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#07050E' }}>
        <div className="w-7 h-7 rounded-full border-2 border-transparent animate-spin" style={{ borderTopColor: '#7C3AED', borderRightColor: '#0EA5E9' }} />
      </div>
    )
  }

  const initials = profile.full_name?.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase() || '?'
  const subtitle = [profile.company, profile.role].filter(Boolean).join(' · ') || 'Firma · Role'

  return (
    <div className="min-h-screen pb-28" style={{ background: '#07050E' }}>
      {/* 1. HERO */}
      <div
        className="relative overflow-hidden flex flex-col items-center"
        style={{ background: '#07050E', padding: '24px' }}
      >
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ background: 'radial-gradient(ellipse, #7C3AED33, transparent 70%)' }}
        />
        <button
          onClick={signOut}
          className="absolute right-4 top-6 w-9 h-9 rounded-full flex items-center justify-center"
          style={{ border: '0.5px solid #1A0E30', color: '#3A2060' }}
        >
          <IconLogout size={18} />
        </button>

        {/* Avatar 64px */}
        <div
          className="relative rounded-full p-[2px]"
          style={{ background: 'linear-gradient(135deg, #A78BFA, #38BDF8)' }}
        >
          <div
            className="w-16 h-16 rounded-full flex items-center justify-center text-lg font-bold text-white"
            style={{ background: '#1E0A3C' }}
          >
            {initials}
          </div>
        </div>

        <input
          value={profile.full_name ?? ''}
          onChange={(e) => update('full_name', e.target.value)}
          placeholder="Tvé jméno"
          className="relative mt-3 bg-transparent text-center font-bold outline-none w-full"
          style={{ color: '#F0EAFF', fontSize: '16px' }}
        />
        <p className="relative text-xs mt-0.5" style={{ color: '#5A3A8A' }}>
          {subtitle}
        </p>
        <div className="relative flex gap-2 mt-2">
          <input
            value={profile.company ?? ''}
            onChange={(e) => update('company', e.target.value)}
            placeholder="Firma"
            className="w-28 text-center text-xs outline-none rounded-lg px-2 py-1"
            style={{ background: '#0D0A18', border: '0.5px solid #1A0E30', color: '#5A3A8A' }}
          />
          <input
            value={profile.role ?? ''}
            onChange={(e) => update('role', e.target.value)}
            placeholder="Role"
            className="w-28 text-center text-xs outline-none rounded-lg px-2 py-1"
            style={{ background: '#0D0A18', border: '0.5px solid #1A0E30', color: '#5A3A8A' }}
          />
        </div>
      </div>

      {/* 2. VIZITKA */}
      <div
        className="mx-4 mt-4 rounded-xl overflow-hidden"
        style={{ background: '#0D0A18', border: '0.5px solid #1A0E30' }}
      >
        <div className="px-4 pt-4 pb-2">
          <span className="gradient-text font-bold tracking-widest uppercase" style={{ fontSize: '9px' }}>
            TVOJE VIZITKA
          </span>
        </div>
        <VizitkaRow
          icon={<IconMail size={16} />}
          label="Email"
          value={profile.email ?? ''}
          fieldKey="email"
          editing={editingField}
          onEdit={setEditingField}
          onChange={(v) => update('email', v)}
          placeholder="email@firma.cz"
        />
        <VizitkaRow
          icon={<IconPhone size={16} />}
          label="Telefon"
          value={profile.phone ?? ''}
          fieldKey="phone"
          editing={editingField}
          onEdit={setEditingField}
          onChange={(v) => update('phone', v)}
          placeholder="+420 ..."
        />
        <VizitkaRow
          icon={<IconWorld size={16} />}
          label="Web"
          value={profile.website ?? ''}
          fieldKey="website"
          editing={editingField}
          onEdit={setEditingField}
          onChange={(v) => update('website', v)}
          placeholder="firma.cz"
        />
        <VizitkaRow
          icon={<IconBrandLinkedin size={16} />}
          label="LinkedIn"
          value={profile.linkedin_url ?? ''}
          fieldKey="linkedin"
          editing={editingField}
          onEdit={setEditingField}
          onChange={(v) => update('linkedin_url', v)}
          placeholder="linkedin.com/in/..."
          last
        />
      </div>

      {/* 3. CÍLE */}
      <div
        className="mx-4 mt-3 p-4 rounded-xl"
        style={{ background: '#0D0A18', border: '0.5px solid #1A0E30' }}
      >
        <span className="gradient-text font-bold tracking-widest uppercase block mb-2" style={{ fontSize: '9px' }}>
          CÍLE
        </span>
        <textarea
          value={profile.goals ?? ''}
          onChange={(e) => update('goals', e.target.value)}
          placeholder="B2B SaaS partneři, investoři seed stage EU..."
          className="w-full min-h-[80px] resize-none rounded-lg px-3 py-2 text-sm outline-none"
          style={{ background: '#111', border: '0.5px solid #1A0E30', color: '#F0EAFF' }}
          onFocus={(e) => { e.target.style.borderColor = '#7C3AED' }}
          onBlur={(e) => { e.target.style.borderColor = '#1A0E30' }}
        />
      </div>

      {/* 4. STYL */}
      <div
        className="mx-4 mt-3 p-4 rounded-xl"
        style={{ background: '#0D0A18', border: '0.5px solid #1A0E30' }}
      >
        <span className="block mb-2 tracking-widest uppercase" style={{ fontSize: '9px', color: '#3A2060' }}>
          STYL
        </span>
        <div className="flex gap-2 flex-wrap">
          {STYLES.map((s) => (
            <button
              key={s.key}
              onClick={() => update('communication_style', s.key)}
              className="px-4 py-2 rounded-full text-xs"
              style={chipStyle(profile.communication_style === s.key)}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* 5. JAZYK */}
      <div
        className="mx-4 mt-3 p-4 rounded-xl"
        style={{ background: '#0D0A18', border: '0.5px solid #1A0E30' }}
      >
        <span className="block mb-2 tracking-widest uppercase" style={{ fontSize: '9px', color: '#3A2060' }}>
          JAZYK
        </span>
        <div className="flex gap-2 flex-wrap">
          {LANGUAGES.map((l) => (
            <button
              key={l}
              onClick={() => update('outreach_language', l)}
              className="px-4 py-2 rounded-full text-xs"
              style={chipStyle(profile.outreach_language === l)}
            >
              {l}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <p className="mx-4 mt-3 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-2 text-sm text-red-300">
          {error}
        </p>
      )}

      {/* 6. SAVE */}
      <div className="mx-4 mt-4 mb-24">
        <motion.button
          whileTap={{ scale: 0.98 }}
          onClick={save}
          disabled={saving}
          className={`glow-btn w-full rounded-xl text-white font-semibold py-3.5 ${saving ? 'opacity-40' : ''}`}
        >
          {saving ? 'Ukládám...' : 'Uložit profil'}
        </motion.button>
      </div>

      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 rounded-full px-5 py-2.5 text-sm font-medium text-white"
            style={{ background: '#16A34A', boxShadow: '0 4px 16px rgba(22,163,74,0.4)' }}
          >
            Uloženo ✓
          </motion.div>
        )}
      </AnimatePresence>

      <BottomNav />
    </div>
  )
}

function VizitkaRow({
  icon,
  label,
  value,
  fieldKey,
  editing,
  onEdit,
  onChange,
  placeholder,
  last = false,
}: {
  icon: React.ReactNode
  label: string
  value: string
  fieldKey: string
  editing: string | null
  onEdit: (key: string | null) => void
  onChange: (v: string) => void
  placeholder: string
  last?: boolean
}) {
  const isEditing = editing === fieldKey

  return (
    <div
      className="flex items-center gap-3 py-3 px-4 cursor-pointer"
      style={{ borderBottom: last ? 'none' : '0.5px solid #1A0E30' }}
      onClick={() => !isEditing && onEdit(fieldKey)}
    >
      <span style={{ color: '#3A2060' }} className="shrink-0">{icon}</span>
      <span className="text-xs shrink-0" style={{ color: '#3A2060' }}>{label}</span>
      {isEditing ? (
        <input
          autoFocus
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={() => onEdit(null)}
          onKeyDown={(e) => e.key === 'Enter' && onEdit(null)}
          placeholder={placeholder}
          className="flex-1 bg-transparent text-sm outline-none text-right ml-auto"
          style={{ color: '#8B6ABF' }}
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        <span className="text-sm ml-auto truncate max-w-[55%]" style={{ color: '#8B6ABF' }}>
          {value || placeholder}
        </span>
      )}
    </div>
  )
}
