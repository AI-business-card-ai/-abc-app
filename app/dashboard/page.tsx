'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import CardQrModal from '@/components/card/CardQrModal'
import { CARD_PUBLIC_BASE } from '@/lib/card/types'
import { createClientComponent } from '@/lib/supabase'

export default function DashboardPage() {
  const router = useRouter()
  const supabase = useMemo(() => createClientComponent(), [])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [slug, setSlug] = useState<string | null>(null)
  const [published, setPublished] = useState(false)
  const [views, setViews] = useState(0)
  const [qrOpen, setQrOpen] = useState(false)

  useEffect(() => {
    let active = true
    ;(async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser()
        if (!user) {
          router.push('/login')
          return
        }

        const { data: profile, error: profileError } = await supabase
          .from('abc_profiles')
          .select('full_name, card_slug, card_published, user_name')
          .eq('id', user.id)
          .maybeSingle()

        if (profileError) throw profileError
        if (!active) return

        setName(profile?.full_name || 'ABC')
        setSlug(profile?.card_slug || profile?.user_name || null)
        setPublished(Boolean(profile?.card_published))

        const res = await fetch('/api/card/analytics')
        if (res.ok) {
          const data = (await res.json()) as { views?: number }
          if (active) setViews(data.views || 0)
        }
      } catch (err) {
        console.error('[dashboard] load failed:', err)
        if (active) setError('Nepodařilo se načíst dashboard.')
      } finally {
        if (active) setLoading(false)
      }
    })()
    return () => {
      active = false
    }
  }, [router, supabase])

  if (loading) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center" style={{ background: '#0f0f0f' }}>
        <div
          className="w-8 h-8 rounded-full border-2 border-transparent animate-spin"
          style={{ borderTopColor: '#00d4d4', borderRightColor: '#f0197d' }}
        />
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '24px 16px', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <h1 style={{ color: '#fff', fontSize: 22, fontWeight: 800, margin: '0 0 6px' }}>
        Ahoj, {name.split(' ')[0] || 'there'}
      </h1>
      <p style={{ color: '#999', margin: '0 0 20px', fontSize: 14 }}>Tvůj ABC přehled</p>

      {error ? <p style={{ color: '#f0197d', fontSize: 13 }}>{error}</p> : null}

      <div
        style={{
          background: '#1a1a1a',
          border: '1px solid #2a2a2a',
          borderRadius: 12,
          padding: 20,
          marginBottom: 16,
        }}
      >
        <div style={{ fontSize: 11, color: '#f0197d', letterSpacing: '0.08em', fontWeight: 700, marginBottom: 10 }}>
          MOJE VIZITKA
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
          <div>
            <p style={{ color: '#fff', fontWeight: 700, margin: '0 0 4px', fontSize: 16 }}>
              {published ? 'Veřejná karta' : 'Karta ještě není veřejná'}
            </p>
            <p style={{ color: '#999', fontSize: 13, margin: '0 0 8px' }}>
              {slug ? `${CARD_PUBLIC_BASE}/${slug}` : 'Nastav slug ve editoru vizitky'}
            </p>
            <p style={{ color: '#00d4d4', fontSize: 13, margin: 0, fontWeight: 600 }}>
              {views} zobrazení · posledních 30 dní
            </p>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 16 }}>
          <Link
            href="/profile/card"
            className="interactive"
            style={{
              textAlign: 'center',
              padding: 12,
              borderRadius: 10,
              border: '1px solid #2a2a2a',
              background: '#242424',
              color: '#fff',
              fontWeight: 700,
              fontSize: 13,
              textDecoration: 'none',
            }}
          >
            Upravit kartu
          </Link>
          <button
            type="button"
            className="interactive"
            disabled={!slug}
            onClick={() => setQrOpen(true)}
            style={{
              padding: 12,
              borderRadius: 10,
              border: 'none',
              background: slug ? 'linear-gradient(135deg,#f0197d,#00d4d4)' : '#2a2a2a',
              color: '#fff',
              fontWeight: 700,
              fontSize: 13,
              cursor: slug ? 'pointer' : 'not-allowed',
              opacity: slug ? 1 : 0.5,
            }}
          >
            Sdílet QR →
          </button>
        </div>
      </div>

      <Link
        href="/scan"
        className="interactive"
        style={{
          display: 'block',
          textAlign: 'center',
          padding: 14,
          borderRadius: 12,
          background: 'linear-gradient(135deg,#f0197d,#00d4d4)',
          color: '#fff',
          fontWeight: 700,
          textDecoration: 'none',
        }}
      >
        Přejít na sken →
      </Link>

      {slug ? <CardQrModal slug={slug} open={qrOpen} onClose={() => setQrOpen(false)} /> : null}
    </div>
  )
}
