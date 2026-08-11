'use client'

import { useEffect, useMemo, useRef, useState, type ReactNode, type CSSProperties } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClientComponent } from '@/lib/supabase'
import {
  IconClock,
  IconMessage2,
  IconTrendingDown,
  IconScan,
  IconSparkles,
  IconMail,
  IconShieldCheck,
  IconChartBar,
  IconBuildingSkyscraper,
  IconMicrophone2,
  IconUsers,
  IconBolt,
  IconTargetArrow,
  IconLock,
  IconCheck,
  IconQrcode,
  IconBrandLinkedin,
  IconBrandWhatsapp,
  type TablerIcon,
} from '@tabler/icons-react'

const DemoQrCode = dynamic(() => import('@/components/landing/DemoQrCode'), {
  ssr: false,
  loading: () => <div className="skeleton-block w-[180px] h-[180px] rounded-2xl mx-auto" />,
})

type IconType = TablerIcon

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

const PAIN_POINTS: { Icon: IconType; text: string }[] = [
  { Icon: IconClock, text: 'Hours of manual CRM data entry' },
  { Icon: IconMessage2, text: 'Generic messages nobody replies to' },
  { Icon: IconTrendingDown, text: 'Valuable contacts go cold within days' },
]

const STEPS: { Icon: IconType; title: string; desc: string }[] = [
  { Icon: IconScan, title: 'Scan', desc: 'Capture a business card in seconds.' },
  { Icon: IconSparkles, title: 'Know', desc: 'AI enriches the contact with person, company and relevant business data.' },
  { Icon: IconMail, title: 'Connect', desc: 'Get personalized LinkedIn, email and WhatsApp follow-ups.' },
  { Icon: IconShieldCheck, title: 'Approve', desc: 'AI prepares. You decide. Nothing is sent without you.' },
  { Icon: IconChartBar, title: 'Convert', desc: 'Follow up, export to your CRM and turn contacts into opportunities.' },
]

const PLANS = [
  {
    name: 'FREE',
    price: '$0',
    period: '/mo',
    badge: null as string | null,
    features: ['3 contacts free', 'Basic AI messages', 'Contact export'],
    cta: 'Try ABC Card free',
    highlight: false,
  },
  {
    name: 'STARTER',
    price: '$29',
    period: '/mo',
    badge: 'Most popular',
    features: ['50 contacts/month', 'AI messages + enrichment', 'Follow-up sequences', 'CSV export'],
    cta: 'Get Starter',
    highlight: true,
  },
  {
    name: 'GROWTH',
    price: '$49',
    period: '/mo',
    badge: null,
    features: ['100 contacts/month', 'Everything in Starter', 'Salesforce & HubSpot export', 'Pipeline analytics'],
    cta: 'Get Growth',
    highlight: false,
  },
  {
    name: 'PRO',
    price: '$89',
    period: '/mo',
    badge: null,
    features: ['200 contacts/month', 'Everything in Growth', 'Priority support', 'Advanced analytics'],
    cta: 'Get Pro',
    highlight: false,
  },
  {
    name: 'TEAM',
    price: '$199',
    period: '/mo',
    badge: null,
    features: ['500 contacts/month', '5 users included', 'Shared contacts', 'Admin dashboard'],
    cta: 'Contact sales',
    highlight: false,
  },
]

const USE_CASES: { Icon: IconType; label: string }[] = [
  { Icon: IconBuildingSkyscraper, label: 'Trade shows' },
  { Icon: IconMicrophone2, label: 'Conferences' },
  { Icon: IconUsers, label: 'B2B meetings' },
]

const HERO_STATS: { Icon: IconType; label: string; sublabel: string }[] = [
  { Icon: IconBolt, label: '10 sec', sublabel: 'avg. scan to message' },
  { Icon: IconTargetArrow, label: '3 channels', sublabel: 'LinkedIn · Email · WhatsApp' },
  { Icon: IconLock, label: 'You approve', sublabel: 'always. never auto-send' },
]

const MOCK_MESSAGES = [
  { channel: 'LinkedIn', Icon: IconBrandLinkedin, color: '#00d4d4' },
  { channel: 'Email', Icon: IconMail, color: '#f0197d' },
  { channel: 'WhatsApp', Icon: IconBrandWhatsapp, color: '#25D366' },
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
  color: COLORS.text,
  border: `1.5px solid ${COLORS.border}`,
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

/** Card with a thin #f0197d → #00d4d4 gradient border — used sparingly as an accent, not a fill. */
function GradientBorderCard({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        background: 'linear-gradient(135deg, #f0197d55, #00d4d455)',
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

function IconBadge({ Icon, tone = 'pink' }: { Icon: IconType; tone?: 'pink' | 'cyan' | 'neutral' }) {
  const bg = tone === 'pink' ? 'rgba(240, 25, 125, 0.1)' : tone === 'cyan' ? 'rgba(0, 212, 212, 0.1)' : COLORS.border
  const color = tone === 'pink' ? COLORS.pink : tone === 'cyan' ? COLORS.cyan : COLORS.text
  return (
    <div
      style={{
        width: 40,
        height: 40,
        borderRadius: 10,
        background: bg,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 14,
      }}
    >
      <Icon size={20} stroke={1.75} color={color} />
    </div>
  )
}

/** Realistic product UI panel — mirrors the actual scanned-contact / enrichment / approve flow. */
function HeroMockup() {
  return (
    <div
      className="hero-phone-glow-wrap"
      style={{
        width: '100%',
        maxWidth: 460,
        borderRadius: 20,
        background: 'linear-gradient(180deg, #161616, #0d0d0d)',
        border: '1px solid #262626',
        boxShadow: '0 24px 64px rgba(0, 0, 0, 0.55), 0 0 60px rgba(240,25,125,0.08), 0 0 100px rgba(0,212,212,0.06)',
        margin: '0 auto',
        overflow: 'hidden',
      }}
    >
      {/* Window chrome */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '12px 16px',
          borderBottom: '1px solid #232323',
        }}
      >
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#3a3a3a' }} />
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#3a3a3a' }} />
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#3a3a3a' }} />
        <span style={{ marginLeft: 8, fontSize: 11, color: COLORS.muted, fontWeight: 600 }}>
          ABC Card — Contact captured
        </span>
      </div>

      <div style={{ padding: '18px 18px 20px' }}>
        {/* Contact header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: '50%',
              background: GRADIENT,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 14,
              fontWeight: 800,
              color: '#fff',
              flexShrink: 0,
            }}
          >
            MN
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: COLORS.text }}>Martin Novák</p>
            <p style={{ margin: '1px 0 0', fontSize: 11.5, color: COLORS.muted }}>
              Head of Procurement · MedTech GmbH
            </p>
          </div>
          <span
            className="hero-phone-score-badge"
            style={{
              fontSize: 11,
              fontWeight: 700,
              padding: '5px 10px',
              borderRadius: 8,
              background: 'rgba(240, 25, 125, 0.12)',
              color: COLORS.pink,
              whiteSpace: 'nowrap',
            }}
          >
            Match 92
          </span>
        </div>

        {/* Match score bar */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ fontSize: 11, color: COLORS.muted, fontWeight: 600 }}>Opportunity score</span>
            <span style={{ fontSize: 11, color: COLORS.text, fontWeight: 700 }}>92%</span>
          </div>
          <div style={{ height: 5, borderRadius: 999, background: COLORS.border, overflow: 'hidden' }}>
            <div style={{ width: '92%', height: '100%', borderRadius: 999, background: GRADIENT }} />
          </div>
        </div>

        {/* AI intelligence */}
        <div
          style={{
            padding: '10px 12px',
            borderRadius: 10,
            background: '#151515',
            border: `1px solid ${COLORS.border}`,
            marginBottom: 14,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
            <IconSparkles size={13} stroke={2} color={COLORS.cyan} />
            <span style={{ fontSize: 10.5, fontWeight: 700, color: COLORS.cyan, letterSpacing: '0.04em' }}>
              AI CONTACT INTELLIGENCE
            </span>
          </div>
          <p style={{ margin: 0, fontSize: 11.5, lineHeight: 1.5, color: COLORS.muted }}>
            MedTech GmbH is expanding diagnostics procurement this quarter — Martin is the primary decision-maker.
          </p>
        </div>

        {/* Channel rows */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {MOCK_MESSAGES.map((msg) => (
            <div
              key={msg.channel}
              className="landing-hero-msg"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 10,
                padding: '9px 11px',
                borderRadius: 9,
                background: COLORS.card,
                border: `1px solid ${COLORS.border}`,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                <msg.Icon size={15} stroke={1.75} color={msg.color} />
                <span style={{ fontSize: 11.5, fontWeight: 600, color: COLORS.text }}>{msg.channel} message ready</span>
              </div>
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  padding: '4px 10px',
                  borderRadius: 6,
                  background: `${msg.color}1f`,
                  color: msg.color,
                  whiteSpace: 'nowrap',
                }}
              >
                Approve
              </span>
            </div>
          ))}
        </div>

        {/* Trust line */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 14 }}>
          <IconShieldCheck size={13} stroke={1.75} color={COLORS.muted} />
          <span style={{ fontSize: 10.5, color: COLORS.muted }}>You approve. Nothing is ever auto-sent.</span>
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
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          background: '#0f0f0f90',
          borderBottom: '1px solid #1a1a1a',
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
              className="interactive"
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
            <Link href="/register" className="interactive-primary" style={{ ...btnGradient, padding: '10px 20px', fontSize: 14 }}>
              Try ABC Card free
            </Link>
          </div>
        </div>
      </nav>

      {/* HERO */}
      <section id="hero" style={{ position: 'relative', overflow: 'hidden' }}>
        {/* Ambient glows — restrained */}
        <div
          aria-hidden
          style={{
            position: 'absolute',
            top: -120,
            right: -120,
            width: 600,
            height: 600,
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(240,25,125,0.05), transparent 70%)',
            pointerEvents: 'none',
          }}
        />
        <div
          aria-hidden
          style={{
            position: 'absolute',
            bottom: -100,
            left: -100,
            width: 400,
            height: 400,
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(0,212,212,0.035), transparent 70%)',
            pointerEvents: 'none',
          }}
        />
        {/* Grid overlay */}
        <div
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            backgroundImage:
              'linear-gradient(#ffffff08 1px, transparent 1px), linear-gradient(90deg, #ffffff08 1px, transparent 1px)',
            backgroundSize: '60px 60px',
            pointerEvents: 'none',
          }}
        />

        <div
          style={{
            position: 'relative',
            maxWidth: 1200,
            margin: '0 auto',
            padding: '72px 20px 56px',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
            gap: 48,
            alignItems: 'center',
          }}
        >
          <div>
            <span
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                color: COLORS.muted,
                marginBottom: 18,
              }}
            >
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: GRADIENT, flexShrink: 0 }} />
              AI-powered networking for B2B events
            </span>
            <h1
              style={{
                fontSize: 'clamp(2.25rem, 5.2vw, 3.25rem)',
                fontWeight: 800,
                lineHeight: 1.12,
                letterSpacing: '-0.03em',
                margin: '0 0 20px',
                color: COLORS.text,
              }}
            >
              Never lose a <span style={{ color: COLORS.pink }}>valuable contact</span> after an event again.
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
              Scan the business card. AI researches the person and company, finds the right angle, and
              prepares your personalized follow-up. You just approve.
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
              <Link href="/register" className="interactive-primary" style={btnGradient}>
                Try ABC Card free →
              </Link>
              <button type="button" className="interactive" onClick={() => scrollTo('how-it-works')} style={btnOutline}>
                See how it works
              </button>
            </div>
            <p style={{ fontSize: 13, color: COLORS.muted, margin: '0 0 32px' }}>
              3 contacts free · No credit card · Setup in seconds
            </p>

            {/* STATS ROW */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
              {HERO_STATS.map((stat) => (
                <div
                  key={stat.label}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '10px 16px',
                    borderRadius: 12,
                    background: COLORS.card,
                    border: `1px solid ${COLORS.border}`,
                  }}
                >
                  <stat.Icon size={16} stroke={1.75} color={COLORS.muted} />
                  <div>
                    <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: COLORS.text }}>{stat.label}</p>
                    <p style={{ margin: '2px 0 0', fontSize: 11, color: '#6b7280' }}>{stat.sublabel}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <HeroMockup />
        </div>
      </section>

      {/* SUPPORTING CLAIM */}
      <section
        style={{
          borderTop: `1px solid ${COLORS.border}`,
          borderBottom: `1px solid ${COLORS.border}`,
          padding: '40px 20px',
          textAlign: 'center',
        }}
      >
        <FadeIn>
          <p
            style={{
              margin: 0,
              fontSize: 'clamp(1.35rem, 3.4vw, 1.9rem)',
              fontWeight: 800,
              letterSpacing: '-0.02em',
              lineHeight: 1.35,
            }}
          >
            50 business cards. <span style={{ color: COLORS.pink }}>Zero hours</span> of manual follow-up.
          </p>
        </FadeIn>
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
                <IconBadge Icon={p.Icon} tone="pink" />
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
            Five steps from handshake to opportunity
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
                  textAlign: 'left',
                  padding: 26,
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
                    top: 16,
                    right: 18,
                    fontSize: 12,
                    fontWeight: 700,
                    color: '#4b5563',
                  }}
                >
                  {String(i + 1).padStart(2, '0')}
                </span>
                <IconBadge Icon={step.Icon} tone={i % 2 === 0 ? 'cyan' : 'pink'} />
                <h3 style={{ margin: '0 0 8px', fontSize: 16, fontWeight: 700 }}>{step.title}</h3>
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
              <span
                style={{
                  display: 'block',
                  fontSize: 12,
                  fontWeight: 700,
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  color: COLORS.cyan,
                  marginBottom: 12,
                }}
              >
                Beyond the digital card
              </span>
              <h2
                style={{
                  fontSize: 'clamp(1.5rem, 4vw, 2.25rem)',
                  fontWeight: 800,
                  margin: '0 0 16px',
                  letterSpacing: '-0.02em',
                }}
              >
                Your digital card. <span style={{ color: COLORS.pink }}>Their lead.</span>
              </h2>
              <p style={{ fontSize: 16, lineHeight: 1.7, color: COLORS.muted, margin: '0 0 20px' }}>
                Share your QR code. They get your digital card. You capture their details. Every
                handshake can become a two-way connection.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                  <div style={{ marginTop: 1, flexShrink: 0 }}>
                    <IconScan size={17} stroke={1.75} color={COLORS.cyan} />
                  </div>
                  <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5, color: COLORS.text }}>
                    <strong>You scan their card</strong> — ABC Card enriches it and prepares your follow-up.
                  </p>
                </div>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                  <div style={{ marginTop: 1, flexShrink: 0 }}>
                    <IconQrcode size={17} stroke={1.75} color={COLORS.pink} />
                  </div>
                  <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5, color: COLORS.text }}>
                    <strong>They scan your QR</strong> — they get your digital card, and you capture their details.
                  </p>
                </div>
              </div>
              <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6, color: '#6b7280', fontStyle: 'italic' }}>
                ABC Card isn&apos;t just a digital business card — it&apos;s an AI-powered networking and
                follow-up platform.
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
                className="interactive"
                style={{
                  padding: 26,
                  borderRadius: 16,
                  background: COLORS.card,
                  border: plan.highlight ? `1px solid ${COLORS.pink}66` : `1px solid ${COLORS.border}`,
                  height: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  position: 'relative',
                  boxShadow: plan.highlight ? '0 8px 32px rgba(240, 25, 125, 0.1)' : 'none',
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
                    color: COLORS.muted,
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
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: 8,
                        fontSize: 14,
                        color: COLORS.muted,
                        marginBottom: 10,
                      }}
                    >
                      <IconCheck size={15} stroke={2} color={COLORS.cyan} style={{ marginTop: 2, flexShrink: 0 }} />
                      {f}
                    </li>
                  ))}
                </ul>
                <Link
                  href="/pricing"
                  className="interactive-primary"
                  style={{
                    ...btnGradient,
                    width: '100%',
                    textAlign: 'center',
                    padding: '12px 16px',
                    fontSize: 14,
                    background: plan.highlight ? GRADIENT : 'transparent',
                    color: plan.highlight ? '#fff' : COLORS.text,
                    border: plan.highlight ? 'none' : `1px solid ${COLORS.border}`,
                    boxShadow: plan.highlight ? '0 4px 20px rgba(240, 25, 125, 0.3)' : 'none',
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
            {USE_CASES.map(({ Icon, label }) => (
              <span
                key={label}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '10px 20px',
                  borderRadius: 999,
                  background: COLORS.card,
                  border: `1px solid ${COLORS.border}`,
                  fontSize: 14,
                  fontWeight: 600,
                  color: COLORS.text,
                }}
              >
                <Icon size={16} stroke={1.75} color={COLORS.muted} />
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
            Turn your next handshake into your next opportunity.
          </h2>
          <Link href="/register" className="interactive-primary" style={{ ...btnGradient, fontSize: 16, padding: '16px 32px', borderRadius: 14 }}>
            Try ABC Card free →
          </Link>
          <p style={{ margin: '16px 0 0', fontSize: 13, color: COLORS.muted }}>
            3 contacts free · No credit card required
          </p>
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
          <Link href="/privacy" className="interactive" style={{ color: COLORS.muted, fontSize: 13, textDecoration: 'none' }}>
            Privacy Policy
          </Link>
          <Link href="/terms" className="interactive" style={{ color: COLORS.muted, fontSize: 13, textDecoration: 'none' }}>
            Terms
          </Link>
          <Link href="/pricing" className="interactive" style={{ color: COLORS.muted, fontSize: 13, textDecoration: 'none' }}>
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
