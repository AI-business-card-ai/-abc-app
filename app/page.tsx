'use client'

import { useEffect, useMemo, useRef, useState, type ReactNode, type CSSProperties } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClientComponent } from '@/lib/supabase'
import DemoQrCode from '@/components/landing/DemoQrCode'

const COLORS = {
  bg: '#0f0f0f',
  card: '#1a1a1a',
  border: '#2a2a2a',
  pink: '#f0197d',
  cyan: '#00d4d4',
  text: '#ffffff',
  muted: '#9ca3af',
}

const GRADIENT = 'linear-gradient(135deg, #f0197d, #00d4d4)'

const gradientText: CSSProperties = {
  background: 'linear-gradient(90deg, #f0197d, #00d4d4)',
  WebkitBackgroundClip: 'text',
  WebkitTextFillColor: 'transparent',
  backgroundClip: 'text',
}

const PAIN_POINTS = [
  { icon: '⏱', text: '3 hours of manual CRM data entry' },
  { icon: '💬', text: 'Generic messages nobody replies to' },
  { icon: '📉', text: '80% of contacts dead within a week' },
]

const STEPS = [
  { icon: '📷', title: 'Scan', desc: 'Photo the card with your phone' },
  { icon: '🤖', title: 'AI enriches', desc: 'LinkedIn, company data, news, match score' },
  { icon: '✉️', title: 'Messages ready', desc: 'LinkedIn / Email / WhatsApp — personalized' },
  { icon: '✅', title: 'You approve', desc: 'AI prepares, you decide. Always.' },
  { icon: '📊', title: 'Export to CRM', desc: 'One click to Salesforce or HubSpot' },
]

const PLANS = [
  {
    name: 'FREE',
    price: '$0',
    period: '/mo',
    badge: null as string | null,
    features: ['3 lifetime scans', 'Basic AI messages', 'Contact export'],
    cta: 'Start free',
    highlight: false,
  },
  {
    name: 'STARTER',
    price: '$29',
    period: '/mo',
    badge: 'Most popular',
    features: ['50 scans/month', 'AI messages + enrichment', 'Follow-up sequences', 'CSV export'],
    cta: 'Get Starter',
    highlight: true,
  },
  {
    name: 'GROWTH',
    price: '$49',
    period: '/mo',
    badge: null,
    features: ['100 scans/month', 'Everything in Starter', 'Salesforce & HubSpot export', 'Pipeline analytics'],
    cta: 'Get Growth',
    highlight: false,
  },
  {
    name: 'PRO',
    price: '$89',
    period: '/mo',
    badge: null,
    features: ['200 scans/month', 'Everything in Growth', 'Priority support', 'Advanced analytics'],
    cta: 'Get Pro',
    highlight: false,
  },
  {
    name: 'TEAM',
    price: '$199',
    period: '/mo',
    badge: null,
    features: ['500 scans/month', '5 users included', 'Shared contacts', 'Admin dashboard'],
    cta: 'Contact sales',
    highlight: false,
  },
]

const USE_CASES = ['🏭 Trade shows', '🎤 Conferences', '🤝 B2B meetings']

const MOCK_MESSAGES = [
  {
    channel: 'LinkedIn',
    color: '#00d4d4',
    text: 'Hi Martin — loved our chat at Medica. Your AI diagnostics work is fascinating. Coffee next week?',
  },
  {
    channel: 'Email',
    color: '#f0197d',
    text: 'Subject: Medica follow-up\nHi Martin, great meeting you at the booth...',
  },
  {
    channel: 'WhatsApp',
    color: '#25D366',
    text: 'Hey Martin! Great meeting you 👋 Here\u2019s the deck I mentioned...',
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

const btnGradient: CSSProperties = {
  background: GRADIENT,
  color: '#fff',
  border: 'none',
  borderRadius: '12px',
  padding: '13px 26px',
  fontWeight: 700,
  fontSize: '15px',
  cursor: 'pointer',
  textDecoration: 'none',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  boxShadow: '0 4px 24px rgba(240, 25, 125, 0.35)',
  transition: 'transform 0.15s ease, box-shadow 0.2s ease',
}

const btnOutline: CSSProperties = {
  background: 'transparent',
  color: COLORS.cyan,
  border: '1.5px solid rgba(0, 212, 212, 0.5)',
  borderRadius: '12px',
  padding: '13px 26px',
  fontWeight: 700,
  fontSize: '15px',
  cursor: 'pointer',
  textDecoration: 'none',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  transition: 'background 0.2s ease, border-color 0.2s ease',
}

/** Card with #f0197d → #00d4d4 gradient border. */
function GradientBorderCard({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        background: 'linear-gradient(135deg, #f0197d, #00d4d4)',
        padding: 1,
        borderRadius: 12,
        height: '100%',
      }}
    >
      <div
        style={{
          background: '#1a1a1a',
          borderRadius: 11,
          padding: 24,
          height: '100%',
        }}
      >
        {children}
      </div>
    </div>
  )
}

/** Static CSS phone mockup showing a scanned contact with AI messages. */
function HeroMockup() {
  return (
    <div
      style={{
        width: 300,
        borderRadius: 40,
        background: 'linear-gradient(145deg, #1c1c1c, #0a0a0a)',
        padding: 10,
        boxShadow:
          '0 24px 64px rgba(0, 0, 0, 0.55), 0 0 0 1px rgba(255,255,255,0.06), 0 0 60px rgba(0,212,212,0.12), inset 0 1px 0 rgba(255,255,255,0.08)',
        margin: '0 auto',
      }}
    >
      <div
        style={{
          borderRadius: 32,
          background: COLORS.bg,
          overflow: 'hidden',
          border: `1px solid ${COLORS.border}`,
        }}
      >
        {/* Notch */}
        <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 8 }}>
          <div style={{ width: 90, height: 18, borderRadius: 999, background: '#0a0a0a' }} />
        </div>

        {/* Contact header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '14px 14px 12px',
            borderBottom: `1px solid ${COLORS.border}`,
          }}
        >
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: '50%',
              background: GRADIENT,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 13,
              fontWeight: 800,
              color: '#fff',
              flexShrink: 0,
            }}
          >
            MN
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: COLORS.text }}>
              Martin Novak
            </p>
            <p style={{ margin: 0, fontSize: 10, color: COLORS.muted }}>MedTech GmbH</p>
          </div>
          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              padding: '4px 10px',
              borderRadius: 999,
              background: 'rgba(240, 25, 125, 0.15)',
              color: COLORS.pink,
              whiteSpace: 'nowrap',
            }}
          >
            Score: 92 🔥
          </span>
        </div>

        {/* Message previews */}
        <div style={{ padding: '12px 14px 18px', display: 'flex', flexDirection: 'column', gap: 9 }}>
          {MOCK_MESSAGES.map((msg) => (
            <div
              key={msg.channel}
              style={{
                padding: '10px 11px',
                borderRadius: 10,
                background: COLORS.card,
                border: `1px solid ${COLORS.border}`,
                borderLeft: `3px solid ${msg.color}`,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: msg.color }}>{msg.channel}</span>
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    padding: '4px 12px',
                    borderRadius: 7,
                    background: `${msg.color}1f`,
                    color: msg.color,
                  }}
                >
                  Send
                </span>
              </div>
              <p
                style={{
                  margin: '6px 0 0',
                  fontSize: 10,
                  lineHeight: 1.5,
                  color: COLORS.muted,
                  whiteSpace: 'pre-wrap',
                }}
              >
                {msg.text}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
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
            borderRightColor: COLORS.pink,
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
        fontFamily: "system-ui, -apple-system, 'Inter', sans-serif",
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
          background: 'rgba(15, 15, 15, 0.85)',
          borderBottom: `1px solid ${COLORS.border}`,
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
            <span style={{ fontSize: '22px', fontWeight: 800, letterSpacing: '-0.02em', ...gradientText }}>
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
            <Link href="/register" style={{ ...btnGradient, padding: '10px 20px', fontSize: 14 }}>
              Start for free
            </Link>
          </div>
        </div>
      </nav>

      {/* HERO — split layout, no globe */}
      <section
        id="hero"
        style={{
          maxWidth: 1200,
          margin: '0 auto',
          padding: '72px 20px 64px',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: 48,
          alignItems: 'center',
        }}
      >
        <div>
          <h1
            style={{
              fontSize: 'clamp(2rem, 5vw, 3.25rem)',
              fontWeight: 800,
              lineHeight: 1.1,
              letterSpacing: '-0.03em',
              margin: '0 0 20px',
            }}
          >
            From business card to sent message in <span style={gradientText}>10 seconds</span>.
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
            AI scans the card, researches the contact, writes personalized LinkedIn/Email/WhatsApp
            message. You just approve.
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
            <Link href="/register" style={btnGradient}>
              Start for free →
            </Link>
            <button type="button" onClick={() => scrollTo('how-it-works')} style={btnOutline}>
              See how it works
            </button>
          </div>
          <p style={{ fontSize: 13, color: COLORS.muted, margin: 0 }}>
            3 scans free · No credit card · 10 second setup
          </p>
        </div>

        <HeroMockup />
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
              <GradientBorderCard>
                <span style={{ fontSize: 30, display: 'block', marginBottom: 12 }}>{p.icon}</span>
                <p style={{ margin: 0, fontSize: 16, fontWeight: 600, lineHeight: 1.5, color: COLORS.text }}>
                  {p.text}
                </p>
              </GradientBorderCard>
            </FadeIn>
          ))}
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section id="how-it-works" style={{ maxWidth: 1200, margin: '0 auto', padding: '64px 20px' }}>
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
            Five steps from handshake to CRM
          </p>
        </FadeIn>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: 20,
          }}
        >
          {STEPS.map((step, i) => (
            <FadeIn key={step.title}>
              <div
                style={{
                  textAlign: 'center',
                  padding: 28,
                  borderRadius: 16,
                  background: COLORS.card,
                  border: `1px solid ${COLORS.border}`,
                  position: 'relative',
                  height: '100%',
                }}
              >
                <span
                  style={{
                    position: 'absolute',
                    top: 14,
                    right: 18,
                    fontSize: 22,
                    fontWeight: 900,
                    ...gradientText,
                  }}
                >
                  {i + 1}
                </span>
                <span style={{ fontSize: 36, display: 'block', marginBottom: 12 }}>{step.icon}</span>
                <h3 style={{ margin: '0 0 8px', fontSize: 17, fontWeight: 700 }}>{step.title}</h3>
                <p style={{ margin: 0, fontSize: 13, color: COLORS.muted, lineHeight: 1.5 }}>
                  {step.desc}
                </p>
              </div>
            </FadeIn>
          ))}
        </div>
      </section>

      {/* DIGITAL CARD / QR — reverse lead capture */}
      <section id="digital-card" style={{ maxWidth: 1000, margin: '0 auto', padding: '64px 20px' }}>
        <FadeIn>
          <div
            style={{
              background: COLORS.card,
              border: `1px solid ${COLORS.border}`,
              borderRadius: 24,
              padding: 'clamp(28px, 5vw, 48px)',
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
              gap: 40,
              alignItems: 'center',
            }}
          >
            <DemoQrCode />
            <div>
              <h2
                style={{
                  fontSize: 'clamp(1.5rem, 4vw, 2.25rem)',
                  fontWeight: 800,
                  margin: '0 0 16px',
                  letterSpacing: '-0.02em',
                }}
              >
                Your digital card. <span style={gradientText}>Their lead.</span>
              </h2>
              <p style={{ fontSize: 16, lineHeight: 1.7, color: COLORS.muted, margin: 0 }}>
                Share your QR code → they scan → they leave their contact → you get a new lead
                automatically. Every handshake becomes a two-way connection.
              </p>
            </div>
          </div>
        </FadeIn>
      </section>

      {/* PRICING */}
      <section id="pricing" style={{ maxWidth: 1280, margin: '0 auto', padding: '64px 20px' }}>
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
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 18,
            alignItems: 'stretch',
          }}
        >
          {PLANS.map((plan) => (
            <FadeIn key={plan.name}>
              <div
                style={{
                  padding: 26,
                  borderRadius: 16,
                  background: plan.highlight
                    ? 'linear-gradient(160deg, rgba(240,25,125,0.12), rgba(0,212,212,0.08))'
                    : COLORS.card,
                  border: plan.highlight
                    ? '1px solid rgba(240, 25, 125, 0.4)'
                    : `1px solid ${COLORS.border}`,
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
                      background: GRADIENT,
                      color: '#fff',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {plan.badge}
                  </span>
                )}
                <p
                  style={{
                    margin: '0 0 4px',
                    fontSize: 13,
                    fontWeight: 700,
                    color: COLORS.cyan,
                    letterSpacing: '0.08em',
                  }}
                >
                  {plan.name}
                </p>
                <p style={{ margin: '0 0 20px', fontSize: 32, fontWeight: 800 }}>
                  {plan.price}
                  <span style={{ fontSize: 14, fontWeight: 500, color: COLORS.muted }}>
                    {plan.period}
                  </span>
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
                  href="/pricing"
                  style={{
                    ...btnGradient,
                    width: '100%',
                    textAlign: 'center',
                    padding: '12px 16px',
                    fontSize: 14,
                    background: plan.highlight ? GRADIENT : 'rgba(0, 212, 212, 0.1)',
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

      {/* SOCIAL PROOF / USE CASES */}
      <section id="use-cases" style={{ maxWidth: 900, margin: '0 auto', padding: '64px 20px', textAlign: 'center' }}>
        <FadeIn>
          <p
            style={{
              fontSize: 'clamp(1.1rem, 2.5vw, 1.35rem)',
              color: COLORS.text,
              fontWeight: 600,
              lineHeight: 1.6,
              margin: '0 0 28px',
            }}
          >
            Built for founders and sales teams at trade shows, conferences, and B2B events.
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 12 }}>
            {USE_CASES.map((label) => (
              <span
                key={label}
                style={{
                  padding: '10px 20px',
                  borderRadius: 999,
                  background: COLORS.card,
                  border: `1px solid ${COLORS.border}`,
                  fontSize: 14,
                  fontWeight: 600,
                  color: COLORS.text,
                }}
              >
                {label}
              </span>
            ))}
          </div>
        </FadeIn>
      </section>

      {/* FINAL CTA */}
      <section id="cta" style={{ maxWidth: 900, margin: '0 auto', padding: '64px 20px 80px', textAlign: 'center' }}>
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
          <Link href="/register" style={{ ...btnGradient, fontSize: 16, padding: '16px 32px', borderRadius: 14 }}>
            Start scanning for free →
          </Link>
        </FadeIn>
      </section>

      {/* FOOTER */}
      <footer
        style={{
          borderTop: `1px solid ${COLORS.border}`,
          padding: '40px 20px',
          textAlign: 'center',
        }}
      >
        <p style={{ margin: '0 0 16px', fontSize: 14, fontWeight: 600 }}>
          ABC AI Business Card · Scan. Know. Connect.
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
          <Link href="/privacy" style={{ color: COLORS.muted, fontSize: 13, textDecoration: 'none' }}>
            Privacy Policy
          </Link>
          <Link href="/terms" style={{ color: COLORS.muted, fontSize: 13, textDecoration: 'none' }}>
            Terms
          </Link>
          <Link href="/pricing" style={{ color: COLORS.muted, fontSize: 13, textDecoration: 'none' }}>
            Pricing
          </Link>
        </div>
        <p style={{ margin: 0, fontSize: 12, color: COLORS.muted, opacity: 0.7 }}>
          © 2026 abccard.io
        </p>
      </footer>
    </div>
  )
}
