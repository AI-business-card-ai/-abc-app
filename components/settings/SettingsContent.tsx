'use client'

import { useEffect, useRef, useState, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { getLanguageLabel } from '@/lib/ai-messages'
import { motion, AnimatePresence } from 'framer-motion'
import {
  IconMail,
  IconPhone,
  IconWorld,
  IconBrandLinkedin,
  IconLogout,
  IconCamera,
} from '@tabler/icons-react'
import { createClientComponent } from '@/lib/supabase'
import {
  DEFAULT_RESEARCH_PREFERENCES,
  RESEARCH_PREFERENCE_OPTIONS,
} from '@/lib/research'
import { EMPTY_ABC_PROFILE, normalizeAbcProfile } from '@/lib/profile-defaults'
import type { ABCProfile } from '@/lib/types'

const STYLES: { key: ABCProfile['communication_style']; label: string }[] = [
  { key: 'direct', label: 'Direct' },
  { key: 'formal', label: 'Formal' },
  { key: 'casual', label: 'Casual' },
]
const LANGUAGES = ['EN', 'CZ', 'DE', 'Mix']

const chipStyle = (active: boolean): React.CSSProperties =>
  active
    ? { border: '0.5px solid #7C3AED', color: '#A78BFA', background: '#1A0A2E' }
    : { border: '0.5px solid #1A0E30', color: '#3A2060', background: 'transparent' }

export default function SettingsContent() {
  const router = useRouter()
  const supabase = useMemo(() => createClientComponent(), [])
  const photoInputRef = useRef<HTMLInputElement>(null)

  const [userId, setUserId] = useState<string | null>(null)
  const [profile, setProfile] = useState<Omit<ABCProfile, 'id'>>(EMPTY_ABC_PROFILE)
  const [hasProfileRow, setHasProfileRow] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState(false)
  const [editingField, setEditingField] = useState<string | null>(null)
  const [hubspotConnected, setHubspotConnected] = useState(false)
  const [hubspotSaving, setHubspotSaving] = useState(false)
  const [hubspotError, setHubspotError] = useState<string | null>(null)
  const [salesforceConnected, setSalesforceConnected] = useState(false)
  const [salesforceSaving, setSalesforceSaving] = useState(false)
  const [salesforceError, setSalesforceError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  const showToast = useCallback(() => {
    setToast(true)
    setTimeout(() => setToast(false), 3000)
  }, [])

  useEffect(() => {
    let active = true
    ;(async () => {
      setLoading(true)
      setLoadError(null)
      try {
        const { data: { user }, error: authError } = await supabase.auth.getUser()
        if (authError) {
          console.error('[profile] auth error:', authError.message)
          throw authError
        }
        if (!user) {
          router.push('/login')
          return
        }
        if (!active) return

        setUserId(user.id)
        const { data, error: profileError } = await supabase
          .from('abc_profiles')
          .select('*')
          .eq('id', user.id)
          .maybeSingle()

        if (!active) return

        if (profileError) {
          console.error('[profile] abc_profiles query failed:', profileError.message, profileError)
          setLoadError('Could not load your profile — you can still edit and save below.')
          setHasProfileRow(false)
        } else {
          setHasProfileRow(!!data)
        }

        const normalized = normalizeAbcProfile(data as Partial<ABCProfile> | null, user.email)
        setProfile(normalized)
        setHubspotConnected(!!normalized.hubspot_access_token)
        setSalesforceConnected(!!normalized.salesforce_access_token)
      } catch (err) {
        if (!active) return
        console.error('[profile] load failed:', err)
        setLoadError(err instanceof Error ? err.message : 'Failed to load profile.')
        setHasProfileRow(false)
        setProfile(normalizeAbcProfile(null))
      } finally {
        if (active) setLoading(false)
      }
    })()
    return () => { active = false }
  }, [router, supabase, reloadKey])

  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search)
      const crm = params.get('crm')
      const profilePath = window.location.pathname.startsWith('/profile') ? '/profile' : '/settings'
      if (crm === 'hubspot-connected') {
        setHubspotConnected(true)
        showToast()
        router.replace(profilePath)
      } else if (crm === 'hubspot-error') {
        setHubspotError('HubSpot connection failed. Please try again.')
        router.replace(profilePath)
      } else if (crm === 'salesforce-connected') {
        setSalesforceConnected(true)
        showToast()
        router.replace(profilePath)
      } else if (crm === 'salesforce-error') {
        setSalesforceError('Salesforce connection failed. Please try again.')
        router.replace(profilePath)
      }
    } catch (err) {
      console.error('[settings] CRM callback handling failed:', err)
    }
  }, [router, showToast])

  function update<K extends keyof typeof profile>(key: K, value: (typeof profile)[K]) {
    setProfile((p) => ({ ...(p ?? EMPTY_ABC_PROFILE), [key]: value }))
  }

  function toggleResearchPreference(key: string) {
    setProfile((p) => {
      const base = p ?? EMPTY_ABC_PROFILE
      const current = Array.isArray(base.research_preferences)
        ? base.research_preferences
        : [...DEFAULT_RESEARCH_PREFERENCES]
      const next = current.includes(key)
        ? current.filter((k) => k !== key)
        : [...current, key]
      return { ...base, research_preferences: next }
    })
  }

  async function handlePhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !userId) return
    setUploading(true)
    setError(null)
    try {
      const ext = (file.name.split('.').pop() || 'jpg').toLowerCase()
      const path = `${userId}/avatar.${ext}`
      const { error: upErr } = await supabase.storage
        .from('avatars')
        .upload(path, file, { upsert: true, contentType: file.type })
      if (upErr) throw upErr
      const { data } = supabase.storage.from('avatars').getPublicUrl(path)
      const url = `${data.publicUrl}?t=${Date.now()}`
      update('avatar_url', url)
      // Best-effort persist; never blocks profile usage
      await supabase.from('abc_profiles').update({ avatar_url: url }).eq('id', userId)
      showToast()
    } catch (err) {
      setError(err instanceof Error ? `Photo upload failed: ${err.message}` : 'Photo upload failed.')
    } finally {
      setUploading(false)
    }
  }

  async function save() {
    if (!userId) return
    setSaving(true)
    setError(null)
    try {
      const payload = {
        id: userId,
        full_name: profile.full_name || null,
        company: profile.company || null,
        role: profile.role || null,
        email: profile.email || null,
        phone: profile.phone || null,
        linkedin_url: profile.linkedin_url || null,
        website: profile.website || null,
        communication_style: profile.communication_style || 'direct',
        outreach_language: profile.outreach_language || 'EN',
        goals: profile.goals || null,
        plan: profile.plan,
        scans_used: profile.scans_used,
        scans_limit: profile.scans_limit,
        research_preferences: Array.isArray(profile.research_preferences)
          ? profile.research_preferences
          : [...DEFAULT_RESEARCH_PREFERENCES],
        custom_questions: profile.custom_questions || null,
      }
      const { error: e } = await supabase
        .from('abc_profiles')
        .upsert(payload, { onConflict: 'id' })
      if (e) throw new Error(e.message)
      showToast()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed.')
    } finally {
      setSaving(false)
    }
  }

  async function disconnectHubspot() {
    if (!userId) return
    setHubspotSaving(true)
    setHubspotError(null)
    try {
      const res = await fetch('/api/auth/hubspot/disconnect', { method: 'DELETE' })
      let json: { success?: boolean; error?: string } = {}
      try {
        json = await res.json()
      } catch {
        throw new Error('Invalid response from server')
      }
      if (!res.ok || !json.success) throw new Error(json.error || 'Failed to disconnect')
      setHubspotConnected(false)
      showToast()
    } catch (err) {
      setHubspotError(err instanceof Error ? err.message : 'Failed to disconnect')
    } finally {
      setHubspotSaving(false)
    }
  }

  async function disconnectSalesforce() {
    if (!userId) return
    setSalesforceSaving(true)
    setSalesforceError(null)
    try {
      const res = await fetch('/api/auth/salesforce/disconnect', { method: 'DELETE' })
      let json: { success?: boolean; error?: string } = {}
      try {
        json = await res.json()
      } catch {
        throw new Error('Invalid response from server')
      }
      if (!res.ok || !json.success) throw new Error(json.error || 'Failed to disconnect')
      setSalesforceConnected(false)
      showToast()
    } catch (err) {
      setSalesforceError(err instanceof Error ? err.message : 'Failed to disconnect')
    } finally {
      setSalesforceSaving(false)
    }
  }

  async function signOut() {
    try {
      await supabase.auth.signOut()
      router.push('/login')
    } catch (err) {
      console.error('[settings] sign out failed:', err)
      setError(err instanceof Error ? err.message : 'Sign out failed.')
    }
  }

  const safeProfile = profile ?? EMPTY_ABC_PROFILE
  const researchPrefs = Array.isArray(safeProfile.research_preferences)
    ? safeProfile.research_preferences
    : [...DEFAULT_RESEARCH_PREFERENCES]
  const researchOptions = Array.isArray(RESEARCH_PREFERENCE_OPTIONS) ? RESEARCH_PREFERENCE_OPTIONS : []

  if (loading) {
    return (
      <div
        className="min-h-screen flex flex-col items-center justify-center gap-3"
        style={{ background: '#0d0f1a', color: '#8892b0' }}
      >
        <div
          className="w-8 h-8 rounded-full border-2 border-transparent animate-spin"
          style={{ borderTopColor: '#00d4d4', borderRightColor: '#8b5cf6' }}
        />
        <p className="text-sm">Loading profile…</p>
      </div>
    )
  }

  const initials = (() => {
    const name = typeof safeProfile.full_name === 'string' ? safeProfile.full_name : ''
    return name
      .split(' ')
      .map((part) => (typeof part === 'string' ? part[0] : ''))
      .filter(Boolean)
      .slice(0, 2)
      .join('')
      .toUpperCase() || '?'
  })()
  const subtitle = [safeProfile.company, safeProfile.role]
    .filter((v): v is string => typeof v === 'string' && v.length > 0)
    .join(' · ') || 'Company · Role'
  const userPromptText = typeof safeProfile.user_prompt === 'string' ? safeProfile.user_prompt : ''
  const commStyle = safeProfile.communication_style || 'direct'
  const outreachLang = safeProfile.outreach_language || 'EN'

  return (
    <div className="min-h-screen pb-8 page-shell page-shell--narrow" style={{ background: '#0d0f1a' }}>
      {loadError && (
        <div
          className="mx-4 mt-4 rounded-xl px-4 py-3 flex flex-col gap-2"
          style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)' }}
        >
          <p className="text-sm font-semibold" style={{ color: '#fca5a5' }}>Could not load profile</p>
          <p className="text-sm" style={{ color: '#fbbf24' }}>{loadError}</p>
          <button
            type="button"
            onClick={() => setReloadKey((k) => k + 1)}
            className="text-xs font-semibold self-start px-3 py-1.5 rounded-lg min-h-[44px]"
            style={{ border: '1px solid rgba(245,158,11,0.4)', color: '#fbbf24' }}
          >
            Retry load
          </button>
        </div>
      )}

      {!hasProfileRow && !loadError && (
        <div
          className="mx-4 mt-4 rounded-xl px-4 py-4 flex flex-col gap-3"
          style={{ background: 'rgba(0,212,212,0.08)', border: '1px solid rgba(0,212,212,0.25)' }}
        >
          <p className="text-sm font-semibold" style={{ color: '#00d4d4' }}>Complete your profile</p>
          <p className="text-sm leading-relaxed" style={{ color: '#8892b0' }}>
            No profile saved yet. Fill in your details below or complete AI onboarding for personalized messages.
          </p>
          <button
            type="button"
            onClick={() => router.push('/onboarding')}
            className="self-start text-xs font-semibold px-4 py-2.5 rounded-lg min-h-[44px]"
            style={{ border: '1px solid rgba(0,212,212,0.4)', color: '#00d4d4' }}
          >
            Start onboarding →
          </button>
        </div>
      )}
      {/* 1. HERO */}
      <div
        className="relative overflow-hidden flex flex-col items-center rounded-b-2xl mx-4 mt-4"
        style={{ background: '#141628', padding: '24px', border: '1px solid rgba(139, 92, 246, 0.12)' }}
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

        {/* Avatar 64px with upload */}
        <button
          onClick={() => photoInputRef.current?.click()}
          disabled={uploading}
          className="relative rounded-full p-[2px]"
          style={{ background: 'linear-gradient(135deg, #A78BFA, #38BDF8)' }}
        >
          {safeProfile.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={safeProfile.avatar_url}
              alt=""
              className="w-16 h-16 rounded-full object-cover block"
            />
          ) : (
            <div
              className="w-16 h-16 rounded-full flex items-center justify-center text-lg font-bold text-white"
              style={{ background: '#1E0A3C' }}
            >
              {initials}
            </div>
          )}
          <span
            className="absolute bottom-0 right-0 w-6 h-6 rounded-full flex items-center justify-center"
            style={{ background: '#7C3AED', border: '2px solid #07050E', color: '#fff' }}
          >
            <IconCamera size={12} />
          </span>
        </button>
        <input
          ref={photoInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handlePhoto}
        />
        {uploading && (
          <span className="relative mt-2 text-xs" style={{ color: '#A78BFA' }}>Uploading...</span>
        )}

        <input
          value={safeProfile.full_name ?? ''}
          onChange={(e) => update('full_name', e.target.value)}
          placeholder="Your name"
          className="relative mt-3 bg-transparent text-center font-bold outline-none w-full"
          style={{ color: '#F0EAFF', fontSize: '16px' }}
        />
        <p className="relative text-xs mt-0.5" style={{ color: '#5A3A8A' }}>
          {subtitle}
        </p>
        <div className="relative flex gap-2 mt-2">
          <input
            value={safeProfile.company ?? ''}
            onChange={(e) => update('company', e.target.value)}
            placeholder="Company"
            className="w-28 text-center text-xs outline-none rounded-lg px-2 py-1"
            style={{ background: '#0D0A18', border: '0.5px solid #1A0E30', color: '#5A3A8A' }}
          />
          <input
            value={safeProfile.role ?? ''}
            onChange={(e) => update('role', e.target.value)}
            placeholder="Role"
            className="w-28 text-center text-xs outline-none rounded-lg px-2 py-1"
            style={{ background: '#0D0A18', border: '0.5px solid #1A0E30', color: '#5A3A8A' }}
          />
        </div>
      </div>

      {/* AI PROFILE */}
      {(safeProfile.onboarding_completed || userPromptText) && (
        <div
          className="mx-4 mt-4 rounded-xl p-4 flex flex-col gap-3"
          style={{ background: '#141628', border: '1px solid rgba(139, 92, 246, 0.12)' }}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="gradient-text font-bold tracking-widest uppercase" style={{ fontSize: '9px' }}>
              Your AI Profile
            </span>
            <button
              type="button"
              onClick={() => router.push('/onboarding')}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg"
              style={{ border: '1px solid rgba(0,212,212,0.4)', color: '#00d4d4' }}
            >
              Edit Profile
            </button>
          </div>
          <div
            className="rounded-lg px-3 py-2.5 flex items-center justify-between gap-2"
            style={{ background: 'rgba(0,212,212,0.08)', border: '1px solid rgba(0,212,212,0.25)' }}
          >
            <span className="text-sm font-semibold" style={{ color: '#00d4d4' }}>
              ✓ Messages language: {getLanguageLabel(safeProfile.user_language ?? 'EN')}
            </span>
            <button
              type="button"
              onClick={() => router.push('/onboarding?step=4')}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg shrink-0"
              style={{ border: '1px solid rgba(0,212,212,0.4)', color: '#00d4d4' }}
            >
              Change
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>
              <p className="text-[10px] uppercase" style={{ color: '#4a5168' }}>Name</p>
              <p style={{ color: '#f0f0ff' }}>{safeProfile.user_name || safeProfile.full_name || '—'}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase" style={{ color: '#4a5168' }}>Company</p>
              <p style={{ color: '#f0f0ff' }}>{safeProfile.user_company || safeProfile.company || '—'}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase" style={{ color: '#4a5168' }}>Role</p>
              <p style={{ color: '#f0f0ff' }}>{safeProfile.user_role || safeProfile.role || '—'}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase" style={{ color: '#4a5168' }}>Style</p>
              <p style={{ color: '#f0f0ff' }}>{safeProfile.user_style || commStyle || '—'}</p>
            </div>
          </div>
          {userPromptText ? (
            <div
              className="rounded-lg px-3 py-2 text-xs leading-relaxed"
              style={{ background: '#1c1f35', color: '#8892b0', border: '1px solid rgba(0,212,212,0.15)' }}
            >
              {userPromptText.length > 150
                ? `${userPromptText.slice(0, 150)}...`
                : userPromptText}
            </div>
          ) : null}
        </div>
      )}

      {/* 2. YOUR CARD */}
      <div
        className="mx-4 mt-4 rounded-xl overflow-hidden"
        style={{ background: '#0D0A18', border: '0.5px solid #1A0E30' }}
      >
        <div className="px-4 pt-4 pb-2">
          <span className="gradient-text font-bold tracking-widest uppercase" style={{ fontSize: '9px' }}>
            YOUR CARD
          </span>
        </div>
        <VizitkaRow
          icon={<IconMail size={16} />}
          label="Email"
          value={safeProfile.email ?? ''}
          fieldKey="email"
          editing={editingField}
          onEdit={setEditingField}
          onChange={(v) => update('email', v)}
          placeholder="email@company.com"
        />
        <VizitkaRow
          icon={<IconPhone size={16} />}
          label="Phone"
          value={safeProfile.phone ?? ''}
          fieldKey="phone"
          editing={editingField}
          onEdit={setEditingField}
          onChange={(v) => update('phone', v)}
          placeholder="+420 ..."
        />
        <VizitkaRow
          icon={<IconWorld size={16} />}
          label="Web"
          value={safeProfile.website ?? ''}
          fieldKey="website"
          editing={editingField}
          onEdit={setEditingField}
          onChange={(v) => update('website', v)}
          placeholder="company.com"
        />
        <VizitkaRow
          icon={<IconBrandLinkedin size={16} />}
          label="LinkedIn"
          value={safeProfile.linkedin_url ?? ''}
          fieldKey="linkedin"
          editing={editingField}
          onEdit={setEditingField}
          onChange={(v) => update('linkedin_url', v)}
          placeholder="linkedin.com/in/..."
          last
        />
      </div>

      {/* 3. GOALS */}
      <div
        className="mx-4 mt-3 p-4 rounded-xl"
        style={{ background: '#0D0A18', border: '0.5px solid #1A0E30' }}
      >
        <span className="gradient-text font-bold tracking-widest uppercase block mb-2" style={{ fontSize: '9px' }}>
          GOALS
        </span>
        <textarea
          value={safeProfile.goals ?? ''}
          onChange={(e) => update('goals', e.target.value)}
          placeholder="B2B SaaS partners, seed-stage investors in the EU..."
          className="w-full min-h-[80px] resize-none rounded-lg px-3 py-2 text-base outline-none"
          style={{ background: '#111', border: '0.5px solid #1A0E30', color: '#F0EAFF' }}
          onFocus={(e) => { e.target.style.borderColor = '#7C3AED' }}
          onBlur={(e) => { e.target.style.borderColor = '#1A0E30' }}
        />
      </div>

      {/* RESEARCH PREFERENCES */}
      <div
        className="mx-4 mt-3 p-4 rounded-xl"
        style={{ background: '#0D0A18', border: '0.5px solid #1A0E30' }}
      >
        <span className="gradient-text font-bold tracking-widest uppercase block mb-3" style={{ fontSize: '9px' }}>
          WHAT TO ALWAYS RESEARCH
        </span>
        <div className="flex flex-col gap-2.5 mb-4">
          {researchOptions.map((opt) => {
            if (!opt?.key) return null
            const checked = researchPrefs.includes(opt.key)
            return (
              <label
                key={opt.key}
                className="flex items-center gap-3 cursor-pointer text-sm"
                style={{ color: checked ? '#F0EAFF' : '#5A3A8A' }}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleResearchPreference(opt.key)}
                  className="w-4 h-4 rounded accent-[#7C3AED]"
                />
                {opt.label}
              </label>
            )
          })}
        </div>
        <span className="block mb-2 text-xs" style={{ color: '#3A2060' }}>
          Custom questions (one per line):
        </span>
        <textarea
          value={safeProfile.custom_questions ?? ''}
          onChange={(e) => update('custom_questions', e.target.value)}
          placeholder={'Are they raising funding?\nDo they have an office in the EU?\n...'}
          className="w-full min-h-[80px] resize-none rounded-lg px-3 py-2 text-base outline-none"
          style={{ background: '#111', border: '0.5px solid #1A0E30', color: '#F0EAFF' }}
          onFocus={(e) => { e.target.style.borderColor = '#7C3AED' }}
          onBlur={(e) => { e.target.style.borderColor = '#1A0E30' }}
        />
      </div>

      {/* 4. STYLE */}
      <div
        className="mx-4 mt-3 p-4 rounded-xl"
        style={{ background: '#0D0A18', border: '0.5px solid #1A0E30' }}
      >
        <span className="block mb-2 tracking-widest uppercase" style={{ fontSize: '9px', color: '#3A2060' }}>
          STYLE
        </span>
        <div className="flex gap-2 flex-wrap">
          {STYLES.map((s) => (
            <button
              key={s.key}
              onClick={() => update('communication_style', s.key)}
              className="px-4 py-2 rounded-full text-xs"
              style={chipStyle(commStyle === s.key)}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* 5. LANGUAGE */}
      <div
        className="mx-4 mt-3 p-4 rounded-xl"
        style={{ background: '#0D0A18', border: '0.5px solid #1A0E30' }}
      >
        <span className="block mb-2 tracking-widest uppercase" style={{ fontSize: '9px', color: '#3A2060' }}>
          LANGUAGE
        </span>
        <div className="flex gap-2 flex-wrap">
          {LANGUAGES.map((l) => (
            <button
              key={l}
              onClick={() => update('outreach_language', l)}
              className="px-4 py-2 rounded-full text-xs"
              style={chipStyle(outreachLang === l)}
            >
              {l}
            </button>
          ))}
        </div>
      </div>

      {/* EXPORT & INTEGRATIONS */}
      <div
        className="mx-4 mt-3 p-4 rounded-xl"
        style={{ background: '#0D0A18', border: '0.5px solid #1A0E30' }}
      >
        <span className="gradient-text font-bold tracking-widest uppercase block mb-2" style={{ fontSize: '9px' }}>
          EXPORT CONTACTS
        </span>
        <p className="text-xs mb-4 leading-relaxed" style={{ color: '#5A3A8A' }}>
          Your contacts are ready to export. Download CSV and import directly into Salesforce or HubSpot.
        </p>

        <div className="mb-4">
          <p className="text-sm font-medium mb-1" style={{ color: '#F0EAFF' }}>Export for Salesforce</p>
          <p className="text-xs mb-2" style={{ color: '#5A3A8A' }}>Compatible with Salesforce Lead Import</p>
          <a
            href="/api/export/csv?format=salesforce"
            className="block w-full rounded-lg py-2.5 text-sm font-semibold text-white text-center"
            style={{ background: 'linear-gradient(135deg, #0176D3, #0EA5E9)' }}
          >
            ⬇ Download CSV
          </a>
        </div>

        <div className="mb-4">
          <p className="text-sm font-medium mb-1" style={{ color: '#F0EAFF' }}>Universal ABC Export</p>
          <p className="text-xs mb-2" style={{ color: '#5A3A8A' }}>All ABC + CRM + intelligence fields</p>
          <a
            href="/api/export/csv?format=universal"
            className="block w-full rounded-lg py-2.5 text-sm font-semibold text-white text-center"
            style={{ background: 'linear-gradient(135deg, #00d4d4, #8b5cf6)' }}
          >
            ⬇ Download CSV
          </a>
        </div>

        <div className="mb-4">
          <p className="text-sm font-medium mb-1" style={{ color: '#F0EAFF' }}>Export for HubSpot</p>
          <p className="text-xs mb-2" style={{ color: '#5A3A8A' }}>Compatible with HubSpot Contact Import</p>
          <a
            href="/api/export/csv?format=hubspot"
            className="block w-full rounded-lg py-2.5 text-sm font-semibold text-white text-center"
            style={{ background: 'linear-gradient(135deg, #FF7A59, #FF5C35)' }}
          >
            ⬇ Download CSV
          </a>
        </div>
      </div>

      {/* CRM INTEGRATION */}
      <div
        className="mx-4 mt-3 p-4 rounded-xl"
        style={{ background: '#0D0A18', border: '0.5px solid #1A0E30' }}
      >
        <div className="flex items-center justify-between mb-1">
          <span className="gradient-text font-bold tracking-widest uppercase" style={{ fontSize: '9px' }}>
            CRM INTEGRATION
          </span>
          {hubspotConnected && (
            <span style={{ color: '#16A34A', fontSize: '11px', fontWeight: 600 }}>✅ Connected</span>
          )}
        </div>

        <div className="flex items-center gap-2 mb-3 mt-2">
          <span
            style={{ width: 28, height: 28, borderRadius: 8, background: '#FF7A59', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15 }}
          >
            🧡
          </span>
          <span style={{ color: '#F0EAFF', fontSize: 15, fontWeight: 600 }}>HubSpot</span>
        </div>

        <p className="text-xs mb-4 leading-snug" style={{ color: '#5A3A8A' }}>
          {hubspotConnected
            ? 'Contacts sync automatically after every scan.'
            : 'Automatically sync contacts to your HubSpot CRM after every scan.'}
        </p>

        {hubspotError && (
          <p className="text-xs mb-3 text-red-300">{hubspotError}</p>
        )}

        {hubspotConnected ? (
          <button
            onClick={disconnectHubspot}
            disabled={hubspotSaving}
            className="rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-40"
            style={{ border: '0.5px solid rgba(239,68,68,0.35)', color: '#EF4444' }}
          >
            {hubspotSaving ? 'Disconnecting...' : 'Disconnect'}
          </button>
        ) : (
          <a
            href="/api/auth/hubspot"
            className="block w-full rounded-lg py-3 text-sm font-semibold text-white text-center"
            style={{ background: 'linear-gradient(135deg, #FF7A59, #FF5C35)' }}
          >
            Connect HubSpot
          </a>
        )}

        <div style={{ borderTop: '0.5px solid #1A0E30', margin: '20px 0' }} />

        <div className="flex items-center justify-between mb-1">
          {salesforceConnected && (
            <span style={{ color: '#16A34A', fontSize: '11px', fontWeight: 600, marginLeft: 'auto' }}>
              ✅ Connected
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 mb-3 mt-2">
          <span
            style={{
              width: 28,
              height: 28,
              borderRadius: 8,
              background: '#0176D3',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 15,
            }}
          >
            ☁️
          </span>
          <span style={{ color: '#F0EAFF', fontSize: 15, fontWeight: 600 }}>Salesforce</span>
        </div>

        <p className="text-xs mb-4 leading-snug" style={{ color: '#5A3A8A' }}>
          {salesforceConnected
            ? 'Contacts sync automatically after every scan.'
            : 'Automatically sync contacts to your Salesforce CRM after every scan.'}
        </p>

        {salesforceError && (
          <p className="text-xs mb-3 text-red-300">{salesforceError}</p>
        )}

        {salesforceConnected ? (
          <button
            onClick={disconnectSalesforce}
            disabled={salesforceSaving}
            className="rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-40"
            style={{ border: '0.5px solid rgba(239,68,68,0.35)', color: '#EF4444' }}
          >
            {salesforceSaving ? 'Disconnecting...' : 'Disconnect'}
          </button>
        ) : (
          <a
            href="/api/auth/salesforce"
            className="block w-full rounded-lg py-3 text-sm font-semibold text-white text-center"
            style={{ background: 'linear-gradient(135deg, #0176D3, #0EA5E9)' }}
          >
            Connect Salesforce
          </a>
        )}
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
          {saving ? 'Saving...' : 'Save profile'}
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
            Saved ✓
          </motion.div>
        )}
      </AnimatePresence>
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
          className="flex-1 bg-transparent text-base outline-none text-right ml-auto"
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
