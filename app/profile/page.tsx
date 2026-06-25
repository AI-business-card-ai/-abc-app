'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClientComponent } from '@/lib/supabase'
import ErrorBoundary from '@/components/ui/ErrorBoundary'
import SettingsPage from '@/app/settings/page'
import type { ABCProfile } from '@/lib/types'
import type { User } from '@supabase/supabase-js'

export default function ProfilePage() {
  const router = useRouter()
  const supabase = useMemo(() => createClientComponent(), [])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [profile, setProfile] = useState<ABCProfile | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let active = true

    const load = async () => {
      setLoading(true)
      setError(null)

      try {
        const { data: { session }, error: sessionError } = await supabase.auth.getSession()
        if (sessionError) throw sessionError

        if (!session) {
          if (active) {
            setUser(null)
            setProfile(null)
            router.push('/login')
          }
          return
        }

        if (!active) return
        setUser(session.user)

        const { data, error: dbError } = await supabase
          .from('abc_profiles')
          .select('*')
          .eq('id', session.user.id)
          .maybeSingle()

        if (dbError) {
          console.error('[profile] abc_profiles query failed:', dbError)
          throw dbError
        }

        if (!active) return
        setProfile((data as ABCProfile | null) ?? null)
      } catch (err: unknown) {
        if (!active) return
        const message = err instanceof Error ? err.message : 'Failed to load profile'
        console.error('[profile] Profile load error:', err)
        setError(message)
        setProfile(null)
      } finally {
        if (active) setLoading(false)
      }
    }

    load()
    return () => { active = false }
  }, [router, supabase, reloadKey])

  if (loading) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
          background: '#0d0f1a',
          color: '#00d4d4',
          fontSize: '14px',
        }}
      >
        Loading profile...
      </div>
    )
  }

  if (error) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '16px',
          height: '100vh',
          background: '#0d0f1a',
          color: '#f0197d',
          fontSize: '14px',
          padding: '24px',
          textAlign: 'center',
        }}
      >
        <p>Error: {error}</p>
        <button
          type="button"
          onClick={() => setReloadKey((k) => k + 1)}
          style={{
            background: 'rgba(0,212,212,0.1)',
            border: '1px solid rgba(0,212,212,0.4)',
            color: '#00d4d4',
            borderRadius: '12px',
            padding: '12px 20px',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Try again
        </button>
      </div>
    )
  }

  if (!user) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
          background: '#0d0f1a',
          color: '#8892b0',
          fontSize: '14px',
        }}
      >
        Redirecting to login...
      </div>
    )
  }

  // profile is null for new users — full form still renders via SettingsContent
  return (
    <ErrorBoundary>
      {!profile && (
        <div
          className="mx-4 mt-4 rounded-xl px-4 py-3 text-sm"
          style={{ background: 'rgba(0,212,212,0.08)', border: '1px solid rgba(0,212,212,0.2)', color: '#8892b0' }}
        >
          Welcome! Set up your profile below — all fields are optional until you save.
        </div>
      )}
      <SettingsPage />
    </ErrorBoundary>
  )
}
