'use client'

import { useCallback, useEffect, useState, type CSSProperties } from 'react'

const STEP_DURATIONS = [2000, 2000, 3000, 2000] as const
const STEP_LABELS = ['Scan', 'Enrich', 'Messages', 'Approve'] as const

const ENRICH_SOURCES = [
  { icon: '🔍', label: 'Claude Vision', desc: 'extracting data' },
  { icon: '👤', label: 'Apollo.io', desc: 'company intel' },
  { icon: '💼', label: 'Enrich Layer', desc: 'LinkedIn profile' },
  { icon: '🌐', label: 'Perplexity', desc: 'latest news' },
]

const MESSAGES = [
  {
    id: 'linkedin',
    label: 'LinkedIn',
    borderColor: '#00d4d4',
    labelColor: '#00d4d4',
    preview: 'Hi Martin — loved our chat at SaaStr...',
    full: 'Hi Martin — loved our chat at SaaStr. Your work on AI diagnostics is exactly what we\'re building toward. Would love to connect properly.',
  },
  {
    id: 'email',
    label: 'Email',
    borderColor: '#f0197d',
    labelColor: '#f0197d',
    preview: 'Subject: Following up from SaaStr...',
    full: 'Subject: Following up from SaaStr\n\nHi Martin, great meeting you yesterday at the conference. I wanted to follow up on our conversation about AI diagnostics and share a few ideas that might align with your roadmap.',
  },
  {
    id: 'whatsapp',
    label: 'WhatsApp',
    borderColor: '#25D366',
    labelColor: '#25D366',
    preview: 'Hey Martin! Great meeting at SaaStr...',
    full: 'Hey Martin! Great meeting at SaaStr. Here\'s our deck 👋 Let me know if you want to grab a virtual coffee next week.',
  },
] as const

const COLORS = {
  bg: '#141628',
  text: '#f0f0ff',
  muted: '#8892b0',
  cyan: '#00d4d4',
  pink: '#f0197d',
  purple: '#8b5cf6',
}

function useIsMobile(breakpoint = 768) {
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpoint - 1}px)`)
    const update = () => setIsMobile(mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [breakpoint])

  return isMobile
}

function HeroDemoStatic() {
  return (
    <div
      className="hero-demo-static"
      style={{
        maxWidth: 420,
        width: '100%',
        margin: '0 auto',
        padding: '20px 0',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 10,
          marginBottom: 16,
        }}
      >
        <div
          style={{
            width: 72,
            height: 46,
            borderRadius: 6,
            background: 'linear-gradient(145deg, #1c1f35, #141628)',
            border: '1px solid rgba(0, 212, 212, 0.35)',
            padding: 8,
          }}
        >
          <div style={{ width: '55%', height: 5, borderRadius: 2, background: 'rgba(240,240,255,0.45)', marginBottom: 5 }} />
          <div style={{ width: '75%', height: 3, borderRadius: 2, background: 'rgba(136,146,176,0.4)' }} />
        </div>
        <span style={{ color: COLORS.cyan, fontSize: 18 }}>→</span>
        <span style={{ fontSize: 22 }}>✉️</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {MESSAGES.map((msg) => (
          <div
            key={msg.id}
            style={{
              padding: '10px 12px',
              borderRadius: 10,
              background: COLORS.bg,
              border: `1px solid ${msg.borderColor}55`,
              borderLeftWidth: 3,
              borderLeftColor: msg.borderColor,
            }}
          >
            <span style={{ color: msg.labelColor, fontWeight: 700, fontSize: 10 }}>{msg.label}</span>
            <p style={{ margin: '4px 0 0', fontSize: 11, color: COLORS.muted, lineHeight: 1.4 }}>{msg.preview}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

function StepDots({ step }: { step: number }) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'center',
        gap: 8,
        position: 'absolute',
        bottom: 16,
        left: 0,
        right: 0,
      }}
    >
      {STEP_LABELS.map((label, i) => (
        <div
          key={label}
          title={label}
          style={{
            width: i === step ? 20 : 8,
            height: 8,
            borderRadius: 999,
            background: i === step ? COLORS.cyan : 'rgba(136, 146, 176, 0.35)',
            transition: 'width 0.3s ease, background 0.3s ease',
          }}
        />
      ))}
    </div>
  )
}

function HeroDemoAnimated() {
  const [step, setStep] = useState(0)
  const [paused, setPaused] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [visibleMessages, setVisibleMessages] = useState(0)
  const [visibleSources, setVisibleSources] = useState(0)
  const [approvePhase, setApprovePhase] = useState(0)

  const toggleExpand = useCallback((id: string) => {
    setExpanded((prev) => (prev === id ? null : id))
  }, [])

  useEffect(() => {
    if (paused) return
    const timer = window.setTimeout(() => {
      setStep((s) => (s + 1) % 4)
      setExpanded(null)
    }, STEP_DURATIONS[step])
    return () => window.clearTimeout(timer)
  }, [step, paused])

  useEffect(() => {
    if (step !== 1 || paused) {
      if (step !== 1) setVisibleSources(0)
      return
    }
    setVisibleSources(0)
    const timers = ENRICH_SOURCES.map((_, i) =>
      window.setTimeout(() => setVisibleSources(i + 1), i * 400)
    )
    return () => timers.forEach(clearTimeout)
  }, [step, paused])

  useEffect(() => {
    if (step !== 2 || paused) {
      if (step !== 2) setVisibleMessages(0)
      return
    }
    setVisibleMessages(0)
    const timers = MESSAGES.map((_, i) =>
      window.setTimeout(() => setVisibleMessages(i + 1), i * 700)
    )
    return () => timers.forEach(clearTimeout)
  }, [step, paused])

  useEffect(() => {
    if (step !== 3 || paused) {
      if (step !== 3) setApprovePhase(0)
      return
    }
    setApprovePhase(0)
    setVisibleMessages(3)
    const t1 = window.setTimeout(() => setApprovePhase(1), 400)
    const t2 = window.setTimeout(() => setApprovePhase(2), 900)
    const t3 = window.setTimeout(() => setApprovePhase(3), 1400)
    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
      clearTimeout(t3)
    }
  }, [step, paused])

  const panelStyle: CSSProperties = {
    position: 'absolute',
    inset: '0 0 40px 0',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '24px 20px',
    opacity: 0,
    pointerEvents: 'none',
    transition: 'opacity 0.45s ease',
  }

  const activePanel = (s: number): CSSProperties => ({
    ...panelStyle,
    opacity: step === s ? 1 : 0,
    pointerEvents: step === s ? 'auto' : 'none',
  })

  return (
    <div
      className="hero-demo"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      style={{
        position: 'relative',
        maxWidth: 420,
        width: '100%',
        height: 480,
        margin: '0 auto',
        borderRadius: 20,
        background: 'linear-gradient(160deg, rgba(20,22,40,0.95), rgba(13,15,26,0.98))',
        border: '1px solid rgba(139, 92, 246, 0.2)',
        boxShadow: '0 16px 48px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255,255,255,0.04)',
        overflow: 'hidden',
      }}
    >
      {paused && (
        <div
          style={{
            position: 'absolute',
            top: 12,
            right: 12,
            fontSize: 10,
            fontWeight: 600,
            color: COLORS.muted,
            padding: '4px 8px',
            borderRadius: 6,
            background: 'rgba(0,0,0,0.3)',
            zIndex: 10,
          }}
        >
          Paused
        </div>
      )}

      {/* STEP 1 — SCAN */}
      <div style={activePanel(0)}>
        <div
          className={`hero-demo-scan-frame ${step === 0 ? 'hero-demo-scan-active' : ''}`}
          style={{ position: 'relative', width: 200, height: 130, marginBottom: 20 }}
        >
          <span className="scan-corner scan-corner-tl" />
          <span className="scan-corner scan-corner-tr" />
          <span className="scan-corner scan-corner-bl" />
          <span className="scan-corner scan-corner-br" />
          <div
            className="hero-demo-scan-glow"
            style={{
              position: 'absolute',
              inset: 8,
              borderRadius: 10,
              background: 'linear-gradient(145deg, #1c1f35, #141628)',
              border: '1px solid rgba(0, 212, 212, 0.25)',
              padding: 14,
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
            }}
          >
            <div style={{ width: '65%', height: 7, borderRadius: 3, background: 'rgba(240,240,255,0.55)' }} />
            <div style={{ width: '85%', height: 5, borderRadius: 2, background: 'rgba(136,146,176,0.45)' }} />
            <div style={{ width: '50%', height: 5, borderRadius: 2, background: 'rgba(136,146,176,0.35)' }} />
            <div style={{ marginTop: 4, fontSize: 9, color: COLORS.muted }}>Martin Novák · TechFlow</div>
          </div>
          <div className="hero-demo-scan-line" />
        </div>
        <p className="hero-demo-status-text" style={{ color: COLORS.cyan, fontSize: 13, fontWeight: 600, margin: 0 }}>
          Scanning card...
        </p>
      </div>

      {/* STEP 2 — ENRICH */}
      <div style={activePanel(1)}>
        <div
          className="hero-demo-enrich-card"
          style={{
            width: 160,
            height: 100,
            borderRadius: 10,
            background: 'linear-gradient(145deg, #1c1f35, #141628)',
            border: '1px solid rgba(139, 92, 246, 0.35)',
            marginBottom: 20,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 28,
          }}
        >
          🤖
        </div>
        <div style={{ width: '100%', maxWidth: 280, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {ENRICH_SOURCES.map((src, i) => (
            <div
              key={src.label}
              className="hero-demo-enrich-line"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '8px 12px',
                borderRadius: 10,
                background: 'rgba(139, 92, 246, 0.08)',
                border: '1px solid rgba(139, 92, 246, 0.2)',
                opacity: i < visibleSources ? 1 : 0,
                transform: i < visibleSources ? 'translateX(0)' : 'translateX(-12px)',
                transition: 'opacity 0.35s ease, transform 0.35s ease',
              }}
            >
              <span style={{ fontSize: 16 }}>{src.icon}</span>
              <div>
                <span style={{ fontSize: 12, fontWeight: 700, color: COLORS.purple }}>{src.label}</span>
                <span style={{ fontSize: 11, color: COLORS.muted }}> — {src.desc}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* STEP 3 — MESSAGES */}
      <div style={{ ...activePanel(2), justifyContent: 'flex-start', paddingTop: 28 }}>
        <p style={{ fontSize: 12, fontWeight: 700, color: COLORS.cyan, margin: '0 0 14px', letterSpacing: '0.06em' }}>
          MESSAGES READY
        </p>
        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {MESSAGES.map((msg, i) => {
            const isExpanded = expanded === msg.id
            const isVisible = i < visibleMessages
            return (
              <button
                key={msg.id}
                type="button"
                onClick={() => toggleExpand(msg.id)}
                className={`hero-demo-msg-card ${isVisible ? 'hero-demo-msg-visible' : ''}`}
                style={{
                  textAlign: 'left',
                  width: '100%',
                  padding: isExpanded ? '14px 14px' : '10px 12px',
                  borderRadius: 12,
                  background: COLORS.bg,
                  border: `1px solid ${msg.borderColor}${isExpanded ? '' : '55'}`,
                  borderLeftWidth: 3,
                  borderLeftColor: msg.borderColor,
                  cursor: 'pointer',
                  opacity: isVisible ? 1 : 0,
                  transform: isVisible ? 'translateX(0)' : 'translateX(40px)',
                  transition: 'opacity 0.4s ease, transform 0.4s ease, padding 0.2s ease',
                  boxShadow: isExpanded ? `0 0 20px ${msg.borderColor}33` : 'none',
                }}
              >
                <span style={{ color: msg.labelColor, fontWeight: 700, fontSize: 10 }}>{msg.label}</span>
                <p
                  style={{
                    margin: '6px 0 0',
                    fontSize: isExpanded ? 12 : 11,
                    color: COLORS.muted,
                    lineHeight: 1.5,
                    whiteSpace: isExpanded ? 'pre-wrap' : 'nowrap',
                    overflow: isExpanded ? 'visible' : 'hidden',
                    textOverflow: isExpanded ? 'clip' : 'ellipsis',
                  }}
                >
                  {isExpanded ? msg.full : msg.preview}
                </p>
                {!isExpanded && isVisible && (
                  <span style={{ fontSize: 9, color: COLORS.muted, opacity: 0.6 }}>Tap to expand</span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* STEP 4 — APPROVE */}
      <div style={{ ...activePanel(3), justifyContent: 'flex-start', paddingTop: 16 }}>
        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
          {MESSAGES.map((msg) => {
            const isLinkedIn = msg.id === 'linkedin'
            const highlighted = isLinkedIn && approvePhase >= 1
            const dimmed = !isLinkedIn && approvePhase >= 1
            return (
              <div
                key={msg.id}
                className={highlighted && approvePhase >= 3 ? 'hero-demo-sent-pulse' : undefined}
                style={{
                  padding: '10px 12px',
                  borderRadius: 12,
                  background: COLORS.bg,
                  border: highlighted
                    ? `2px solid ${COLORS.cyan}`
                    : `1px solid ${msg.borderColor}55`,
                  borderLeftWidth: 3,
                  borderLeftColor: msg.borderColor,
                  boxShadow: highlighted ? '0 0 24px rgba(0, 212, 212, 0.35)' : 'none',
                  opacity: dimmed ? 0.45 : 1,
                  transition: 'box-shadow 0.3s ease, border 0.3s ease, opacity 0.3s ease',
                  transform: highlighted ? 'scale(1.02)' : 'scale(1)',
                }}
              >
                <span style={{ color: msg.labelColor, fontWeight: 700, fontSize: 10 }}>{msg.label}</span>
                <p style={{ margin: '4px 0 0', fontSize: 10, color: COLORS.muted, lineHeight: 1.4 }}>
                  {msg.preview}
                </p>
              </div>
            )
          })}
        </div>

        {approvePhase >= 1 && approvePhase < 3 && (
          <button
            type="button"
            className={`hero-demo-approve-btn ${approvePhase >= 2 ? 'hero-demo-approve-clicked' : ''}`}
            style={{
              padding: '12px 28px',
              borderRadius: 12,
              border: 'none',
              background: 'linear-gradient(135deg, #00d4d4, #8b5cf6)',
              color: '#fff',
              fontWeight: 700,
              fontSize: 13,
              cursor: 'default',
              marginBottom: 12,
            }}
          >
            {approvePhase >= 2 ? '✓' : 'Approve & Send'}
          </button>
        )}

        {approvePhase >= 3 && (
          <div
            className="hero-demo-sent-pulse"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '12px 20px',
              borderRadius: 12,
              background: 'rgba(37, 211, 102, 0.12)',
              border: '1px solid rgba(37, 211, 102, 0.4)',
              color: '#25D366',
              fontWeight: 700,
              fontSize: 14,
            }}
          >
            ✓ Sent to LinkedIn
          </div>
        )}
      </div>

      <StepDots step={step} />
    </div>
  )
}

export default function HeroDemo() {
  const isMobile = useIsMobile()

  if (isMobile) {
    return <HeroDemoStatic />
  }

  return <HeroDemoAnimated />
}
