'use client'

import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode, type CSSProperties } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClientComponent } from '@/lib/supabase'
import {
  IconClock,
  IconMessage2,
  IconTrendingDown,
  IconScan,
  IconBrain,
  IconMail,
  IconShieldCheck,
  IconChartBar,
  IconBuildingSkyscraper,
  IconMicrophone2,
  IconUsers,
  IconUsersGroup,
  IconBriefcase,
  IconMapPin,
  IconTargetArrow,
  IconCircleCheck,
  IconCheck,
  IconQrcode,
  IconArrowNarrowRight,
  IconPlayerPlayFilled,
  IconActivityHeartbeat,
  IconBrandLinkedin,
  IconBrandWhatsapp,
  IconSparkles,
  type TablerIcon,
} from '@tabler/icons-react'

const DemoQrCode = dynamic(() => import('@/components/landing/DemoQrCode'), {
  ssr: false,
  loading: () => <div className="skeleton-block w-[180px] h-[180px] rounded-2xl mx-auto" />,
})

const COLORS = {
  bg: '#0f0f0f',
  card: '#141414',
  border: '#1e1e1e',
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

const TRUST_POINTS = ['3 contacts free', 'No credit card', 'Setup in seconds']

/** Scan → Know → Connect → Approve → Convert */
const FLOW: { Icon: TablerIcon; title: string; desc: string; tone: 'pink' | 'cyan' }[] = [
  { Icon: IconScan, title: 'Scan', desc: 'Capture a business card in seconds.', tone: 'pink' },
  { Icon: IconBrain, title: 'Know', desc: 'AI researches and understands the person and company.', tone: 'pink' },
  { Icon: IconMail, title: 'Connect', desc: 'Get personalized LinkedIn, email and WhatsApp follow-ups.', tone: 'cyan' },
  { Icon: IconShieldCheck, title: 'Approve', desc: 'AI prepares. You decide. Nothing is sent without you.', tone: 'cyan' },
  { Icon: IconChartBar, title: 'Convert', desc: 'Follow up, export to your CRM and turn contacts into opportunities.', tone: 'cyan' },
]

const COMPANY_META: { Icon: TablerIcon; label: string; value: string }[] = [
  { Icon: IconUsersGroup, label: 'Company size', value: '250–500' },
  { Icon: IconBriefcase, label: 'Industry', value: 'MedTech' },
  { Icon: IconMapPin, label: 'Location', value: 'Germany' },
  { Icon: IconTargetArrow, label: 'Key focus', value: 'Diagnostics, AI' },
]

const FOLLOW_UPS: { Icon: TablerIcon; channel: string; color: string }[] = [
  { Icon: IconBrandLinkedin, channel: 'LinkedIn', color: '#00d4d4' },
  { Icon: IconMail, channel: 'Email', color: '#f0197d' },
  { Icon: IconBrandWhatsapp, channel: 'WhatsApp', color: '#25D366' },
]

const PAIN_POINTS: { Icon: TablerIcon; text: string }[] = [
  { Icon: IconClock, text: 'Hours of manual CRM data entry' },
  { Icon: IconMessage2, text: 'Generic messages nobody replies to' },
  { Icon: IconTrendingDown, text: 'Valuable contacts go cold within days' },
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

const USE_CASES: { Icon: TablerIcon; label: string }[] = [
  { Icon: IconBuildingSkyscraper, label: 'Trade shows' },
  { Icon: IconMicrophone2, label: 'Conferences' },
  { Icon: IconUsers, label: 'B2B meetings' },
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

/** The scanned business card — real HTML, stays sharp at every viewport. */
function ScannedCard() {
  return (
    <div className="abc-bizcard">
      <div className="abc-bizcard-top">
        <span className="abc-bizcard-mark">
          <IconActivityHeartbeat size={11} stroke={2.2} color="#ffffff" />
        </span>
        <span className="abc-bizcard-co">
          MedTech <span style={{ fontWeight: 500, color: '#6b7280' }}>GmbH</span>
        </span>
      </div>
      <div className="abc-bizcard-body">
        <div style={{ minWidth: 0 }}>
          <p className="abc-bizcard-name">Martin Novák</p>
          <p className="abc-bizcard-role">Head of Procurement</p>
          <p className="abc-bizcard-line">+49 170 123 4557</p>
          <p className="abc-bizcard-line">martin.novak@medtech.de</p>
          <p className="abc-bizcard-line">www.medtech-gmbh.de</p>
        </div>
        <IconQrcode size={30} stroke={1.4} color="#0f0f0f" />
      </div>
    </div>
  )
}

/**
 * Hero product composition: phone scanning a card → contact intelligence → follow-up.
 * Built entirely from HTML/CSS so the product copy stays real text at any size.
 */
function HeroStage() {
  return (
    <div className="abc-stage">
      {/* 1 — Scanner */}
      <div className="abc-stage-phone">
        <div className="abc-phone">
          <div className="abc-phone-screen">
            <div className="abc-phone-bar">
              <span>9:41</span>
              <span className="abc-phone-notch" aria-hidden />
              <span className="abc-phone-signal" aria-hidden>
                <i /><i /><i /><i />
              </span>
            </div>
            <div className="abc-scan">
              <span className="abc-scan-corner tl" aria-hidden />
              <span className="abc-scan-corner tr" aria-hidden />
              <span className="abc-scan-corner bl" aria-hidden />
              <span className="abc-scan-corner br" aria-hidden />
              <span className="abc-scan-line" aria-hidden />
              <ScannedCard />
            </div>
            <p className="abc-phone-caption">
              <strong>Scanning…</strong>
              Hold steady
            </p>
          </div>
        </div>
      </div>

      {/* 2 — Contact captured + AI intelligence */}
      <div className="abc-stage-intel abc-panel">
        <span className="abc-panel-label">
          <span className="abc-live-dot" aria-hidden />
          Contact captured
        </span>

        <div className="abc-contact">
          <span className="abc-contact-avatar" aria-hidden>MN</span>
          <div style={{ minWidth: 0 }}>
            <p className="abc-contact-name">Martin Novák</p>
            <p className="abc-contact-meta">
              Head of Procurement
              <br />
              MedTech GmbH
            </p>
          </div>
          <span className="abc-chip-match">Match 92</span>
        </div>

        <div>
          <div className="abc-score-head">
            <span>Opportunity score</span>
            <b>92%</b>
          </div>
          <div className="abc-score-track">
            <div className="abc-score-fill" style={{ width: '92%' }} />
          </div>
        </div>

        <p className="abc-panel-label" style={{ color: COLORS.cyan, marginTop: 16 }}>
          <IconSparkles size={12} stroke={2} color={COLORS.cyan} />
          AI contact intelligence
        </p>
        <p className="abc-insight">
          MedTech GmbH is expanding diagnostics procurement this quarter — Martin is the primary
          decision-maker.
        </p>

        <div className="abc-meta-list">
          {COMPANY_META.map(({ Icon, label, value }) => (
            <div key={label} className="abc-meta-row">
              <Icon size={13} stroke={1.6} color="#6b7280" />
              <span>{label}</span>
              <b>{value}</b>
            </div>
          ))}
        </div>
      </div>

      {/* 3 — Follow-up ready */}
      <div className="abc-stage-follow abc-panel">
        <span className="abc-panel-label">Follow-up ready</span>
        <div className="abc-follow-list">
          {FOLLOW_UPS.map(({ Icon, channel, color }) => (
            <div key={channel} className="abc-follow-row">
              <span className="abc-follow-icon" style={{ background: `${color}1a` }} aria-hidden>
                <Icon size={15} stroke={1.8} color={color} />
              </span>
              <div style={{ minWidth: 0 }}>
                <p className="abc-follow-name">{channel}</p>
                <p className="abc-follow-sub">Personalized</p>
              </div>
              <span className="abc-approve">Approve</span>
            </div>
          ))}
        </div>
        <p className="abc-follow-note">
          <IconShieldCheck size={13} stroke={1.7} color="#6b7280" />
          You approve. Nothing is ever auto-sent.
        </p>
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
    <div style={{ background: COLORS.bg, color: COLORS.text, minHeight: '100vh', overflowX: 'hidden' }}>
      {/* NAVBAR */}
      <nav
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 50,
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          background: '#0f0f0fd9',
          borderBottom: '1px solid #1a1a1a',
        }}
      >
        <div
          style={{
            maxWidth: 1340,
            margin: '0 auto',
            padding: '14px 20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
          }}
        >
          <Link href="/" style={{ textDecoration: 'none' }}>
            <span style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.03em', ...gradientText }}>
              ABC
            </span>
          </Link>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Link
              href="/login"
              className="interactive"
              style={{
                color: COLORS.muted,
                textDecoration: 'none',
                fontSize: 14,
                fontWeight: 500,
                padding: '8px 14px',
                borderRadius: 10,
              }}
            >
              Sign in
            </Link>
            <Link
              href="/register"
              className="abc-btn abc-btn-primary interactive-primary"
              style={{ padding: '11px 20px', fontSize: 14 }}
            >
              Try ABC Card free
            </Link>
          </div>
        </div>
      </nav>

      {/* HERO */}
      <section id="hero" style={{ position: 'relative', overflow: 'hidden' }}>
        <div
          aria-hidden
          style={{
            position: 'absolute',
            top: -160,
            right: -140,
            width: 620,
            height: 620,
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(240,25,125,0.05), transparent 70%)',
            pointerEvents: 'none',
          }}
        />
        <div
          aria-hidden
          style={{
            position: 'absolute',
            bottom: -140,
            left: -120,
            width: 460,
            height: 460,
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(0,212,212,0.035), transparent 70%)',
            pointerEvents: 'none',
          }}
        />
        <div
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            backgroundImage:
              'linear-gradient(#ffffff06 1px, transparent 1px), linear-gradient(90deg, #ffffff06 1px, transparent 1px)',
            backgroundSize: '68px 68px',
            maskImage: 'radial-gradient(90% 70% at 50% 0%, #000 40%, transparent 100%)',
            WebkitMaskImage: 'radial-gradient(90% 70% at 50% 0%, #000 40%, transparent 100%)',
            pointerEvents: 'none',
          }}
        />

        <div className="abc-section abc-hero" style={{ position: 'relative' }}>
          <div>
            <p className="abc-eyebrow">
              <span className="abc-eyebrow-dot" aria-hidden />
              AI-powered networking for B2B events
            </p>
            <h1 className="abc-h1">
              Never lose a <span style={{ color: COLORS.pink }}>valuable contact</span> after an event
              again.
            </h1>
            <p className="abc-lead">
              Scan the business card. AI researches the person and company, finds the right angle, and
              prepares your personalized follow-up. You just approve.
            </p>
            <div className="abc-cta-row">
              <Link href="/register" className="abc-btn abc-btn-primary interactive-primary">
                Try ABC Card free
                <IconArrowNarrowRight size={18} stroke={2} />
              </Link>
              <button type="button" onClick={() => scrollTo('how-it-works')} className="abc-btn abc-btn-ghost">
                See how it works
                <span className="abc-btn-play" aria-hidden>
                  <IconPlayerPlayFilled size={9} color="#ffffff" />
                </span>
              </button>
            </div>
            <p className="abc-trust">
              {TRUST_POINTS.map((point) => (
                <span key={point} className="abc-trust-item">
                  <IconCircleCheck size={15} stroke={1.8} color={COLORS.cyan} />
                  {point}
                </span>
              ))}
            </p>
          </div>

          <HeroStage />
        </div>
      </section>

      {/* WORKFLOW — one continuous process */}
      <section id="how-it-works" className="abc-section" style={{ paddingTop: 0 }}>
        <FadeIn>
          <div className="abc-flow">
            {FLOW.map(({ Icon, title, desc, tone }, i) => (
              <Fragment key={title}>
                <div className="abc-flow-step">
                  <div className="abc-flow-icon">
                    <Icon size={34} stroke={1.5} color={tone === 'pink' ? COLORS.pink : COLORS.cyan} />
                  </div>
                  <div className="abc-flow-head">
                    <span className="abc-flow-num" style={{ color: tone === 'pink' ? COLORS.pink : COLORS.cyan }}>
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    <h3 className="abc-flow-title">{title}</h3>
                  </div>
                  <p className="abc-flow-desc">{desc}</p>
                </div>
                {i < FLOW.length - 1 && (
                  <div className="abc-flow-arrow" aria-hidden>
                    <IconArrowNarrowRight size={22} stroke={1.5} />
                  </div>
                )}
              </Fragment>
            ))}
          </div>

          {/* VALUE STRIP */}
          <div className="abc-strip" style={{ marginTop: 20 }}>
            <div className="abc-strip-cell">
              <span className="abc-strip-num" style={{ color: COLORS.pink }}>50</span>
              <span className="abc-strip-label">
                <b>business cards</b>
                after an event
              </span>
            </div>
            <div className="abc-strip-cell">
              <span className="abc-strip-num abc-strip-num-sm" style={{ color: COLORS.cyan }}>
                Near-zero
              </span>
              <span className="abc-strip-label">
                <b>manual follow-up</b>
                AI drafts, you approve
              </span>
            </div>
            <div className="abc-strip-cell">
              <IconShieldCheck size={30} stroke={1.5} color={COLORS.cyan} style={{ flexShrink: 0 }} />
              <span className="abc-strip-label">
                <b>You stay in control.</b>
                We handle the rest.
              </span>
            </div>
          </div>
        </FadeIn>
      </section>

      {/* PROBLEM */}
      <section id="problem" className="abc-section">
        <FadeIn>
          <h2 className="abc-h2" style={{ textAlign: 'center', maxWidth: 720, margin: '0 auto 44px' }}>
            You come back from every event with{' '}
            <span style={{ color: COLORS.pink }}>50 business cards</span>.
          </h2>
        </FadeIn>
        <div className="abc-grid-3">
          {PAIN_POINTS.map(({ Icon, text }) => (
            <FadeIn key={text}>
              <div className="abc-card">
                <Icon size={26} stroke={1.5} color={COLORS.pink} />
                <p style={{ margin: '18px 0 0', fontSize: 16, fontWeight: 600, lineHeight: 1.5, color: COLORS.text }}>
                  {text}
                </p>
              </div>
            </FadeIn>
          ))}
        </div>
      </section>

      {/* DIGITAL CARD / QR — reverse lead capture */}
      <section id="digital-card" className="abc-section" style={{ maxWidth: 1120 }}>
        <FadeIn>
          <div
            style={{
              border: `1px solid ${COLORS.border}`,
              borderRadius: 24,
              background: '#101010',
              padding: 'clamp(28px, 4vw, 52px)',
            }}
          >
            <div className="abc-split">
              <DemoQrCode />
              <div>
                <p className="abc-eyebrow" style={{ color: COLORS.cyan, marginBottom: 14 }}>
                  Beyond the digital card
                </p>
                <h2 className="abc-h2">
                  Your digital card. <span style={{ color: COLORS.pink }}>Their lead.</span>
                </h2>
                <p style={{ fontSize: 16, lineHeight: 1.68, color: COLORS.muted, margin: '0 0 24px' }}>
                  Share your QR code. They get your digital card. You capture their details. Every
                  handshake can become a two-way connection.
                </p>
                <div style={{ display: 'grid', gap: 14, marginBottom: 24 }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 11 }}>
                    <IconScan size={18} stroke={1.6} color={COLORS.cyan} style={{ flexShrink: 0, marginTop: 2 }} />
                    <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.55, color: COLORS.text }}>
                      <strong style={{ fontWeight: 600 }}>You scan their card</strong> — ABC Card enriches
                      it and prepares your follow-up.
                    </p>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 11 }}>
                    <IconQrcode size={18} stroke={1.6} color={COLORS.pink} style={{ flexShrink: 0, marginTop: 2 }} />
                    <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.55, color: COLORS.text }}>
                      <strong style={{ fontWeight: 600 }}>They scan your QR</strong> — they get your
                      digital card, and you capture their details.
                    </p>
                  </div>
                </div>
                <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.6, color: '#6b7280' }}>
                  ABC Card isn&apos;t just a digital business card — it&apos;s an AI-powered networking and
                  follow-up platform.
                </p>
              </div>
            </div>
          </div>
        </FadeIn>
      </section>

      {/* PRICING */}
      <section id="pricing" className="abc-section">
        <FadeIn>
          <h2 className="abc-h2" style={{ textAlign: 'center', margin: '0 0 44px' }}>
            Simple pricing
          </h2>
        </FadeIn>
        <div className="abc-price-grid">
          {PLANS.map((plan) => (
            <FadeIn key={plan.name}>
              <div
                style={{
                  position: 'relative',
                  display: 'flex',
                  flexDirection: 'column',
                  height: '100%',
                  padding: 24,
                  borderRadius: 16,
                  background: COLORS.card,
                  border: plan.highlight ? `1px solid ${COLORS.pink}59` : `1px solid ${COLORS.border}`,
                  boxShadow: plan.highlight ? '0 10px 40px rgba(240, 25, 125, 0.08)' : 'none',
                }}
              >
                {plan.badge && (
                  <span
                    style={{
                      position: 'absolute',
                      top: -11,
                      left: 24,
                      fontSize: 10.5,
                      fontWeight: 700,
                      letterSpacing: '0.04em',
                      padding: '4px 10px',
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
                    margin: '0 0 6px',
                    fontSize: 11.5,
                    fontWeight: 700,
                    color: COLORS.muted,
                    letterSpacing: '0.12em',
                  }}
                >
                  {plan.name}
                </p>
                <p style={{ margin: '0 0 22px', fontSize: 30, fontWeight: 700, letterSpacing: '-0.03em' }}>
                  {plan.price}
                  <span style={{ fontSize: 13.5, fontWeight: 500, color: COLORS.muted }}>{plan.period}</span>
                </p>
                <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 24px', flex: 1, display: 'grid', gap: 10 }}>
                  {plan.features.map((f) => (
                    <li
                      key={f}
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: 8,
                        fontSize: 13.5,
                        lineHeight: 1.45,
                        color: COLORS.muted,
                      }}
                    >
                      <IconCheck size={14} stroke={2.2} color={COLORS.cyan} style={{ marginTop: 3, flexShrink: 0 }} />
                      {f}
                    </li>
                  ))}
                </ul>
                <Link
                  href="/pricing"
                  className={`abc-btn ${plan.highlight ? 'abc-btn-primary interactive-primary' : 'abc-btn-ghost'}`}
                  style={{ width: '100%', padding: '11px 16px', fontSize: 13.5 }}
                >
                  {plan.cta}
                </Link>
              </div>
            </FadeIn>
          ))}
        </div>
      </section>

      {/* TARGET AUDIENCE */}
      <section id="use-cases" className="abc-section" style={{ maxWidth: 900, textAlign: 'center' }}>
        <FadeIn>
          <p
            style={{
              fontSize: 'clamp(18px, 2vw, 22px)',
              color: COLORS.text,
              fontWeight: 600,
              lineHeight: 1.55,
              letterSpacing: '-0.02em',
              margin: '0 0 30px',
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
                  gap: 9,
                  padding: '11px 20px',
                  borderRadius: 999,
                  background: COLORS.card,
                  border: `1px solid ${COLORS.border}`,
                  fontSize: 14,
                  fontWeight: 500,
                  color: COLORS.text,
                }}
              >
                <Icon size={17} stroke={1.6} color={COLORS.muted} />
                {label}
              </span>
            ))}
          </div>
        </FadeIn>
      </section>

      {/* FINAL CTA */}
      <section id="cta" className="abc-section" style={{ maxWidth: 860, textAlign: 'center' }}>
        <FadeIn>
          <h2
            className="abc-h2"
            style={{ fontSize: 'clamp(28px, 3.8vw, 46px)', margin: '0 0 28px' }}
          >
            Turn your next handshake into your next opportunity.
          </h2>
          <Link
            href="/register"
            className="abc-btn abc-btn-primary interactive-primary"
            style={{ fontSize: 16, padding: '16px 30px' }}
          >
            Try ABC Card free
            <IconArrowNarrowRight size={19} stroke={2} />
          </Link>
          <p style={{ margin: '18px 0 0', fontSize: 13, color: COLORS.muted }}>
            3 contacts free · No credit card required
          </p>
        </FadeIn>
      </section>

      {/* FOOTER */}
      <footer style={{ borderTop: `1px solid ${COLORS.border}`, padding: '40px 20px', textAlign: 'center' }}>
        <p style={{ margin: '0 0 16px', fontSize: 14, fontWeight: 600, letterSpacing: '-0.01em' }}>
          ABC AI Business Card · Scan. Know. Connect.
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 22, marginBottom: 16 }}>
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
        <p style={{ margin: 0, fontSize: 12, color: COLORS.muted, opacity: 0.7 }}>© 2026 abccard.io</p>
      </footer>
    </div>
  )
}
