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
        style={{ width: '100%', background: '#1a1d2e', border: '1px solid #2a2d3e', borderRadius: '8px', padding: '10px 14px', color: '#f0f0ff', fontSize: '13px', outline: 'none' }}
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
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '32px', padding: '20px', background: '#141628', borderRadius: '12px', border: '1px solid #2a2d3e' }}>
        <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: 'linear-gradient(135deg,#8b5cf6,#00d4d4)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '22px', fontWeight: '700', color: '#fff', flexShrink: 0 }}>
          {initials}
        </div>
        <div>
          <div style={{ fontSize: '18px', fontWeight: '700', color: '#f0f0ff' }}>{profile.full_name || 'Your Name'}</div>
          <div style={{ fontSize: '13px', color: '#6b7280', marginTop: '2px' }}>{profile.company || 'Your Company'} · {profile.role || 'Your Role'}</div>
        </div>
      </div>

      <div style={{ background: '#141628', borderRadius: '12px', border: '1px solid #2a2d3e', padding: '20px', marginBottom: '16px' }}>
        <div style={{ fontSize: '11px', color: '#00d4d4', letterSpacing: '0.08em', marginBottom: '16px' }}>YOUR CARD</div>
        {field('Full Name', 'full_name', 'David Bureš')}
        {field('Company', 'company', 'Apexpo')}
        {field('Role', 'role', 'CEO')}
        {field('Email', 'email', 'david@apexpo.com')}
        {field('Phone', 'phone', '+420 ...')}
        {field('LinkedIn URL', 'linkedin_url', 'linkedin.com/in/...')}
        {field('Website', 'website', 'apexpo.com')}
      </div>

      <div style={{ background: '#141628', borderRadius: '12px', border: '1px solid #2a2d3e', padding: '20px', marginBottom: '16px' }}>
        <div style={{ fontSize: '11px', color: '#00d4d4', letterSpacing: '0.08em', marginBottom: '16px' }}>YOUR GOALS</div>
        <label style={{ display: 'block', fontSize: '11px', color: '#6b7280', marginBottom: '6px' }}>What are you looking for?</label>
        <textarea
          value={profile.goals || ''}
          onChange={(e) => setProfile({ ...profile, goals: e.target.value })}
          placeholder="e.g. Expo partners, B2B SaaS investors, EU market expansion..."
          rows={3}
          style={{ width: '100%', background: '#1a1d2e', border: '1px solid #2a2d3e', borderRadius: '8px', padding: '10px 14px', color: '#f0f0ff', fontSize: '13px', outline: 'none', resize: 'none' }}
        />
        {field('Your Product/Service', 'user_product', 'ABC AI Business Card — scan to CRM in 10 seconds')}
        {field('Target Customer (ICP)', 'user_icp', 'Sales Directors, Founders, B2B tech companies EU/US')}
      </div>

      <div style={{ background: '#141628', borderRadius: '12px', border: '1px solid #2a2d3e', padding: '20px', marginBottom: '24px' }}>
        <div style={{ fontSize: '11px', color: '#00d4d4', letterSpacing: '0.08em', marginBottom: '16px' }}>COMMUNICATION STYLE</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '16px' }}>
          {['Direct', 'Friendly', 'Formal', 'Casual'].map((style) => (
            <div
              key={style}
              role="button"
              tabIndex={0}
              onClick={() => setProfile({ ...profile, communication_style: style.toLowerCase() })}
              onKeyDown={(e) => e.key === 'Enter' && setProfile({ ...profile, communication_style: style.toLowerCase() })}
              style={{ padding: '10px', borderRadius: '8px', border: `1px solid ${profile.communication_style === style.toLowerCase() ? '#00d4d4' : '#2a2d3e'}`, background: profile.communication_style === style.toLowerCase() ? 'rgba(0,212,212,0.1)' : '#1a1d2e', color: profile.communication_style === style.toLowerCase() ? '#00d4d4' : '#6b7280', fontSize: '13px', textAlign: 'center', cursor: 'pointer' }}
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
              style={{ padding: '10px', borderRadius: '8px', border: `1px solid ${profile.outreach_language === lang ? '#f0197d' : '#2a2d3e'}`, background: profile.outreach_language === lang ? 'rgba(240,25,125,0.1)' : '#1a1d2e', color: profile.outreach_language === lang ? '#f0197d' : '#6b7280', fontSize: '13px', textAlign: 'center', cursor: 'pointer' }}
            >
              {lang}
            </div>
          ))}
        </div>
      </div>

      <button
        type="button"
        onClick={save}
        style={{ width: '100%', padding: '14px', background: saved ? '#00d4d4' : 'linear-gradient(135deg,#f0197d,#8b5cf6)', border: 'none', borderRadius: '10px', color: '#fff', fontSize: '15px', fontWeight: '700', cursor: 'pointer' }}
      >
        {saved ? '✓ Saved!' : 'Save Profile'}
      </button>
    </div>
  )
}
