'use client'

import { useEffect, useState, type ReactNode } from 'react'

const COLORS = {
  bg: '#0d0f1a',
  cyan: '#00d4d4',
  pink: '#f0197d',
  purple: '#8b5cf6',
  text: '#f0f0ff',
  muted: '#8892b0',
  surface: '#141628',
}

const ANALYZE_ROWS = [
  { icon: '🔍', label: 'Reading card...' },
  { icon: '👤', label: 'Company data...' },
  { icon: '💼', label: 'LinkedIn profile...' },
  { icon: '🌐', label: 'Latest news...' },
]

const MESSAGES = [
  {
    channel: 'LinkedIn',
    color: COLORS.cyan,
    text: 'Hi Martin — loved our chat at Medica. Your AI diagnostics work is fascinating. Coffee?',
  },
  {
    channel: 'Email',
    color: COLORS.pink,
    text: 'Subject: Medica follow-up\nHi Martin, great meeting...',
  },
  {
    channel: 'WhatsApp',
    color: '#25D366',
    text: 'Hey Martin! Great meeting 👋\nHere\'s our deck...',
  },
]

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

function StatusBar() {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '6px 16px 4px',
        fontSize: 10,
        fontWeight: 600,
        color: COLORS.text,
        flexShrink: 0,
      }}
    >
      <span>10:24</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        <span style={{ letterSpacing: 1, fontSize: 9 }}>●●●</span>
        <span style={{ fontSize: 9 }}>5G</span>
        <div
          style={{
            width: 18,
            height: 9,
            borderRadius: 2,
            border: '1px solid rgba(240,240,255,0.5)',
            padding: 1,
            position: 'relative',
          }}
        >
          <div style={{ width: '75%', height: '100%', background: COLORS.cyan, borderRadius: 1 }} />
          <div
            style={{
              position: 'absolute',
              right: -3,
              top: 2,
              width: 2,
              height: 4,
              background: 'rgba(240,240,255,0.5)',
              borderRadius: 1,
            }}
          />
        </div>
      </div>
    </div>
  )
}

function AppTopBar({ showCamera = false }: { showCamera?: boolean }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '8px 14px',
        borderBottom: '1px solid rgba(139, 92, 246, 0.12)',
      }}
    >
      <span
        style={{
          fontSize: 14,
          fontWeight: 800,
          background: 'linear-gradient(135deg, #00d4d4, #f0197d)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
        }}
      >
        ABC
      </span>
      {showCamera && <span style={{ fontSize: 16 }}>📷</span>}
    </div>
  )
}

function ScreenScan({ active }: { active: boolean }) {
  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        background: COLORS.bg,
        minHeight: 0,
      }}
    >
      <AppTopBar showCamera />
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '12px 16px',
          gap: 12,
        }}
      >
        <div
          className={active ? 'hero-phone-scan-active' : ''}
          style={{
            position: 'relative',
            width: '100%',
            maxWidth: 200,
            height: 130,
            borderRadius: 12,
          }}
        >
          <span className="scan-corner scan-corner-tl" style={{ width: 16, height: 16 }} />
          <span className="scan-corner scan-corner-tr" style={{ width: 16, height: 16 }} />
          <span className="scan-corner scan-corner-bl" style={{ width: 16, height: 16 }} />
          <span className="scan-corner scan-corner-br" style={{ width: 16, height: 16 }} />
          <div
            style={{
              position: 'absolute',
              inset: 10,
              borderRadius: 8,
              background: 'linear-gradient(145deg, #1c1f35, #141628)',
              border: '1px solid rgba(0, 212, 212, 0.2)',
              padding: 12,
              display: 'flex',
              flexDirection: 'column',
              gap: 5,
            }}
          >
            <div style={{ width: '60%', height: 6, borderRadius: 3, background: 'rgba(240,240,255,0.5)' }} />
            <div style={{ width: '80%', height: 4, borderRadius: 2, background: 'rgba(136,146,176,0.45)' }} />
            <div style={{ width: '55%', height: 4, borderRadius: 2, background: 'rgba(136,146,176,0.35)' }} />
            <div style={{ marginTop: 6, fontSize: 8, color: COLORS.muted }}>Martin Novak</div>
          </div>
          {active && <div className="hero-phone-scan-line" />}
        </div>
        <p style={{ margin: 0, fontSize: 11, color: COLORS.muted }}>Point at business card</p>
      </div>
      <div style={{ padding: '12px 16px 8px' }}>
        <div
          style={{
            width: '100%',
            padding: '11px 0',
            borderRadius: 12,
            textAlign: 'center',
            fontSize: 12,
            fontWeight: 700,
            background: 'linear-gradient(135deg, #f0197d, #8b5cf6)',
            color: '#fff',
            boxShadow: '0 4px 16px rgba(240, 25, 125, 0.3)',
          }}
        >
          📷 Scan card
        </div>
      </div>
    </div>
  )
}

function ScreenAnalyzing({ active }: { active: boolean }) {
  const [doneRows, setDoneRows] = useState(0)
  const [progress, setProgress] = useState(0)
  const [showScore, setShowScore] = useState(false)

  useEffect(() => {
    if (!active) {
      setDoneRows(0)
      setProgress(0)
      setShowScore(false)
      return
    }
    const timers = [
      window.setTimeout(() => setDoneRows(1), 300),
      window.setTimeout(() => setDoneRows(2), 600),
      window.setTimeout(() => setDoneRows(3), 900),
      window.setTimeout(() => setDoneRows(4), 1200),
      window.setTimeout(() => setProgress(100), 1300),
      window.setTimeout(() => setShowScore(true), 1600),
    ]
    return () => timers.forEach(clearTimeout)
  }, [active])

  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        background: COLORS.bg,
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px 18px',
        gap: 14,
        minHeight: 0,
      }}
    >
      <div
        style={{
          width: 56,
          height: 56,
          borderRadius: '50%',
          background: 'linear-gradient(135deg, #00d4d4, #8b5cf6)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 18,
          fontWeight: 800,
          color: '#fff',
          boxShadow: '0 0 20px rgba(0, 212, 212, 0.35)',
        }}
      >
        MN
      </div>
      <div style={{ textAlign: 'center' }}>
        <p style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>Martin Novak</p>
        <p style={{ margin: '4px 0 0', fontSize: 11, color: COLORS.muted }}>MedTech GmbH</p>
      </div>
      <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {ANALYZE_ROWS.map((row, i) => (
          <div
            key={row.label}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '7px 10px',
              borderRadius: 8,
              background: 'rgba(139, 92, 246, 0.08)',
              border: '1px solid rgba(139, 92, 246, 0.15)',
              opacity: i < doneRows ? 1 : 0.25,
              transform: i < doneRows ? 'translateX(0)' : 'translateX(-8px)',
              transition: 'opacity 0.3s ease, transform 0.3s ease',
            }}
          >
            <span style={{ fontSize: 11, color: COLORS.muted }}>
              {row.icon} {row.label}
            </span>
            {i < doneRows && (
              <span style={{ color: COLORS.cyan, fontWeight: 700, fontSize: 12 }}>✓</span>
            )}
          </div>
        ))}
      </div>
      <div style={{ width: '100%' }}>
        <div
          style={{
            height: 4,
            borderRadius: 999,
            background: 'rgba(136, 146, 176, 0.2)',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              height: '100%',
              width: `${progress}%`,
              borderRadius: 999,
              background: 'linear-gradient(90deg, #00d4d4, #8b5cf6)',
              transition: 'width 0.6s ease',
            }}
          />
        </div>
      </div>
      {showScore && (
        <div
          className="hero-phone-score-badge"
          style={{
            padding: '6px 14px',
            borderRadius: 999,
            background: 'linear-gradient(135deg, #f0197d, #8b5cf6)',
            fontSize: 11,
            fontWeight: 700,
            color: '#fff',
            boxShadow: '0 4px 16px rgba(240, 25, 125, 0.4)',
          }}
        >
          AI Score: 92
        </div>
      )}
    </div>
  )
}

function ScreenMessages() {
  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        background: COLORS.bg,
        minHeight: 0,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          padding: '10px 12px',
          borderBottom: '1px solid rgba(139, 92, 246, 0.12)',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
        }}
      >
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: '50%',
            background: 'linear-gradient(135deg, #00d4d4, #8b5cf6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 12,
            fontWeight: 800,
            flexShrink: 0,
          }}
        >
          MN
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: 12, fontWeight: 700 }}>Martin Novak</p>
          <p style={{ margin: 0, fontSize: 9, color: COLORS.muted }}>MedTech GmbH</p>
        </div>
        <span
          style={{
            fontSize: 9,
            fontWeight: 700,
            padding: '3px 8px',
            borderRadius: 999,
            background: 'rgba(240, 25, 125, 0.15)',
            color: COLORS.pink,
            whiteSpace: 'nowrap',
          }}
        >
          Score: 92 🔥
        </span>
      </div>
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '10px 12px',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}
      >
        {MESSAGES.map((msg) => (
          <div
            key={msg.channel}
            style={{
              padding: '10px 10px',
              borderRadius: 10,
              background: COLORS.surface,
              border: '1px solid rgba(139, 92, 246, 0.12)',
              borderLeft: `3px solid ${msg.color}`,
            }}
          >
            <span style={{ fontSize: 9, fontWeight: 700, color: msg.color }}>[{msg.channel}]</span>
            <p
              style={{
                margin: '5px 0 8px',
                fontSize: 9,
                lineHeight: 1.45,
                color: COLORS.muted,
                whiteSpace: 'pre-wrap',
              }}
            >
              {msg.text}
            </p>
            <button
              type="button"
              style={{
                fontSize: 9,
                fontWeight: 700,
                padding: '5px 12px',
                borderRadius: 8,
                border: 'none',
                background: `linear-gradient(135deg, ${msg.color}33, ${msg.color}11)`,
                color: msg.color,
                cursor: 'default',
              }}
            >
              Send
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

function ScreenSent({ active }: { active: boolean }) {
  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        background: COLORS.bg,
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px 18px',
        gap: 14,
        minHeight: 0,
      }}
    >
      <div
        className={active ? 'hero-phone-checkmark' : ''}
        style={{
          width: 64,
          height: 64,
          borderRadius: '50%',
          background: 'rgba(0, 212, 212, 0.12)',
          border: `2px solid ${COLORS.cyan}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 28,
          color: COLORS.cyan,
          boxShadow: active ? '0 0 32px rgba(0, 212, 212, 0.45)' : 'none',
        }}
      >
        ✓
      </div>
      <p style={{ margin: 0, fontSize: 13, fontWeight: 700, textAlign: 'center' }}>
        Message sent to LinkedIn ✓
      </p>
      <div
        style={{
          width: '100%',
          padding: '12px 14px',
          borderRadius: 12,
          background: COLORS.surface,
          border: '1px solid rgba(139, 92, 246, 0.15)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', fontSize: 10 }}>
          <span style={{ fontWeight: 700 }}>Martin Novak</span>
          <span style={{ color: COLORS.muted }}>→</span>
          <span style={{ color: COLORS.cyan, fontWeight: 700 }}>CONTACTED</span>
          <span style={{ color: COLORS.muted }}>→ follow-up in 3 days</span>
        </div>
      </div>
      <div
        style={{
          width: '100%',
          padding: '10px 12px',
          borderRadius: 10,
          background: 'rgba(139, 92, 246, 0.08)',
          border: '1px solid rgba(139, 92, 246, 0.15)',
        }}
      >
        <p style={{ margin: '0 0 8px', fontSize: 9, color: COLORS.muted }}>Follow-up scheduled:</p>
        <div style={{ display: 'flex', gap: 6 }}>
          {['Day 1', 'Day 3', 'Day 7'].map((day, i) => (
            <span
              key={day}
              style={{
                flex: 1,
                textAlign: 'center',
                fontSize: 9,
                fontWeight: 600,
                padding: '5px 4px',
                borderRadius: 6,
                background: i === 0 ? 'rgba(0, 212, 212, 0.15)' : 'rgba(136, 146, 176, 0.1)',
                color: i === 0 ? COLORS.cyan : COLORS.muted,
                border: i === 0 ? `1px solid ${COLORS.cyan}44` : '1px solid transparent',
              }}
            >
              {day}
            </span>
          ))}
        </div>
      </div>
      <p style={{ margin: 0, fontSize: 11, color: COLORS.muted, fontStyle: 'italic' }}>
        Never lose this contact
      </p>
    </div>
  )
}

function ScreenDots({ screen, onSelect }: { screen: number; onSelect: (i: number) => void }) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'center',
        gap: 6,
        padding: '6px 0 4px',
        flexShrink: 0,
      }}
    >
      {[0, 1, 2, 3].map((i) => (
        <button
          key={i}
          type="button"
          aria-label={`Go to screen ${i + 1}`}
          onClick={() => onSelect(i)}
          style={{
            width: i === screen ? 16 : 6,
            height: 6,
            borderRadius: 999,
            border: 'none',
            padding: 0,
            cursor: 'pointer',
            background: i === screen ? COLORS.cyan : 'rgba(136, 146, 176, 0.35)',
            transition: 'width 0.25s ease, background 0.25s ease',
          }}
        />
      ))}
    </div>
  )
}

function PhoneScreen({ screen, onSelectScreen }: { screen: number; onSelectScreen: (i: number) => void }) {
  const screens: ReactNode[] = [
    <ScreenScan key="scan" active={screen === 0} />,
    <ScreenAnalyzing key="analyze" active={screen === 1} />,
    <ScreenMessages key="messages" />,
    <ScreenSent key="sent" active={screen === 3} />,
  ]

  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        overflow: 'hidden',
        boxShadow: 'inset 0 0 24px rgba(0, 212, 212, 0.04)',
      }}
    >
      <StatusBar />
      <div style={{ flex: 1, overflow: 'hidden', position: 'relative', minHeight: 0 }}>
        <div
          className="hero-phone-slides"
          style={{
            display: 'flex',
            width: '400%',
            height: '100%',
            transform: `translateX(-${screen * 25}%)`,
            transition: 'transform 0.55s cubic-bezier(0.4, 0, 0.2, 1)',
          }}
        >
          {screens.map((s, i) => (
            <div key={i} style={{ width: '25%', height: '100%', display: 'flex', flexDirection: 'column' }}>
              {s}
            </div>
          ))}
        </div>
      </div>
      <ScreenDots screen={screen} onSelect={onSelectScreen} />
      <div style={{ height: 10, flexShrink: 0 }} aria-hidden />
    </div>
  )
}

export default function HeroPhone() {
  const [screen, setScreen] = useState(0)
  const isMobile = useIsMobile()

  useEffect(() => {
    const id = window.setInterval(() => {
      setScreen((s) => (s + 1) % 4)
    }, 3500)
    return () => window.clearInterval(id)
  }, [])

  const phoneWidth = 260
  const phoneHeight = 520
  const scale = isMobile ? 0.7 : 1
  const scaledW = phoneWidth * scale
  const scaledH = phoneHeight * scale

  return (
    <div
      className="hero-phone-glow-wrap"
      style={{
        position: 'relative',
        width: scaledW,
        height: scaledH,
        margin: '0 auto',
      }}
    >
      <div
        className="hero-phone-glow"
        aria-hidden
        style={{
          position: 'absolute',
          inset: '-20%',
          borderRadius: '50%',
          background:
            'radial-gradient(ellipse at center, rgba(139, 92, 246, 0.35) 0%, rgba(0, 212, 212, 0.15) 40%, transparent 70%)',
          filter: 'blur(20px)',
          zIndex: 0,
        }}
      />
      <div
        className="hero-phone-frame"
        style={{
          position: 'relative',
          zIndex: 1,
          width: phoneWidth,
          height: phoneHeight,
          transform: `scale(${scale})`,
          transformOrigin: 'top center',
          borderRadius: 40,
          background: 'linear-gradient(145deg, #1a1a28, #0a0a12)',
          padding: 10,
          boxShadow:
            '0 24px 64px rgba(0, 0, 0, 0.55), 0 0 0 1px rgba(255,255,255,0.06), inset 0 1px 0 rgba(255,255,255,0.08)',
        }}
      >
        {/* Notch */}
        <div
          style={{
            position: 'absolute',
            top: 10,
            left: '50%',
            transform: 'translateX(-50%)',
            width: 90,
            height: 22,
            borderRadius: '0 0 14px 14px',
            background: '#0a0a12',
            zIndex: 10,
          }}
        />
        {/* Screen */}
        <div
          style={{
            width: '100%',
            height: '100%',
            borderRadius: 32,
            overflow: 'hidden',
            background: COLORS.bg,
            display: 'flex',
            flexDirection: 'column',
            position: 'relative',
          }}
        >
          <PhoneScreen screen={screen} onSelectScreen={setScreen} />
          {/* Home indicator */}
          <div
            style={{
              position: 'absolute',
              bottom: 6,
              left: '50%',
              transform: 'translateX(-50%)',
              width: 80,
              height: 4,
              borderRadius: 999,
              background: 'rgba(240, 240, 255, 0.25)',
              zIndex: 5,
              pointerEvents: 'none',
            }}
          />
        </div>
      </div>
    </div>
  )
}
