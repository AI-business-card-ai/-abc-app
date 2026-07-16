'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClientComponent } from '@/lib/supabase'
import { normalizeAbcProfile } from '@/lib/profile-defaults'
import { getScanLimitForPlan } from '@/lib/scan-limits'
import { PLAN_LABELS, type PaidPlan } from '@/lib/stripe-prices'
import ConnectionsSection from '@/components/settings/ConnectionsSection'
import DigitalCardQrSection from '@/components/settings/DigitalCardQrSection'
import type { ABCProfile } from '@/lib/types'

export default function SettingsContent() {
  const router = useRouter()
  const supabase = useMemo(() => createClientComponent(), [])
  const [loading, setLoading] = useState(true)
  const [profile, setProfile] = useState<any>({})
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loggingOut, setLoggingOut] = useState(false)
  const [portalLoading, setPortalLoading] = useState(false)
  const [subError, setSubError] = useState<string | null>(null)

  const loadProfile = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data, error: loadError } = await supabase
        .from('abc_profiles')
        .select('*')
        .eq('id', user.id)
        .maybeSingle()
      if (loadError) {
        console.error('Profile load error:', loadError)
        setError(loadError.message)
      }
      if (data) {
        const normalized = normalizeAbcProfile(data as Partial<ABCProfile>, user.email)
        // user_name is a legacy column that used to store raw full names during
        // onboarding; some rows may still hold a non-slug value. Treat those as
        // unset so the form doesn't load a value that would immediately fail
        // slug validation on the next save.
        if (normalized.user_name && !/^[a-z0-9-]{3,30}$/.test(normalized.user_name)) {
          normalized.user_name = ''
        }
        setProfile(normalized)
      }
    } catch (e) {
      console.error('Profile load exception:', e)
    } finally {
      setLoading(false)
    }
  }, [supabase])

  useEffect(() => {
    void loadProfile()
  }, [loadProfile])

  const save = async () => {
    try {
      setError(null)
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setError('Not logged in')
        return
      }

      const username = (profile.user_name || '').trim().toLowerCase()
      if (username && !/^[a-z0-9-]{3,30}$/.test(username)) {
        setError('Username must be 3-30 characters: lowercase letters, numbers, and hyphens only')
        return
      }

      const rawStyle = profile.communication_style || 'direct'
      const communicationStyle = ['direct', 'formal', 'casual'].includes(rawStyle)
        ? rawStyle
        : 'direct'

      const dataToSave = {
        id: user.id,
        user_name: username || null,
        full_name: profile.full_name || null,
        company: profile.company || null,
        role: profile.role || null,
        email: profile.email || null,
        phone: profile.phone || null,
        linkedin_url: profile.linkedin_url || null,
        website: profile.website || null,
        goals: profile.goals || null,
        product_description: profile.product_description || null,
        icp: profile.icp || null,
        communication_style: communicationStyle,
        outreach_language: profile.outreach_language || 'EN',
        message_length: profile.message_length || 'medium',
        message_goal: profile.message_goal || 'Schedule a meeting',
        research_company_size: profile.research_company_size || false,
        research_revenue: profile.research_revenue || false,
        research_location: profile.research_location || false,
        research_news: profile.research_news || false,
        research_events: profile.research_events || false,
        research_linkedin: profile.research_linkedin || false,
        research_funding: profile.research_funding || false,
        research_competitors: profile.research_competitors || false,
        research_tech: profile.research_tech || false,
        research_hiring: profile.research_hiring || false,
        research_products: profile.research_products || false,
        research_pain_points: profile.research_pain_points || false,
        research_custom: profile.research_custom || null,
      }

      console.log('Saving profile:', dataToSave)

      const { error: saveError } = await supabase
        .from('abc_profiles')
        .upsert(dataToSave, { onConflict: 'id' })

      if (saveError) {
        console.error('Save error:', saveError)
        if (saveError.code === '23505' && saveError.message.includes('user_name')) {
          setError('This username is already taken')
        } else {
          setError(saveError.message)
        }
        return
      }

      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (err: unknown) {
      console.error('Save exception:', err)
      setError(err instanceof Error ? err.message : 'Save failed')
    }
  }

  async function handleLogout() {
    setLoggingOut(true)
    try {
      const { error: signOutError } = await supabase.auth.signOut()
      if (signOutError) throw signOutError
      router.push('/login')
      router.refresh()
    } catch (err) {
      console.error('Logout error:', err)
      setError(err instanceof Error ? err.message : 'Sign out failed.')
      setLoggingOut(false)
    }
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '60px', color: '#00d4d4' }}>
        Loading...
      </div>
    )
  }

  const field = (label: string, key: string, placeholder = '') => (
    <div style={{ marginBottom: '16px' }}>
      <label style={{ display: 'block', fontSize: '11px', color: '#00d4d4', marginBottom: '6px', letterSpacing: '0.08em' }}>{label}</label>
      <input
        className="interactive-input"
        value={profile[key] || ''}
        onChange={(e) => setProfile({ ...profile, [key]: e.target.value })}
        placeholder={placeholder}
        style={{ width: '100%', background: '#242424', border: '1px solid #2a2a2a', borderRadius: '8px', padding: '10px 14px', color: '#ffffff', fontSize: '13px', outline: 'none' }}
      />
    </div>
  )

  const initials = (profile.full_name || 'U')
    .split(' ')
    .map((n: string) => n[0])
    .filter(Boolean)
    .join('')
    .slice(0, 2)
    .toUpperCase() || 'U'

  const currentPlan = (profile.plan || 'free') as ABCProfile['plan']
  const planLabel =
    currentPlan === 'free'
      ? 'Free'
      : currentPlan === 'INTERNAL_TEST'
        ? 'Internal Test'
        : PLAN_LABELS[currentPlan as PaidPlan] ?? currentPlan
  const scanLimit = getScanLimitForPlan(currentPlan)
  const scansUsed = profile.scans_used ?? 0
  const hasPaidPlan = currentPlan !== 'free' && currentPlan !== 'INTERNAL_TEST'
  const hasStripeCustomer = Boolean(profile.stripe_customer_id)

  async function openBillingPortal() {
    setSubError(null)
    setPortalLoading(true)
    try {
      const res = await fetch('/api/stripe/portal', { method: 'POST' })
      const data = await res.json()
      if (!res.ok || !data.url) {
        throw new Error(data.error || 'Could not open billing portal')
      }
      window.location.href = data.url
    } catch (err) {
      setSubError(err instanceof Error ? err.message : 'Could not open billing portal')
      setPortalLoading(false)
    }
  }

  return (
    <div style={{ maxWidth: '600px', margin: '0 auto', padding: '24px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '32px', padding: '20px', background: '#1a1a1a', borderRadius: '12px', border: '1px solid #2a2a2a' }}>
        <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: 'linear-gradient(135deg,#f0197d,#00d4d4)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '22px', fontWeight: '700', color: '#fff', flexShrink: 0 }}>
          {initials}
        </div>
        <div>
          <div style={{ fontSize: '18px', fontWeight: '700', color: '#ffffff' }}>{profile.full_name || 'Your Name'}</div>
          <div style={{ fontSize: '13px', color: '#555555', marginTop: '2px' }}>{profile.company || 'Your Company'} · {profile.role || 'Your Role'}</div>
        </div>
      </div>

      <DigitalCardQrSection />

      <div style={{ background: '#1a1a1a', borderRadius: '12px', border: '1px solid #2a2a2a', padding: '20px', marginBottom: '16px' }}>
        <div style={{ fontSize: '11px', color: '#f0197d', letterSpacing: '0.08em', marginBottom: '12px' }}>SUBSCRIPTION</div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
          <span style={{ fontSize: '16px', fontWeight: 700, color: '#ffffff' }}>{planLabel}</span>
          {hasPaidPlan && (
            <span style={{ fontSize: '11px', color: '#22c55e', fontWeight: 600 }}>Active</span>
          )}
        </div>
        <p style={{ fontSize: '13px', color: '#555555', margin: '0 0 16px' }}>
          {scansUsed} / {scanLimit} lifetime scans used
        </p>
        {subError && (
          <p style={{ fontSize: '12px', color: '#f0197d', marginBottom: 12 }}>{subError}</p>
        )}
        {hasPaidPlan && hasStripeCustomer ? (
          <button
            type="button"
            className="interactive"
            disabled={portalLoading}
            onClick={() => void openBillingPortal()}
            style={{
              width: '100%',
              padding: '12px',
              borderRadius: '10px',
              border: '1px solid rgba(0, 212, 212, 0.4)',
              background: 'rgba(0, 212, 212, 0.1)',
              color: '#00d4d4',
              fontWeight: 700,
              fontSize: '14px',
              cursor: portalLoading ? 'wait' : 'pointer',
            }}
          >
            {portalLoading ? 'Opening…' : 'Manage subscription'}
          </button>
        ) : (
          <button
            type="button"
            className="interactive-primary"
            onClick={() => router.push('/pricing')}
            style={{
              width: '100%',
              padding: '12px',
              borderRadius: '10px',
              border: 'none',
              background: 'linear-gradient(135deg, #f0197d, #00d4d4)',
              color: '#ffffff',
              fontWeight: 700,
              fontSize: '14px',
              cursor: 'pointer',
            }}
          >
            Upgrade
          </button>
        )}
      </div>

      <div style={{ background: '#1a1a1a', borderRadius: '12px', border: '1px solid #2a2a2a', padding: '20px', marginBottom: '16px' }}>
        <div style={{ fontSize: '11px', color: '#00d4d4', letterSpacing: '0.08em', marginBottom: '16px' }}>YOUR CARD</div>
        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', fontSize: '11px', color: '#00d4d4', marginBottom: '6px', letterSpacing: '0.08em' }}>Username</label>
          <div style={{ display: 'flex', alignItems: 'center', background: '#242424', border: '1px solid #2a2a2a', borderRadius: '8px', overflow: 'hidden' }}>
            <span style={{ padding: '10px 0 10px 14px', color: '#555555', fontSize: '13px', flexShrink: 0 }}>abccard.io/u/</span>
            <input
              value={profile.user_name || ''}
              onChange={(e) => setProfile({ ...profile, user_name: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })}
              placeholder="janesmith"
              maxLength={30}
              style={{ flex: 1, background: 'transparent', border: 'none', padding: '10px 14px 10px 2px', color: '#ffffff', fontSize: '13px', outline: 'none' }}
            />
          </div>
          <p style={{ fontSize: '11px', color: '#555555', margin: '6px 0 0' }}>3-30 characters: lowercase letters, numbers, hyphens. Used for your public card link.</p>
        </div>
        {field('Full Name', 'full_name', 'Jane Smith')}
        {field('Company', 'company', 'Apexpo')}
        {field('Role', 'role', 'CEO')}
        {field('Email', 'email', 'david@apexpo.com')}
        {field('Phone', 'phone', '+420 ...')}
        {field('LinkedIn URL', 'linkedin_url', 'linkedin.com/in/...')}
        {field('Website', 'website', 'apexpo.com')}
      </div>

      <div style={{ background: '#1a1a1a', borderRadius: '12px', border: '1px solid #2a2a2a', padding: '20px', marginBottom: '16px' }}>
        <div style={{ fontSize: '11px', color: '#00d4d4', letterSpacing: '0.08em', marginBottom: '16px' }}>YOUR GOALS</div>
        <label style={{ display: 'block', fontSize: '11px', color: '#555555', marginBottom: '6px' }}>What are you looking for?</label>
        <textarea
          className="interactive-input"
          value={profile.goals || ''}
          onChange={(e) => setProfile({ ...profile, goals: e.target.value })}
          placeholder="e.g. Expo partners, B2B SaaS investors, EU market expansion..."
          rows={3}
          style={{ width: '100%', background: '#242424', border: '1px solid #2a2a2a', borderRadius: '8px', padding: '10px 14px', color: '#ffffff', fontSize: '13px', outline: 'none', resize: 'none' }}
        />
        {field('Your Product/Service', 'product_description', 'ABC AI Business Card — scan to CRM in 10 seconds')}
        {field('Target Customer (ICP)', 'icp', 'Sales Directors, Founders, B2B tech companies EU/US')}
      </div>

      <div style={{ background: '#1a1a1a', borderRadius: '12px', border: '1px solid #2a2a2a', padding: '20px', marginBottom: '16px' }}>
        <div style={{ fontSize: '11px', color: '#00d4d4', letterSpacing: '0.08em', marginBottom: '16px' }}>COMMUNICATION STYLE</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '16px' }}>
          {['Direct', 'Friendly', 'Formal', 'Casual'].map((style) => (
            <div
              key={style}
              role="button"
              tabIndex={0}
              className="interactive"
              onClick={() => setProfile({ ...profile, communication_style: style.toLowerCase() })}
              onKeyDown={(e) => e.key === 'Enter' && setProfile({ ...profile, communication_style: style.toLowerCase() })}
              style={{ padding: '10px', borderRadius: '8px', border: `1px solid ${profile.communication_style === style.toLowerCase() ? '#00d4d4' : '#2a2a2a'}`, background: profile.communication_style === style.toLowerCase() ? 'rgba(0,212,212,0.1)' : '#242424', color: profile.communication_style === style.toLowerCase() ? '#00d4d4' : '#555555', fontSize: '13px', textAlign: 'center', cursor: 'pointer' }}
            >
              {style}
            </div>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
          {['EN', 'CZ', 'DE', 'SK'].map((lang) => (
            <div
              key={lang}
              role="button"
              tabIndex={0}
              className="interactive"
              onClick={() => setProfile({ ...profile, outreach_language: lang })}
              onKeyDown={(e) => e.key === 'Enter' && setProfile({ ...profile, outreach_language: lang })}
              style={{ padding: '10px', borderRadius: '8px', border: `1px solid ${profile.outreach_language === lang ? '#f0197d' : '#2a2a2a'}`, background: profile.outreach_language === lang ? 'rgba(240,25,125,0.1)' : '#242424', color: profile.outreach_language === lang ? '#f0197d' : '#555555', fontSize: '13px', textAlign: 'center', cursor: 'pointer' }}
            >
              {lang}
            </div>
          ))}
        </div>
      </div>

      <ConnectionsSection profile={profile} onRefresh={loadProfile} />

      {/* AI MESSAGE SETTINGS */}
      <div style={{ background: '#1a1a1a', borderRadius: '12px', border: '1px solid #2a2a2a', padding: '20px', marginBottom: '16px' }}>
        <div style={{ fontSize: '11px', color: '#f0197d', letterSpacing: '0.08em', marginBottom: '4px' }}>AI MESSAGE SETTINGS</div>
        <div style={{ fontSize: '12px', color: '#555555', marginBottom: '16px' }}>How AI writes messages on your behalf</div>

        <label style={{ display: 'block', fontSize: '11px', color: '#555555', marginBottom: '6px' }}>Message goal</label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '16px' }}>
          {['Schedule a meeting', 'Get on a call', 'Send our deck', 'Start a conversation'].map((goal) => (
            <div
              key={goal}
              role="button"
              tabIndex={0}
              className="interactive"
              onClick={() => setProfile({ ...profile, message_goal: goal })}
              onKeyDown={(e) => e.key === 'Enter' && setProfile({ ...profile, message_goal: goal })}
              style={{
                padding: '10px',
                borderRadius: '8px',
                border: `1px solid ${profile.message_goal === goal ? '#f0197d' : '#2a2a2a'}`,
                background: profile.message_goal === goal ? 'rgba(240,25,125,0.08)' : '#242424',
                color: profile.message_goal === goal ? '#f0197d' : '#555555',
                fontSize: '12px',
                textAlign: 'center' as const,
                cursor: 'pointer',
              }}
            >
              {goal}
            </div>
          ))}
        </div>

        <label style={{ display: 'block', fontSize: '11px', color: '#555555', marginBottom: '6px' }}>Message length</label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
          {['Short', 'Medium', 'Long'].map((len) => (
            <div
              key={len}
              role="button"
              tabIndex={0}
              className="interactive"
              onClick={() => setProfile({ ...profile, message_length: len.toLowerCase() })}
              onKeyDown={(e) => e.key === 'Enter' && setProfile({ ...profile, message_length: len.toLowerCase() })}
              style={{
                padding: '10px',
                borderRadius: '8px',
                border: `1px solid ${profile.message_length === len.toLowerCase() ? '#00d4d4' : '#2a2a2a'}`,
                background: profile.message_length === len.toLowerCase() ? 'rgba(0,212,212,0.08)' : '#242424',
                color: profile.message_length === len.toLowerCase() ? '#00d4d4' : '#555555',
                fontSize: '12px',
                textAlign: 'center' as const,
                cursor: 'pointer',
              }}
            >
              {len}
            </div>
          ))}
        </div>
      </div>

      {/* WHAT TO RESEARCH */}
      <div style={{ background: '#1a1a1a', borderRadius: '12px', border: '1px solid #2a2a2a', padding: '20px', marginBottom: '16px' }}>
        <div style={{ fontSize: '11px', color: '#00d4d4', letterSpacing: '0.08em', marginBottom: '4px' }}>WHAT TO RESEARCH</div>
        <div style={{ fontSize: '12px', color: '#555555', marginBottom: '16px' }}>AI will automatically find this about every contact you scan</div>

        {[
          { key: 'research_company_size', label: '👥 Company size & headcount' },
          { key: 'research_revenue', label: '💰 Revenue & financials' },
          { key: 'research_location', label: '📍 HQ location & offices' },
          { key: 'research_news', label: '📰 Latest news & press releases' },
          { key: 'research_events', label: '🎪 Trade shows & conferences they attend' },
          { key: 'research_linkedin', label: '💼 LinkedIn activity & recent posts' },
          { key: 'research_funding', label: '🚀 Funding rounds & investors' },
          { key: 'research_competitors', label: '⚔️ Competitors & market position' },
          { key: 'research_tech', label: '🔧 Technology stack they use' },
          { key: 'research_hiring', label: '📋 Current job openings & hiring plans' },
          { key: 'research_products', label: '📦 Products & services they offer' },
          { key: 'research_pain_points', label: '🎯 Pain points & challenges' },
        ].map((item) => (
          <div
            key={item.key}
            role="button"
            tabIndex={0}
            className="interactive"
            onClick={() => setProfile({ ...profile, [item.key]: !profile[item.key] })}
            onKeyDown={(e) => e.key === 'Enter' && setProfile({ ...profile, [item.key]: !profile[item.key] })}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              padding: '12px',
              marginBottom: '8px',
              borderRadius: '8px',
              border: `1px solid ${profile[item.key] ? '#00d4d4' : '#2a2a2a'}`,
              background: profile[item.key] ? 'rgba(0,212,212,0.06)' : '#242424',
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
          >
            <div
              style={{
                width: '20px',
                height: '20px',
                borderRadius: '5px',
                border: `2px solid ${profile[item.key] ? '#00d4d4' : '#3a3d4e'}`,
                background: profile[item.key] ? '#00d4d4' : 'transparent',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                fontSize: '12px',
              }}
            >
              {profile[item.key] ? '✓' : ''}
            </div>
            <span style={{ fontSize: '13px', color: profile[item.key] ? '#ffffff' : '#555555' }}>
              {item.label}
            </span>
          </div>
        ))}

        <div style={{ marginTop: '8px' }}>
          <label style={{ display: 'block', fontSize: '11px', color: '#555555', marginBottom: '6px' }}>
            + Custom research request
          </label>
          <input
            className="interactive-input"
            value={profile.research_custom || ''}
            onChange={(e) => setProfile({ ...profile, research_custom: e.target.value })}
            placeholder="e.g. Find their booth number at Medica, check if they won any awards..."
            style={{ width: '100%', background: '#242424', border: '1px solid #2a2a2a', borderRadius: '8px', padding: '10px 14px', color: '#ffffff', fontSize: '13px', outline: 'none' }}
          />
        </div>
      </div>

      <button
        type="button"
        className="interactive-primary"
        onClick={save}
        style={{ width: '100%', padding: '14px', background: saved ? '#00d4d4' : 'linear-gradient(135deg,#f0197d,#00d4d4)', border: 'none', borderRadius: '10px', color: '#fff', fontSize: '15px', fontWeight: '700', cursor: 'pointer' }}
      >
        {saved ? '✓ Saved!' : 'Save Profile'}
      </button>
      {error && (
        <p style={{ marginTop: '12px', fontSize: '13px', color: '#f87171', textAlign: 'center' }}>
          {error}
        </p>
      )}

      <div style={{ marginTop: '32px', paddingTop: '24px', borderTop: '1px solid #2a2a2a' }}>
        <button
          type="button"
          className="interactive"
          onClick={() => void handleLogout()}
          disabled={loggingOut}
          style={{
            width: '100%',
            padding: '14px',
            borderRadius: '10px',
            border: '1px solid rgba(239, 68, 68, 0.35)',
            background: 'transparent',
            color: '#ef4444',
            fontSize: '14px',
            fontWeight: 600,
            cursor: loggingOut ? 'wait' : 'pointer',
            opacity: loggingOut ? 0.6 : 1,
          }}
        >
          {loggingOut ? 'Signing out…' : 'Sign out'}
        </button>
      </div>
    </div>
  )
}
