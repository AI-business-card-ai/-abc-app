'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

const SIZE = 800
const CX = 400
const CY = 400
const R = 333

const MIN_CONNECTIONS = 6
const MAX_CONNECTIONS = 8

type Dot = {
  id: number
  theta: number
  phi: number
  color: string
  label: string
}

type Connection = {
  id: number
  from: number
  to: number
  startTime: number
  duration: number
  color: string
  burst?: boolean
}

const DOTS: Dot[] = [
  { id: 0, theta: 0.55, phi: 0.32, color: '#f0197d', label: 'Berlin · MedTech' },
  { id: 1, theta: 1.05, phi: 0.05, color: '#00d4d4', label: 'Dubai · Finance' },
  { id: 2, theta: 0.68, phi: 0.18, color: '#8b5cf6', label: 'Prague · Manufacturing' },
  { id: 3, theta: 0.48, phi: 0.22, color: '#38bdf8', label: 'London · SaaS' },
  { id: 4, theta: 0.52, phi: 0.14, color: '#00d4d4', label: 'Amsterdam · FinTech' },
  { id: 5, theta: 0.58, phi: 0.26, color: '#f0197d', label: 'Düsseldorf · Pharma' },
  { id: 6, theta: 5.25, phi: 0.18, color: '#38bdf8', label: 'San Francisco · AI' },
  { id: 7, theta: 1.38, phi: -0.06, color: '#f59e0b', label: 'Singapore · Trade' },
]

const CONTINENTS = [
  { d: 'M 255 155 Q 290 125 340 145 Q 385 175 370 235 Q 335 285 285 270 Q 245 230 255 155 Z', fill: '#2d6a4f' },
  { d: 'M 318 295 Q 355 310 368 375 Q 352 430 322 415 Q 298 360 318 295 Z', fill: '#3d7a52' },
  { d: 'M 395 175 Q 425 195 438 265 Q 428 340 405 385 Q 378 310 385 240 Q 388 195 395 175 Z', fill: '#4a6741' },
  { d: 'M 430 165 Q 490 150 545 195 Q 560 255 520 285 Q 465 270 440 220 Q 425 185 430 165 Z', fill: '#2d6a4f' },
  { d: 'M 505 355 Q 535 345 548 378 Q 532 405 508 398 Q 492 372 505 355 Z', fill: '#6b8f4e' },
  { d: 'M 360 395 Q 395 410 410 445 Q 385 465 355 450 Q 345 420 360 395 Z', fill: '#8b6914' },
]

function projectDot(theta: number, phi: number) {
  const x = CX + R * Math.cos(phi) * Math.sin(theta)
  const y = CY + R * Math.sin(phi) * 0.92
  const depth = Math.cos(phi) * Math.cos(theta)
  return { x, y, depth }
}

function getDotPos(id: number) {
  const dot = DOTS.find((d) => d.id === id)!
  return projectDot(dot.theta, dot.phi)
}

function curvedPath(fromId: number, toId: number) {
  const a = getDotPos(fromId)
  const b = getDotPos(toId)
  const mx = (a.x + b.x) / 2
  const my = (a.y + b.y) / 2 - 55
  return `M ${a.x} ${a.y} Q ${mx} ${my} ${b.x} ${b.y}`
}

function pickRandomPair(): [number, number] {
  const a = Math.floor(Math.random() * DOTS.length)
  let b = Math.floor(Math.random() * DOTS.length)
  while (b === a) b = Math.floor(Math.random() * DOTS.length)
  return [DOTS[a].id, DOTS[b].id]
}

export default function HeroGlobe() {
  const [connections, setConnections] = useState<Connection[]>([])
  const [flashDot, setFlashDot] = useState<number | null>(null)
  const [showCheck, setShowCheck] = useState<number | null>(null)
  const [paused, setPaused] = useState(false)

  const rafRef = useRef<number>(0)
  const lastSpawnRef = useRef(0)
  const lastScanRef = useRef(0)
  const connIdRef = useRef(0)

  const addConnection = useCallback((from?: number, burst = false) => {
    const now = performance.now()
    connIdRef.current += 1
    let fromId: number
    let toId: number
    if (from !== undefined) {
      fromId = from
      const others = DOTS.filter((d) => d.id !== from).map((d) => d.id)
      toId = others[Math.floor(Math.random() * others.length)]
    } else {
      ;[fromId, toId] = pickRandomPair()
    }

    const conn: Connection = {
      id: connIdRef.current,
      from: fromId,
      to: toId,
      startTime: now,
      duration: burst ? 2500 : 5000,
      color: Math.random() > 0.5 ? '#00d4d4' : '#f0197d',
      burst,
    }

    setConnections((prev) => {
      const alive = prev.filter((c) => now - c.startTime < c.duration)
      const next = [...alive, conn]
      return next.length > MAX_CONNECTIONS ? next.slice(-MAX_CONNECTIONS) : next
    })
  }, [])

  const triggerScan = useCallback(() => {
    const dot = DOTS[Math.floor(Math.random() * DOTS.length)]
    setFlashDot(dot.id)
    setShowCheck(dot.id)
    window.setTimeout(() => setFlashDot(null), 300)
    window.setTimeout(() => setShowCheck(null), 1200)
    for (let i = 0; i < 3; i++) {
      window.setTimeout(() => addConnection(dot.id, true), i * 80)
    }
  }, [addConnection])

  useEffect(() => {
    const initial: Connection[] = []
    const now = performance.now()
    for (let i = 0; i < MIN_CONNECTIONS; i++) {
      connIdRef.current += 1
      const [fromId, toId] = pickRandomPair()
      initial.push({
        id: connIdRef.current,
        from: fromId,
        to: toId,
        startTime: now - i * 400,
        duration: 5000,
        color: i % 2 === 0 ? '#00d4d4' : '#f0197d',
      })
    }
    setConnections(initial)
  }, [])

  useEffect(() => {
    const onVis = () => setPaused(document.hidden)
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [])

  useEffect(() => {
    if (paused) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      return
    }

    let running = true
    const loop = (now: number) => {
      if (!running) return

      if (now - lastSpawnRef.current > 1100) {
        lastSpawnRef.current = now
        setConnections((prev) => {
          const alive = prev.filter((c) => now - c.startTime < c.duration)
          if (alive.length >= MAX_CONNECTIONS) return alive
          if (alive.length < MIN_CONNECTIONS || Math.random() > 0.35) {
            const [fromId, toId] = pickRandomPair()
            connIdRef.current += 1
            const conn: Connection = {
              id: connIdRef.current,
              from: fromId,
              to: toId,
              startTime: now,
              duration: 5000,
              color: Math.random() > 0.5 ? '#00d4d4' : '#f0197d',
            }
            const next = [...alive, conn]
            return next.length > MAX_CONNECTIONS ? next.slice(-MAX_CONNECTIONS) : next
          }
          return alive
        })
      }

      if (now - lastScanRef.current > 8000) {
        lastScanRef.current = now
        triggerScan()
      }

      setConnections((prev) => prev.filter((c) => now - c.startTime < c.duration))

      rafRef.current = requestAnimationFrame(loop)
    }

    rafRef.current = requestAnimationFrame(loop)
    return () => {
      running = false
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [paused, triggerScan])

  const latLines = Array.from({ length: 9 }, (_, i) => {
    const phi = ((i + 1) / 10 - 0.5) * Math.PI * 0.9
    const ry = Math.abs(Math.cos(phi)) * R * 0.92
    const y = CY + Math.sin(phi) * R * 0.92
    return { y, ry }
  })

  const lonLines = Array.from({ length: 18 }, (_, i) => i * 10)

  return (
    <div
      aria-hidden
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 0,
        overflow: 'hidden',
        background: '#0d0f1a',
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          zIndex: 3,
          background:
            'linear-gradient(90deg, #0d0f1a 45%, rgba(13,15,26,0.3) 75%, transparent 100%)',
        }}
      />

      {/* Atmosphere glow */}
      <div
        style={{
          position: 'absolute',
          right: -100,
          top: '50%',
          transform: 'translateY(-50%)',
          width: 860,
          height: 860,
          borderRadius: '50%',
          background:
            'radial-gradient(circle, rgba(56,189,248,0.25) 55%, rgba(26,58,92,0.15) 70%, transparent 78%)',
          filter: 'blur(8px)',
          zIndex: 0,
        }}
      />

      <div
        style={{
          position: 'absolute',
          right: -100,
          top: '50%',
          transform: 'translateY(-50%)',
          width: SIZE,
          height: SIZE,
          zIndex: 1,
        }}
      >
        <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} style={{ overflow: 'visible' }}>
          <defs>
            <clipPath id="earth-clip">
              <circle cx={CX} cy={CY} r={R} />
            </clipPath>
            <radialGradient id="earth-ocean" cx="45%" cy="40%" r="60%">
              <stop offset="0%" stopColor="#2a5080" />
              <stop offset="100%" stopColor="#1a3a5c" />
            </radialGradient>
            <radialGradient id="earth-light" cx="28%" cy="22%" r="65%">
              <stop offset="0%" stopColor="rgba(255,255,255,0.45)" />
              <stop offset="35%" stopColor="rgba(255,255,255,0.08)" />
              <stop offset="100%" stopColor="rgba(0,0,0,0.35)" />
            </radialGradient>
            <marker
              id="arrow-cyan"
              markerWidth="8"
              markerHeight="8"
              refX="7"
              refY="4"
              orient="auto"
              markerUnits="strokeWidth"
            >
              <path d="M0,0 L8,4 L0,8 Z" fill="#00d4d4" />
            </marker>
            <marker
              id="arrow-pink"
              markerWidth="8"
              markerHeight="8"
              refX="7"
              refY="4"
              orient="auto"
              markerUnits="strokeWidth"
            >
              <path d="M0,0 L8,4 L0,8 Z" fill="#f0197d" />
            </marker>
            {DOTS.map((dot) => (
              <radialGradient key={`g-${dot.id}`} id={`dot-glow-${dot.id}`}>
                <stop offset="0%" stopColor={dot.color} stopOpacity={1} />
                <stop offset="100%" stopColor={dot.color} stopOpacity={0} />
              </radialGradient>
            ))}
          </defs>

          {/* Ocean base */}
          <circle cx={CX} cy={CY} r={R} fill="url(#earth-ocean)" />

          <g className="hero-globe-spin" style={{ transformOrigin: `${CX}px ${CY}px` }}>
            <g clipPath="url(#earth-clip)">
              {CONTINENTS.map((c, i) => (
                <path key={i} d={c.d} fill={c.fill} opacity={0.92} />
              ))}
            </g>

            {latLines.map((line, i) => (
              <ellipse
                key={`lat-${i}`}
                cx={CX}
                cy={line.y}
                rx={line.ry}
                ry={line.ry * 0.28}
                fill="none"
                stroke="rgba(255,255,255,0.15)"
                strokeWidth={1}
              />
            ))}

            {lonLines.map((deg) => (
              <ellipse
                key={`lon-${deg}`}
                cx={CX}
                cy={CY}
                rx={R * 0.28}
                ry={R}
                fill="none"
                stroke="rgba(255,255,255,0.15)"
                strokeWidth={1}
                transform={`rotate(${deg} ${CX} ${CY})`}
              />
            ))}

            {connections.map((c) => (
              <path
                key={c.id}
                className="hero-globe-arrow"
                d={curvedPath(c.from, c.to)}
                fill="none"
                stroke={c.color}
                strokeWidth={2}
                strokeOpacity={0.95}
                markerEnd={c.color === '#f0197d' ? 'url(#arrow-pink)' : 'url(#arrow-cyan)'}
                style={{
                  filter: `drop-shadow(0 0 4px ${c.color})`,
                  animationDuration: c.burst ? '0.8s' : '1.4s',
                }}
              />
            ))}

            {DOTS.map((dot) => {
              const { x, y, depth } = projectDot(dot.theta, dot.phi)
              if (depth < -0.12) return null
              const isFlashing = flashDot === dot.id
              const labelW = dot.label.length * 5.8 + 16
              return (
                <g key={dot.id}>
                  <circle
                    cx={x}
                    cy={y}
                    r={isFlashing ? 20 : 14}
                    fill={`url(#dot-glow-${dot.id})`}
                    opacity={0.7}
                    className={isFlashing ? undefined : 'hero-globe-dot-pulse'}
                    style={{ animationDelay: `${dot.id * 0.25}s`, transformOrigin: `${x}px ${y}px` }}
                  />
                  <circle
                    cx={x}
                    cy={y}
                    r={isFlashing ? 10 : 8}
                    fill={isFlashing ? '#ffffff' : dot.color}
                    style={{
                      filter: isFlashing
                        ? 'drop-shadow(0 0 12px #fff)'
                        : `drop-shadow(0 0 8px ${dot.color})`,
                    }}
                  />
                  <rect
                    x={x + 12}
                    y={y - 22}
                    width={labelW}
                    height={18}
                    rx={9}
                    fill="rgba(0,0,0,0.8)"
                    stroke="#00d4d4"
                    strokeWidth={1}
                  />
                  <text
                    x={x + 20}
                    y={y - 9}
                    fill="#f0f0ff"
                    fontSize={11}
                    fontFamily="system-ui, sans-serif"
                  >
                    {dot.label}
                  </text>
                  {showCheck === dot.id && (
                    <text x={x + 10} y={y - 28} fill="#22c55e" fontSize={13} fontWeight={700}>
                      ✓
                    </text>
                  )}
                </g>
              )
            })}
          </g>

          {/* Light + atmosphere on top of sphere */}
          <circle cx={CX} cy={CY} r={R} fill="url(#earth-light)" pointerEvents="none" />
          <circle
            cx={CX}
            cy={CY}
            r={R + 4}
            fill="none"
            stroke="rgba(56,189,248,0.35)"
            strokeWidth={3}
            opacity={0.6}
          />
        </svg>
      </div>

      <style jsx global>{`
        .hero-globe-spin {
          animation: heroGlobeRotate 60s linear infinite;
        }
        @keyframes heroGlobeRotate {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .hero-globe-dot-pulse {
          animation: heroGlobeDotPulse 2.2s ease-in-out infinite;
        }
        @keyframes heroGlobeDotPulse {
          0%, 100% { transform: scale(1); opacity: 0.65; }
          50% { transform: scale(2.5); opacity: 1; }
        }
        .hero-globe-arrow {
          stroke-dasharray: 10 14;
          animation: heroGlobeDash 1.4s linear infinite;
        }
        @keyframes heroGlobeDash {
          to { stroke-dashoffset: -24; }
        }
        @media (prefers-reduced-motion: reduce) {
          .hero-globe-spin,
          .hero-globe-dot-pulse,
          .hero-globe-arrow {
            animation: none !important;
          }
        }
      `}</style>
    </div>
  )
}
