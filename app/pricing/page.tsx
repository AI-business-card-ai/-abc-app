'use client'

import { Suspense, useEffect, useRef, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'

const COLORS = {
  bg: '#0d0f1a',
  cyan: '#00d4d4',
  pink: '#f0197d',
  purple: '#8b5cf6',
  text: '#f0f0ff',
  muted: '#8892b0',
  surface: '#141628',
}

const PLANS = [
  {
    key: 'free' as const,
    name: 'FREE',
    price: '$0',
    period: '',
    badge: null as string | null,
    features: ['3 scans/month', 'Basic AI messages', 'Contact export'],
    cta: 'Start free',
    highlight: false,
  },
  {
    key: 'starter' as const,
    name: 'STARTER',
    price: '$49',
    period: '/mo',
    badge: 'Most popular',
    features: ['50 scans/month', 'AI messages', 'Follow-up reminders', 'CSV export'],
    cta: 'Get Starter',
    highlight: true,
  },
  {
    key: 'pro' as const,
    name: 'PRO',
    price: '$149',
    period: '/mo',
    badge: null,
    features: ['Unlimited scans', 'Salesforce & HubSpot', 'Pipeline analytics', 'Priority support'],
    cta: 'Go Pro',
    highlight: false,
  },
  {
    key: 'team' as const,
    name: 'TEAM',
    price: '$399',
    period: '/mo',
    badge: null,
    features: ['5 users included', 'Shared contacts', 'Team pipeline', 'Admin dashboard'],
    cta: 'Get Team',
    highlight: false,
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
  const searchParams = useSearchParams()
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const cancelled = searchParams.get('payment') === 'cancelled'

  async function handleCheckout(plan: 'starter' | 'pro' | 'team') {
    setError(null)
    setLoadingPlan(plan)
    try {
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

      <main style={{ maxWidth: 1200, margin: '0 auto', padding: '48px 20px 80px' }}>
        <FadeIn>
          <h1
            style={{
              fontSize: 'clamp(2rem, 5vw, 3rem)',
              fontWeight: 800,
              textAlign: 'center',
              margin: '0 0 12px',
            }}
          >
            Simple pricing
          </h1>
          <p style={{ textAlign: 'center', color: COLORS.muted, margin: '0 0 48px', fontSize: 16 }}>
            Start free. Upgrade when you are ready to scale.
          </p>
        </FadeIn>

        {cancelled && (
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
            Payment cancelled. Choose a plan when you are ready.
          </p>
        )}

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
          {PLANS.map((plan) => (
            <FadeIn key={plan.name}>
              <div
                style={{
                  padding: 28,
                  borderRadius: 16,
                  background: plan.highlight
                    ? 'linear-gradient(160deg, rgba(240,25,125,0.12), rgba(139,92,246,0.08))'
                    : COLORS.surface,
                  border: plan.highlight
                    ? '1px solid rgba(240, 25, 125, 0.4)'
                    : '1px solid rgba(139, 92, 246, 0.15)',
                  height: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  position: 'relative',
                  boxShadow: plan.highlight ? '0 8px 40px rgba(240, 25, 125, 0.15)' : 'none',
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
                      background: 'linear-gradient(135deg, #f0197d, #8b5cf6)',
                      color: '#fff',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {plan.badge}
                  </span>
                )}
                <p style={{ margin: '0 0 4px', fontSize: 13, fontWeight: 700, color: COLORS.cyan, letterSpacing: '0.08em' }}>
                  {plan.name}
                </p>
                <p style={{ margin: '0 0 20px', fontSize: 32, fontWeight: 800 }}>
                  {plan.price}
                  {plan.period && (
                    <span style={{ fontSize: 14, fontWeight: 500, color: COLORS.muted }}>{plan.period}</span>
                  )}
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
                {plan.key === 'free' ? (
                  <Link
                    href="/register"
                    style={{
                      display: 'block',
                      width: '100%',
                      textAlign: 'center',
                      padding: '12px 20px',
                      borderRadius: 10,
                      fontWeight: 700,
                      fontSize: 14,
                      textDecoration: 'none',
                      background: 'rgba(0, 212, 212, 0.1)',
                      color: COLORS.cyan,
                      border: '1px solid rgba(0, 212, 212, 0.4)',
                    }}
                  >
                    {plan.cta}
                  </Link>
                ) : (
                  <button
                    type="button"
                    disabled={loadingPlan !== null}
                    onClick={() => handleCheckout(plan.key)}
                    style={{
                      width: '100%',
                      padding: '12px 20px',
                      borderRadius: 10,
                      fontWeight: 700,
                      fontSize: 14,
                      cursor: loadingPlan ? 'wait' : 'pointer',
                      background: plan.highlight
                        ? 'linear-gradient(135deg, #f0197d, #8b5cf6)'
                        : 'rgba(0, 212, 212, 0.1)',
                      color: plan.highlight ? '#fff' : COLORS.cyan,
                      border: plan.highlight ? 'none' : '1px solid rgba(0, 212, 212, 0.4)',
                      boxShadow: plan.highlight ? '0 4px 20px rgba(240, 25, 125, 0.35)' : 'none',
                      opacity: loadingPlan && loadingPlan !== plan.key ? 0.6 : 1,
                    }}
                  >
                    {loadingPlan === plan.key ? 'Redirecting…' : plan.cta}
                  </button>
                )}
              </div>
            </FadeIn>
          ))}
        </div>

        <p style={{ textAlign: 'center', marginTop: 40 }}>
          <button
            type="button"
            onClick={() => router.push('/')}
            style={{
              background: 'none',
              border: 'none',
              color: COLORS.muted,
              cursor: 'pointer',
              fontSize: 14,
              textDecoration: 'underline',
            }}
          >
            ← Back to home
          </button>
        </p>
      </main>
    </div>
  )
}
