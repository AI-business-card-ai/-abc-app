'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClientComponent } from '@/lib/supabase'

export default function SettingsContent() {
  const supabase = useMemo(() => createClientComponent(), [])
  const [loading, setLoading] = useState(true)
  const [profile, setProfile] = useState<any>({})
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    const load = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return
        const { data } = await supabase
          .from('abc_profiles')
          .select('*')
          .eq('id', user.id)
          .maybeSingle()
        if (data) setProfile(data)
      } catch (e) {
        console.error(e)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [supabase])

  const save = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      await supabase.from('abc_profiles').upsert({ ...profile, id: user.id })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (e) {
      console.error(e)
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

      <div style={{ background: '#1a1a1a', borderRadius: '12px', border: '1px solid #2a2a2a', padding: '20px', marginBottom: '16px' }}>
        <div style={{ fontSize: '11px', color: '#00d4d4', letterSpacing: '0.08em', marginBottom: '16px' }}>YOUR CARD</div>
        {field('Full Name', 'full_name', 'David Bureš')}
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
          value={profile.goals || ''}
          onChange={(e) => setProfile({ ...profile, goals: e.target.value })}
          placeholder="e.g. Expo partners, B2B SaaS investors, EU market expansion..."
          rows={3}
          style={{ width: '100%', background: '#242424', border: '1px solid #2a2a2a', borderRadius: '8px', padding: '10px 14px', color: '#ffffff', fontSize: '13px', outline: 'none', resize: 'none' }}
        />
        {field('Your Product/Service', 'user_product', 'ABC AI Business Card — scan to CRM in 10 seconds')}
        {field('Target Customer (ICP)', 'user_icp', 'Sales Directors, Founders, B2B tech companies EU/US')}
      </div>

      <div style={{ background: '#1a1a1a', borderRadius: '12px', border: '1px solid #2a2a2a', padding: '20px', marginBottom: '16px' }}>
        <div style={{ fontSize: '11px', color: '#00d4d4', letterSpacing: '0.08em', marginBottom: '16px' }}>COMMUNICATION STYLE</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '16px' }}>
          {['Direct', 'Friendly', 'Formal', 'Casual'].map((style) => (
            <div
              key={style}
              role="button"
              tabIndex={0}
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
              onClick={() => setProfile({ ...profile, outreach_language: lang })}
              onKeyDown={(e) => e.key === 'Enter' && setProfile({ ...profile, outreach_language: lang })}
              style={{ padding: '10px', borderRadius: '8px', border: `1px solid ${profile.outreach_language === lang ? '#f0197d' : '#2a2a2a'}`, background: profile.outreach_language === lang ? 'rgba(240,25,125,0.1)' : '#242424', color: profile.outreach_language === lang ? '#f0197d' : '#555555', fontSize: '13px', textAlign: 'center', cursor: 'pointer' }}
            >
              {lang}
            </div>
          ))}
        </div>
      </div>

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
            value={profile.research_custom || ''}
            onChange={(e) => setProfile({ ...profile, research_custom: e.target.value })}
            placeholder="e.g. Find their booth number at Medica, check if they won any awards..."
            style={{ width: '100%', background: '#242424', border: '1px solid #2a2a2a', borderRadius: '8px', padding: '10px 14px', color: '#ffffff', fontSize: '13px', outline: 'none' }}
          />
        </div>
      </div>

      <button
        type="button"
        onClick={save}
        style={{ width: '100%', padding: '14px', background: saved ? '#00d4d4' : 'linear-gradient(135deg,#f0197d,#00d4d4)', border: 'none', borderRadius: '10px', color: '#fff', fontSize: '15px', fontWeight: '700', cursor: 'pointer' }}
      >
        {saved ? '✓ Saved!' : 'Save Profile'}
      </button>
    </div>
  )
}
