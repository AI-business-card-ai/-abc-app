'use client'

import { useEffect, useMemo, useRef, useState, type ReactNode, type CSSProperties } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClientComponent } from '@/lib/supabase'
import HeroPhone from '@/components/landing/HeroPhone'
import HeroGlobe from '@/components/landing/HeroGlobe'

const COLORS = {
  bg: '#0d0f1a',
  cyan: '#00d4d4',
  pink: '#f0197d',
  purple: '#8b5cf6',
  text: '#f0f0ff',
  muted: '#8892b0',
  surface: '#141628',
}

const PAIN_POINTS = [
  { icon: '⏱️', text: '3 hours of manual CRM data entry' },
  { icon: '💬', text: 'Generic messages nobody replies to' },
  { icon: '📉', text: '80% of contacts dead within a week' },
]

const STEPS = [
  { icon: '📷', title: 'Scan', desc: 'Photo the card with your phone' },
  { icon: '🤖', title: 'AI enriches', desc: 'LinkedIn, company data, news' },
  { icon: '✉️', title: 'Messages ready', desc: 'LinkedIn / Email / WhatsApp personalized' },
  { icon: '✅', title: 'You approve', desc: 'AI prepares, you decide. Always.' },
]

const PLANS = [
  {
    name: 'FREE',
    price: '$0',
    badge: null as string | null,
    features: ['3 scans/month', 'Basic AI messages', 'Contact export'],
    cta: 'Start free',
    highlight: false,
  },
  {
    name: 'STARTER',
    price: '$49',
    period: '/mo',
    badge: 'Most popular',
    features: ['50 scans/month', 'AI messages', 'Follow-up reminders', 'CSV export'],
    cta: 'Get Starter',
    highlight: true,
  },
  {
    name: 'PRO',
    price: '$149',
    period: '/mo',
    badge: null,
    features: ['Unlimited scans', 'Salesforce & HubSpot', 'Pipeline analytics', 'Priority support'],
    cta: 'Go Pro',
    highlight: false,
  },
  {
    name: 'TEAM',
    price: '$399',
    period: '/mo',
    badge: null,
    features: ['5 users included', 'Shared contacts', 'Team pipeline', 'Admin dashboard'],
    cta: 'Contact sales',
    highlight: false,
  },
]

const TESTIMONIALS = [
  {
    quote: 'Scanned 47 cards at SaaStr. Had personalized LinkedIn messages ready before I landed. Closed 3 deals that week.',
    name: 'James Miller',
    role: 'Head of Sales, TechFlow CZ',
  },
  {
    quote: 'Finally stopped losing contacts in my pocket. ABC turns every handshake into a warm follow-up in seconds.',
    name: 'Sarah Chen',
    role: 'Account Executive, Nexus B2B',
  },
  {
    quote: 'Our team cut CRM entry time by 90%. The AI messages actually get replies — not generic templates.',
    name: 'Sarah Chen',
    role: 'VP Business Dev, Apex Digital',
  },
]

function FadeIn({ children, className = '' }: { children: ReactNode; className?: string }) {
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
    <div ref={ref} className={`landing-fade ${visible ? 'visible' : ''} ${className}`}>
      {children}
    </div>
  )
}

const btnPink: CSSProperties = {
  background: 'linear-gradient(135deg, #f0197d, #8b5cf6)',
  color: '#fff',
  border: 'none',
  borderRadius: '12px',
  padding: '12px 24px',
  fontWeight: 600,
  fontSize: '14px',
  cursor: 'pointer',
  textDecoration: 'none',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  boxShadow: '0 4px 20px rgba(240, 25, 125, 0.35)',
  transition: 'transform 0.15s ease, box-shadow 0.2s ease',
}

const btnOutline: CSSProperties = {
  background: 'transparent',
  color: '#00d4d4',
  border: '1.5px solid rgba(0, 212, 212, 0.5)',
  borderRadius: '12px',
  padding: '12px 24px',
  fontWeight: 600,
  fontSize: '14px',
  cursor: 'pointer',
  textDecoration: 'none',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  transition: 'background 0.2s ease, border-color 0.2s ease',
}

function scrollTo(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })
}

export default function HomePage() {
  const router = useRouter()
  const supabase = useMemo(() => createClientComponent(), [])
  const [checkingAuth, setCheckingAuth] = useState(true)

  useEffect(() => {
    let active = true
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!active) return
      if (session) {
        router.replace('/dashboard')
      } else {
        setCheckingAuth(false)
      }
    })
    return () => { active = false }
  }, [router, supabase])

  if (checkingAuth) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: COLORS.bg,
          color: COLORS.cyan,
          fontFamily: 'system-ui, -apple-system, sans-serif',
        }}
      >
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: '50%',
            border: '2px solid transparent',
            borderTopColor: COLORS.cyan,
            borderRightColor: COLORS.purple,
            animation: 'spin 0.8s linear infinite',
          }}
        />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    )
  }

  return (
    <div
      style={{
        background: COLORS.bg,
        color: COLORS.text,
        fontFamily: 'system-ui, -apple-system, sans-serif',
        minHeight: '100vh',
        overflowX: 'hidden',
      }}
    >
      {/* NAVBAR */}
      <nav
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 50,
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          background: 'rgba(13, 15, 26, 0.85)',
          borderBottom: '1px solid rgba(139, 92, 246, 0.12)',
        }}
      >
        <div
          style={{
            maxWidth: 1200,
            margin: '0 auto',
            padding: '14px 20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
          }}
        >
          <Link href="/" style={{ textDecoration: 'none' }}>
            <span
              style={{
                fontSize: '22px',
                fontWeight: 800,
                letterSpacing: '-0.02em',
                background: 'linear-gradient(135deg, #00d4d4, #f0197d)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
              }}
            >
              ABC
            </span>
          </Link>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Link
              href="/login"
              style={{
                color: COLORS.muted,
                textDecoration: 'none',
                fontSize: 14,
                fontWeight: 500,
                padding: '8px 12px',
              }}
            >
              Sign in
            </Link>
            <Link href="/register" style={btnPink}>
              Start for free
            </Link>
          </div>
        </div>
      </nav>

      {/* HERO */}
      <section
        id="hero"
        style={{
          position: 'relative',
          overflow: 'hidden',
          minHeight: '100vh',
          width: '100%',
          maxWidth: '100%',
          margin: 0,
          padding: '48px 20px',
          display: 'flex',
          alignItems: 'center',
        }}
      >
        <HeroGlobe />

        <div
          style={{
            position: 'relative',
            zIndex: 10,
            maxWidth: 550,
            paddingLeft: 80,
            paddingRight: 20,
          }}
        >
          <span
            style={{
              display: 'inline-block',
              fontSize: 12,
              fontWeight: 600,
              padding: '6px 14px',
              borderRadius: 999,
              marginBottom: 20,
              background: 'rgba(0, 212, 212, 0.1)',
              border: '1px solid rgba(0, 212, 212, 0.3)',
              color: COLORS.cyan,
            }}
          >
            🚀 Beta launch — June 30, 2026
          </span>
          <h1
            style={{
              fontSize: 'clamp(2rem, 5vw, 3.25rem)',
              fontWeight: 800,
              lineHeight: 1.1,
              letterSpacing: '-0.03em',
              margin: '0 0 20px',
            }}
          >
            From business card to sent message in{' '}
            <span
              style={{
                background: 'linear-gradient(135deg, #00d4d4, #f0197d)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
              }}
            >
              10 seconds
            </span>
            .
          </h1>
          <p
            style={{
              fontSize: 'clamp(1rem, 2.5vw, 1.125rem)',
              lineHeight: 1.65,
              color: COLORS.muted,
              margin: '0 0 32px',
              maxWidth: 520,
            }}
          >
            AI scans the card, researches the contact, writes personalized LinkedIn/Email/WhatsApp message. You just approve.
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
            <Link href="/register" style={btnPink}>
              Start for free →
            </Link>
            <button type="button" onClick={() => scrollTo('how-it-works')} style={btnOutline}>
              See how it works
            </button>
          </div>
          <p style={{ fontSize: 13, color: COLORS.muted, margin: 0 }}>
            3 scans free • No credit card • 10 second setup
          </p>
        </div>

        <div
          style={{
            position: 'absolute',
            right: 40,
            top: '50%',
            transform: 'translateY(-50%)',
            zIndex: 20,
            filter: 'drop-shadow(0 0 60px rgba(0,212,212,0.3))',
          }}
        >
          <HeroPhone />
        </div>
      </section>

      {/* PROBLEM */}
      <section id="problem" style={{ maxWidth: 1200, margin: '0 auto', padding: '64px 20px' }}>
        <FadeIn>
          <h2
            style={{
              fontSize: 'clamp(1.5rem, 4vw, 2.25rem)',
              fontWeight: 700,
              textAlign: 'center',
              margin: '0 0 40px',
              lineHeight: 1.25,
            }}
          >
            You come back from every event with{' '}
            <span style={{ color: COLORS.pink }}>50 business cards</span>.
          </h2>
        </FadeIn>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
            gap: 20,
          }}
        >
          {PAIN_POINTS.map((p) => (
            <FadeIn key={p.text}>
              <div
                style={{
                  padding: 28,
                  borderRadius: 16,
                  background: COLORS.surface,
                  border: '1px solid rgba(240, 25, 125, 0.15)',
                  height: '100%',
                }}
              >
                <span style={{ fontSize: 28, display: 'block', marginBottom: 12 }}>{p.icon}</span>
                <p style={{ margin: 0, fontSize: 16, fontWeight: 600, lineHeight: 1.5 }}>{p.text}</p>
              </div>
            </FadeIn>
          ))}
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section
        id="how-it-works"
        style={{
          maxWidth: 1200,
          margin: '0 auto',
          padding: '64px 20px',
          background: 'linear-gradient(180deg, transparent, rgba(139, 92, 246, 0.06), transparent)',
        }}
      >
        <FadeIn>
          <h2
            style={{
              fontSize: 'clamp(1.75rem, 4vw, 2.5rem)',
              fontWeight: 800,
              textAlign: 'center',
              margin: '0 0 12px',
              letterSpacing: '-0.02em',
            }}
          >
            Scan. Know. Connect.
          </h2>
          <p style={{ textAlign: 'center', color: COLORS.muted, margin: '0 0 48px' }}>
            Four steps from handshake to inbox
          </p>
        </FadeIn>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 24,
          }}
        >
          {STEPS.map((step, i) => (
            <FadeIn key={step.title}>
              <div
                style={{
                  textAlign: 'center',
                  padding: 28,
                  borderRadius: 16,
                  background: 'rgba(20, 22, 40, 0.6)',
                  border: '1px solid rgba(0, 212, 212, 0.15)',
                  position: 'relative',
                }}
              >
                <span
                  style={{
                    position: 'absolute',
                    top: 12,
                    right: 16,
                    fontSize: 11,
                    fontWeight: 700,
                    color: COLORS.purple,
                    opacity: 0.6,
                  }}
                >
                  {i + 1}
                </span>
                <span style={{ fontSize: 36, display: 'block', marginBottom: 12 }}>{step.icon}</span>
                <h3 style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 700 }}>{step.title}</h3>
                <p style={{ margin: 0, fontSize: 14, color: COLORS.muted, lineHeight: 1.5 }}>{step.desc}</p>
              </div>
            </FadeIn>
          ))}
        </div>
      </section>

      {/* PRICING */}
      <section id="pricing" style={{ maxWidth: 1200, margin: '0 auto', padding: '64px 20px' }}>
        <FadeIn>
          <h2
            style={{
              fontSize: 'clamp(1.75rem, 4vw, 2.5rem)',
              fontWeight: 800,
              textAlign: 'center',
              margin: '0 0 48px',
            }}
          >
            Simple pricing
          </h2>
        </FadeIn>
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
                  background: plan.highlight ? 'linear-gradient(160deg, rgba(240,25,125,0.12), rgba(139,92,246,0.08))' : COLORS.surface,
                  border: plan.highlight ? '1px solid rgba(240, 25, 125, 0.4)' : '1px solid rgba(139, 92, 246, 0.15)',
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
                  {plan.period && <span style={{ fontSize: 14, fontWeight: 500, color: COLORS.muted }}>{plan.period}</span>}
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
                <Link
                  href="/register"
                  style={{
                    ...btnPink,
                    width: '100%',
                    textAlign: 'center',
                    background: plan.highlight
                      ? 'linear-gradient(135deg, #f0197d, #8b5cf6)'
                      : 'rgba(0, 212, 212, 0.1)',
                    color: plan.highlight ? '#fff' : COLORS.cyan,
                    border: plan.highlight ? 'none' : '1px solid rgba(0, 212, 212, 0.4)',
                    boxShadow: plan.highlight ? '0 4px 20px rgba(240, 25, 125, 0.35)' : 'none',
                  }}
                >
                  {plan.cta}
                </Link>
              </div>
            </FadeIn>
          ))}
        </div>
      </section>

      {/* SOCIAL PROOF */}
      <section id="testimonials" style={{ maxWidth: 1200, margin: '0 auto', padding: '64px 20px' }}>
        <FadeIn>
          <p
            style={{
              textAlign: 'center',
              fontSize: 'clamp(1rem, 2.5vw, 1.25rem)',
              color: COLORS.muted,
              margin: '0 0 40px',
            }}
          >
            Join <strong style={{ color: COLORS.text }}>100+ sales professionals</strong> already using ABC
          </p>
        </FadeIn>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: 20,
          }}
        >
          {TESTIMONIALS.map((t) => (
            <FadeIn key={t.name}>
              <div
                style={{
                  padding: 24,
                  borderRadius: 16,
                  background: COLORS.surface,
                  border: '1px solid rgba(139, 92, 246, 0.12)',
                  height: '100%',
                }}
              >
                <p style={{ margin: '0 0 20px', fontSize: 14, lineHeight: 1.65, color: COLORS.muted, fontStyle: 'italic' }}>
                  &ldquo;{t.quote}&rdquo;
                </p>
                <p style={{ margin: 0, fontWeight: 700, fontSize: 14 }}>{t.name}</p>
                <p style={{ margin: '4px 0 0', fontSize: 12, color: COLORS.cyan }}>{t.role}</p>
              </div>
            </FadeIn>
          ))}
        </div>
      </section>

      {/* FINAL CTA */}
      <section
        id="cta"
        style={{
          maxWidth: 900,
          margin: '0 auto',
          padding: '80px 20px',
          textAlign: 'center',
        }}
      >
        <FadeIn>
          <h2
            style={{
              fontSize: 'clamp(2rem, 5vw, 3rem)',
              fontWeight: 800,
              margin: '0 0 24px',
              letterSpacing: '-0.02em',
            }}
          >
            Never lose a contact again.
          </h2>
          <Link
            href="/register"
            style={{
              ...btnPink,
              fontSize: 16,
              padding: '16px 32px',
              borderRadius: 14,
            }}
          >
            Start scanning for free →
          </Link>
          <p style={{ margin: '20px 0 0', fontSize: 13, color: COLORS.muted }}>
            Beta access • Limited spots
          </p>
        </FadeIn>
      </section>

      {/* FOOTER */}
      <footer
        style={{
          borderTop: '1px solid rgba(139, 92, 246, 0.12)',
          padding: '40px 20px',
          textAlign: 'center',
        }}
      >
        <p style={{ margin: '0 0 16px', fontSize: 14, fontWeight: 600 }}>
          ABC AI Business Card • Scan. Know. Connect.
        </p>
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'center',
            gap: 20,
            marginBottom: 16,
          }}
        >
          {['Privacy', 'Terms', 'Contact'].map((label) => (
            <a
              key={label}
              href="#"
              style={{ color: COLORS.muted, fontSize: 13, textDecoration: 'none' }}
              onClick={(e) => e.preventDefault()}
            >
              {label}
            </a>
          ))}
        </div>
        <p style={{ margin: 0, fontSize: 12, color: COLORS.muted, opacity: 0.7 }}>
          Built on APEXPO ecosystem
        </p>
      </footer>
    </div>
  )
}
