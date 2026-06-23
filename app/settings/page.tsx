'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
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
import BottomNav from '@/components/ui/BottomNav'
import {
  DEFAULT_RESEARCH_PREFERENCES,
  RESEARCH_PREFERENCE_OPTIONS,
} from '@/lib/research'
import type { ABCProfile } from '@/lib/types'

const STYLES: { key: ABCProfile['communication_style']; label: string }[] = [
  { key: 'direct', label: 'Direct' },
  { key: 'formal', label: 'Formal' },
  { key: 'casual', label: 'Casual' },
]
const LANGUAGES = ['EN', 'CZ', 'DE', 'Mix']

const EMPTY: Omit<ABCProfile, 'id'> = {
  full_name: '', company: '', role: '', email: '', phone: '', linkedin_url: '', website: '',
  avatar_url: '',
  communication_style: 'direct', outreach_language: 'EN', goals: '', plan: 'free', scans_used: 0, scans_limit: 30,
  research_preferences: [...DEFAULT_RESEARCH_PREFERENCES],
  custom_questions: '',
  hubspot_api_key: null,
  hubspot_access_token: null,
  hubspot_refresh_token: null,
  hubspot_portal_id: null,
  hubspot_connected_at: null,
  salesforce_access_token: null,
  salesforce_refresh_token: null,
  salesforce_instance_url: null,
  salesforce_connected_at: null,
  webhook_url: null,
}

const chipStyle = (active: boolean): React.CSSProperties =>
  active
    ? { border: '0.5px solid #7C3AED', color: '#A78BFA', background: '#1A0A2E' }
    : { border: '0.5px solid #1A0E30', color: '#3A2060', background: 'transparent' }

export default function SettingsPage() {
  const router = useRouter()
  const supabase = createClientComponent()
  const photoInputRef = useRef<HTMLInputElement>(null)

  const [userId, setUserId] = useState<string | null>(null)
  const [profile, setProfile] = useState<Omit<ABCProfile, 'id'>>(EMPTY)
  const [loading, setLoading] = useState(true)
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
  const [webhookUrl, setWebhookUrl] = useState('')
  const [webhookSending, setWebhookSending] = useState(false)
  const [webhookError, setWebhookError] = useState<string | null>(null)

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
        setProfile({
          ...EMPTY,
          ...rest,
          research_preferences: rest.research_preferences?.length
            ? rest.research_preferences
            : [...DEFAULT_RESEARCH_PREFERENCES],
          custom_questions: rest.custom_questions ?? '',
        })
        setHubspotConnected(!!rest.hubspot_access_token)
        setSalesforceConnected(!!rest.salesforce_access_token)
        setWebhookUrl(rest.webhook_url ?? '')
      } else {
        setProfile((p) => ({ ...p, email: user.email ?? '' }))
      }
      setLoading(false)
    })()
    return () => { active = false }
  }, [router, supabase])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const crm = params.get('crm')
    if (crm === 'hubspot-connected') {
      setHubspotConnected(true)
      showToast()
      router.replace('/settings')
    } else if (crm === 'hubspot-error') {
      setHubspotError('HubSpot connection failed. Please try again.')
      router.replace('/settings')
    } else if (crm === 'salesforce-connected') {
      setSalesforceConnected(true)
      showToast()
      router.replace('/settings')
    } else if (crm === 'salesforce-error') {
      setSalesforceError('Salesforce connection failed. Please try again.')
      router.replace('/settings')
    }
  }, [router])

  function update<K extends keyof typeof profile>(key: K, value: (typeof profile)[K]) {
    setProfile((p) => ({ ...p, [key]: value }))
  }

  function toggleResearchPreference(key: string) {
    setProfile((p) => {
      const current = p.research_preferences ?? [...DEFAULT_RESEARCH_PREFERENCES]
      const next = current.includes(key)
        ? current.filter((k) => k !== key)
        : [...current, key]
      return { ...p, research_preferences: next }
    })
  }

  function showToast() {
    setToast(true)
    setTimeout(() => setToast(false), 3000)
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
        communication_style: profile.communication_style,
        outreach_language: profile.outreach_language,
        goals: profile.goals || null,
        plan: profile.plan,
        scans_used: profile.scans_used,
        scans_limit: profile.scans_limit,
        research_preferences: profile.research_preferences ?? [...DEFAULT_RESEARCH_PREFERENCES],
        custom_questions: profile.custom_questions || null,
        webhook_url: webhookUrl || null,
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
      const json = await res.json()
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
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.error || 'Failed to disconnect')
      setSalesforceConnected(false)
      showToast()
    } catch (err) {
      setSalesforceError(err instanceof Error ? err.message : 'Failed to disconnect')
    } finally {
      setSalesforceSaving(false)
    }
  }

  async function sendWebhookExport() {
    if (!webhookUrl.trim()) {
      setWebhookError('Enter a webhook URL first')
      return
    }
    setWebhookSending(true)
    setWebhookError(null)
    try {
      const res = await fetch('/api/export/webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ webhookUrl: webhookUrl.trim() }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.error || json.details || 'Webhook failed')
      if (userId) {
        await supabase.from('abc_profiles').update({ webhook_url: webhookUrl.trim() }).eq('id', userId)
      }
      showToast()
    } catch (err) {
      setWebhookError(err instanceof Error ? err.message : 'Webhook failed')
    } finally {
      setWebhookSending(false)
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
  const subtitle = [profile.company, profile.role].filter(Boolean).join(' · ') || 'Company · Role'

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

        {/* Avatar 64px with upload */}
        <button
          onClick={() => photoInputRef.current?.click()}
          disabled={uploading}
          className="relative rounded-full p-[2px]"
          style={{ background: 'linear-gradient(135deg, #A78BFA, #38BDF8)' }}
        >
          {profile.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={profile.avatar_url}
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
          value={profile.full_name ?? ''}
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
            value={profile.company ?? ''}
            onChange={(e) => update('company', e.target.value)}
            placeholder="Company"
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
          value={profile.email ?? ''}
          fieldKey="email"
          editing={editingField}
          onEdit={setEditingField}
          onChange={(v) => update('email', v)}
          placeholder="email@company.com"
        />
        <VizitkaRow
          icon={<IconPhone size={16} />}
          label="Phone"
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
          placeholder="company.com"
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

      {/* 3. GOALS */}
      <div
        className="mx-4 mt-3 p-4 rounded-xl"
        style={{ background: '#0D0A18', border: '0.5px solid #1A0E30' }}
      >
        <span className="gradient-text font-bold tracking-widest uppercase block mb-2" style={{ fontSize: '9px' }}>
          GOALS
        </span>
        <textarea
          value={profile.goals ?? ''}
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
          {RESEARCH_PREFERENCE_OPTIONS.map((opt) => {
            const checked = (profile.research_preferences ?? DEFAULT_RESEARCH_PREFERENCES).includes(opt.key)
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
          value={profile.custom_questions ?? ''}
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
              style={chipStyle(profile.communication_style === s.key)}
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
              style={chipStyle(profile.outreach_language === l)}
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
        <span className="gradient-text font-bold tracking-widest uppercase block mb-3" style={{ fontSize: '9px' }}>
          EXPORT CONTACTS
        </span>

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

        <div>
          <p className="text-sm font-medium mb-1" style={{ color: '#F0EAFF' }}>Webhook URL (Make.com / Zapier)</p>
          <p className="text-xs mb-2" style={{ color: '#5A3A8A' }}>
            Sends all contacts as JSON to your automation
          </p>
          <input
            value={webhookUrl}
            onChange={(e) => setWebhookUrl(e.target.value)}
            placeholder="https://hook.make.com/..."
            className="w-full rounded-lg px-3 py-2.5 text-sm outline-none mb-2"
            style={{ background: '#111', border: '0.5px solid #1A0E30', color: '#F0EAFF' }}
          />
          {webhookError && (
            <p className="text-xs mb-2 text-red-300">{webhookError}</p>
          )}
          <button
            onClick={sendWebhookExport}
            disabled={webhookSending}
            className="w-full rounded-lg py-2.5 text-sm font-semibold text-white disabled:opacity-40"
            style={{ background: 'linear-gradient(135deg, #7C3AED, #0EA5E9)' }}
          >
            {webhookSending ? 'Sending...' : 'Send All Contacts'}
          </button>
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
