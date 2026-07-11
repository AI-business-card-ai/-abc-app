'use client'

import { Suspense, useEffect, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { createClientComponent } from '@/lib/supabase'
import { getScanLimitForPlan } from '@/lib/scan-limits'
import { PLAN_LABELS, type PaidPlan } from '@/lib/stripe-prices'

const COLORS = {
  bg: '#0f0f0f',
  cyan: '#00d4d4',
  pink: '#f0197d',
  text: '#ffffff',
  muted: '#999999',
}

function SuccessContent() {
  const searchParams = useSearchParams()
  const supabase = createClientComponent()
  const [plan, setPlan] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    const sessionId = searchParams.get('session_id')

    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!active) return

      if (!user) {
        setLoading(false)
        return
      }

      if (sessionId) {
        try {
          const res = await fetch(`/api/stripe/session?session_id=${encodeURIComponent(sessionId)}`)
          if (res.ok) {
            const data = await res.json()
            if (data.plan && active) {
              setPlan(data.plan)
              setLoading(false)
              return
            }
          }
        } catch {
          // fall through to profile
        }
      }

      const { data: profile } = await supabase
        .from('abc_profiles')
        .select('plan')
        .eq('id', user.id)
        .maybeSingle()

      if (active) {
        setPlan(profile?.plan ?? 'starter')
        setLoading(false)
      }
    })()

    return () => {
      active = false
    }
  }, [searchParams, supabase])

  const planKey = (plan && plan !== 'free' ? plan : 'starter') as PaidPlan
  const planLabel = PLAN_LABELS[planKey] ?? plan ?? 'Starter'
  const scanLimit = getScanLimitForPlan(planKey)

  return (
    <div
      style={{
        minHeight: '100vh',
        background: COLORS.bg,
        color: COLORS.text,
        fontFamily: 'system-ui, -apple-system, sans-serif',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px 20px',
      }}
    >
      <div style={{ maxWidth: 420, width: '100%', textAlign: 'center' }}>
        <p style={{ fontSize: 48, margin: '0 0 16px' }}>✓</p>
        <h1 style={{ fontSize: 28, fontWeight: 800, margin: '0 0 12px' }}>
          Payment successful!
        </h1>
        {loading ? (
          <p style={{ color: COLORS.muted, marginBottom: 32 }}>Activating your plan…</p>
        ) : (
          <p style={{ color: COLORS.muted, marginBottom: 8, fontSize: 16 }}>
            Your <strong style={{ color: COLORS.cyan }}>{planLabel}</strong> plan is now active.
          </p>
        )}
        {!loading && (
          <p style={{ color: COLORS.muted, marginBottom: 32, fontSize: 14 }}>
            You can scan up to <strong style={{ color: COLORS.text }}>{scanLimit}</strong> contacts.
          </p>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Link
            href="/scan"
            style={{
              display: 'block',
              padding: '14px 20px',
              borderRadius: 12,
              fontWeight: 700,
              fontSize: 15,
              textDecoration: 'none',
              background: 'linear-gradient(135deg, #f0197d, #00d4d4)',
              color: '#ffffff',
            }}
          >
            Start scanning
          </Link>
          <Link
            href="/contacts"
            style={{
              display: 'block',
              padding: '14px 20px',
              borderRadius: 12,
              fontWeight: 600,
              fontSize: 14,
              textDecoration: 'none',
              background: '#1a1a1a',
              border: '1px solid #2a2a2a',
              color: COLORS.cyan,
            }}
          >
            View contacts
          </Link>
        </div>
      </div>
    </div>
  )
}

export default function PricingSuccessPage() {
  return (
    <Suspense
      fallback={
        <div
          style={{
            minHeight: '100vh',
            background: '#0f0f0f',
            color: '#ffffff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          Loading…
        </div>
      }
    >
      <SuccessContent />
    </Suspense>
  )
}
