'use client'

import { Suspense, useEffect, useRef, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClientComponent } from '@/lib/supabase'
import { getScanLimitForPlan } from '@/lib/scan-limits'
import { PLAN_LABELS, PLAN_PRICES_USD, type PaidPlan } from '@/lib/stripe-prices'
import type { ABCProfile } from '@/lib/types'

const COLORS = {
  bg: '#0f0f0f',
  cyan: '#00d4d4',
  pink: '#f0197d',
  text: '#ffffff',
  muted: '#999999',
  surface: '#1a1a1a',
}

const PAID_PLANS: {
  key: PaidPlan
  badge: string | null
  features: string[]
}[] = [
  {
    key: 'starter',
    badge: null,
    features: ['50 lifetime scans', 'AI outreach messages', 'CSV export'],
  },
  {
    key: 'growth',
    badge: 'Most Popular',
    features: ['100 lifetime scans', 'Follow-up reminders', 'Pipeline view'],
  },
  {
    key: 'pro',
    badge: null,
    features: ['200 lifetime scans', 'CRM integrations', 'Priority enrichment'],
  },
  {
    key: 'team',
    badge: null,
    features: ['500 lifetime scans', 'Shared contacts', 'Team pipeline'],
  },
]

function FadeIn({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true)
          observer.disconnect()
        }
      },
      { threshold: 0.12, rootMargin: '0px 0px -40px 0px' }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return (
    <div ref={ref} className={`landing-fade ${visible ? 'visible' : ''}`}>
      {children}
    </div>
  )
}

export default function PricingPage() {
  return (
    <Suspense
      fallback={
        <div
          style={{
            minHeight: '100vh',
            background: COLORS.bg,
            color: COLORS.text,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          Loading pricing…
        </div>
      }
    >
      <PricingContent />
    </Suspense>
  )
}

function PricingContent() {
  const router = useRouter()
  const supabase = createClientComponent()
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [currentPlan, setCurrentPlan] = useState<ABCProfile['plan'] | null>(null)
  const [authChecked, setAuthChecked] = useState(false)

  useEffect(() => {
    let active = true
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!active) return
      if (!user) {
        setAuthChecked(true)
        return
      }
      const { data } = await supabase
        .from('abc_profiles')
        .select('plan')
        .eq('id', user.id)
        .maybeSingle()
      if (active) {
        setCurrentPlan((data as { plan?: ABCProfile['plan'] } | null)?.plan ?? 'free')
        setAuthChecked(true)
      }
    })()
    return () => {
      active = false
    }
  }, [supabase])

  async function handleCheckout(plan: PaidPlan) {
    setError(null)
    setLoadingPlan(plan)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/login?redirect=/pricing')
        return
      }

      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan }),
      })
      const data = await res.json()
      if (!res.ok || !data.url) {
        throw new Error(data.error || 'Checkout failed')
      }
      window.location.href = data.url
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Checkout failed')
      setLoadingPlan(null)
    }
  }

  const freeScanLimit = getScanLimitForPlan('free')

  return (
    <div
      style={{
        minHeight: '100vh',
        background: COLORS.bg,
        color: COLORS.text,
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}
    >
      <style jsx global>{`
        .landing-fade {
          opacity: 0;
          transform: translateY(16px);
          transition: opacity 0.5s ease, transform 0.5s ease;
        }
        .landing-fade.visible {
          opacity: 1;
          transform: translateY(0);
        }
      `}</style>

      <header
        style={{
          maxWidth: 1200,
          margin: '0 auto',
          padding: '24px 20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <Link href="/" style={{ fontSize: 20, fontWeight: 800, color: COLORS.text, textDecoration: 'none' }}>
          ABC<span style={{ color: COLORS.cyan }}>.</span>
        </Link>
        <Link
          href="/login"
          style={{
            fontSize: 14,
            fontWeight: 600,
            color: COLORS.cyan,
            textDecoration: 'none',
            border: '1px solid rgba(0, 212, 212, 0.4)',
            padding: '8px 16px',
            borderRadius: 8,
          }}
        >
          Sign in
        </Link>
      </header>

      <main style={{ maxWidth: 1200, margin: '0 auto', padding: '32px 20px 80px' }}>
        <FadeIn>
          <h1
            style={{
              fontSize: 'clamp(2rem, 5vw, 3rem)',
              fontWeight: 800,
              textAlign: 'center',
              margin: '0 0 12px',
            }}
          >
            Choose your plan
          </h1>
          <p style={{ textAlign: 'center', color: COLORS.muted, margin: '0 0 32px', fontSize: 16 }}>
            Upgrade when you need more scans. All plans are lifetime scan caps.
          </p>
        </FadeIn>

        <FadeIn>
          <div
            style={{
              marginBottom: 28,
              padding: '16px 20px',
              borderRadius: 12,
              background: COLORS.surface,
              border: '1px solid #2a2a2a',
              textAlign: 'center',
              fontSize: 14,
              color: COLORS.muted,
            }}
          >
            {authChecked && currentPlan && currentPlan !== 'free' ? (
              <span style={{ color: COLORS.cyan }}>
                ✓ Current plan: <strong style={{ color: COLORS.text }}>{PLAN_LABELS[currentPlan as PaidPlan] ?? currentPlan}</strong>
                {' '}({getScanLimitForPlan(currentPlan)} lifetime scans)
              </span>
            ) : (
              <span>
                Current plan: <strong style={{ color: COLORS.text }}>Free</strong> ({freeScanLimit} lifetime scans)
              </span>
            )}
          </div>
        </FadeIn>

        {error && (
          <p
            style={{
              textAlign: 'center',
              color: COLORS.pink,
              marginBottom: 24,
              padding: '12px 16px',
              borderRadius: 8,
              background: 'rgba(240, 25, 125, 0.1)',
              border: '1px solid rgba(240, 25, 125, 0.3)',
            }}
          >
            {error}
          </p>
        )}

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
            gap: 20,
            alignItems: 'stretch',
          }}
        >
          {PAID_PLANS.map((plan) => {
            const isCurrent = currentPlan === plan.key
            const isHighlight = plan.badge === 'Most Popular'
            const price = PLAN_PRICES_USD[plan.key]
            const scanLimit = getScanLimitForPlan(plan.key)

            return (
              <FadeIn key={plan.key}>
                <div
                  style={{
                    padding: 28,
                    borderRadius: 16,
                    background: isHighlight
                      ? 'linear-gradient(160deg, rgba(240,25,125,0.12), rgba(0,212,212,0.08))'
                      : COLORS.surface,
                    border: isHighlight
                      ? '1px solid rgba(240, 25, 125, 0.4)'
                      : isCurrent
                        ? '1px solid rgba(0, 212, 212, 0.5)'
                        : '1px solid #2a2a2a',
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    position: 'relative',
                    boxShadow: isHighlight ? '0 8px 40px rgba(240, 25, 125, 0.15)' : 'none',
                  }}
                >
                  {plan.badge && (
                    <span
                      style={{
                        position: 'absolute',
                        top: -12,
                        left: '50%',
                        transform: 'translateX(-50%)',
                        fontSize: 11,
                        fontWeight: 700,
                        padding: '4px 12px',
                        borderRadius: 999,
                        background: 'linear-gradient(135deg, #f0197d, #00d4d4)',
                        color: '#fff',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {plan.badge}
                    </span>
                  )}
                  <p style={{ margin: '0 0 4px', fontSize: 13, fontWeight: 700, color: COLORS.cyan, letterSpacing: '0.08em' }}>
                    {PLAN_LABELS[plan.key].toUpperCase()}
                  </p>
                  <p style={{ margin: '0 0 4px', fontSize: 32, fontWeight: 800 }}>
                    ${price}
                    <span style={{ fontSize: 14, fontWeight: 500, color: COLORS.muted }}>/mo</span>
                  </p>
                  <p style={{ margin: '0 0 20px', fontSize: 13, color: COLORS.muted }}>
                    {scanLimit} lifetime scans
                  </p>
                  <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 24px', flex: 1 }}>
                    {plan.features.map((f) => (
                      <li
                        key={f}
                        style={{
                          fontSize: 14,
                          color: COLORS.muted,
                          marginBottom: 10,
                          paddingLeft: 20,
                          position: 'relative',
                        }}
                      >
                        <span style={{ position: 'absolute', left: 0, color: COLORS.cyan }}>✓</span>
                        {f}
                      </li>
                    ))}
                  </ul>
                  {isCurrent ? (
                    <div
                      style={{
                        width: '100%',
                        textAlign: 'center',
                        padding: '12px 20px',
                        borderRadius: 10,
                        fontWeight: 700,
                        fontSize: 14,
                        background: 'rgba(0, 212, 212, 0.1)',
                        color: COLORS.cyan,
                        border: '1px solid rgba(0, 212, 212, 0.4)',
                      }}
                    >
                      ✓ Current plan
                    </div>
                  ) : (
                    <button
                      type="button"
                      disabled={loadingPlan !== null}
                      onClick={() => void handleCheckout(plan.key)}
                      style={{
                        width: '100%',
                        padding: '12px 20px',
                        borderRadius: 10,
                        fontWeight: 700,
                        fontSize: 14,
                        cursor: loadingPlan ? 'wait' : 'pointer',
                        background: isHighlight
                          ? 'linear-gradient(135deg, #f0197d, #00d4d4)'
                          : 'rgba(0, 212, 212, 0.1)',
                        color: isHighlight ? '#fff' : COLORS.cyan,
                        border: isHighlight ? 'none' : '1px solid rgba(0, 212, 212, 0.4)',
                        boxShadow: isHighlight ? '0 4px 20px rgba(240, 25, 125, 0.35)' : 'none',
                        opacity: loadingPlan && loadingPlan !== plan.key ? 0.6 : 1,
                      }}
                    >
                      {loadingPlan === plan.key ? 'Redirecting…' : 'Get Started'}
                    </button>
                  )}
                </div>
              </FadeIn>
            )
          })}
        </div>

        <p style={{ textAlign: 'center', marginTop: 40 }}>
          <button
            type="button"
            onClick={() => router.push('/scan')}
            style={{
              background: 'none',
              border: 'none',
              color: COLORS.muted,
              cursor: 'pointer',
              fontSize: 14,
              textDecoration: 'underline',
            }}
          >
            ← Back to scanning
          </button>
        </p>
      </main>
    </div>
  )
}
