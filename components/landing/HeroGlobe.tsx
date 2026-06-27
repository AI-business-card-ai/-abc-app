'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

const CX = 300
const CY = 300
const R = 250

type Dot = {
  id: number
  theta: number
  phi: number
  color: string
  industry: string
  label?: string
}

type Connection = {
  id: number
  from: number
  to: number
  startTime: number
  duration: number
  label?: string
  burst?: boolean
}

const DOTS: Dot[] = [
  { id: 0, theta: 0.4, phi: 0.35, color: '#f0197d', industry: 'MedTech', label: 'MedTech · Berlin' },
  { id: 1, theta: 1.2, phi: -0.2, color: '#00d4d4', industry: 'Finance', label: 'FinTech · London' },
  { id: 2, theta: 2.1, phi: 0.15, color: '#8b5cf6', industry: 'Manufacturing', label: 'Manufacturing · Prague' },
  { id: 3, theta: 2.8, phi: -0.45, color: '#38bdf8', industry: 'Tech', label: 'AI · San Francisco' },
  { id: 4, theta: 3.5, phi: 0.5, color: '#f0197d', industry: 'MedTech', label: 'Pharma · Düsseldorf' },
  { id: 5, theta: 4.2, phi: -0.1, color: '#38bdf8', industry: 'Tech', label: 'SaaS · Amsterdam' },
  { id: 6, theta: 0.9, phi: -0.55, color: '#f59e0b', industry: 'Real Estate' },
  { id: 7, theta: 1.8, phi: 0.55, color: '#10b981', industry: 'Energy' },
  { id: 8, theta: 2.5, phi: -0.35, color: '#00d4d4', industry: 'Finance' },
  { id: 9, theta: 3.2, phi: 0.25, color: '#8b5cf6', industry: 'Manufacturing' },
  { id: 10, theta: 4.0, phi: -0.5, color: '#f59e0b', industry: 'Real Estate' },
  { id: 11, theta: 5.0, phi: 0.4, color: '#10b981', industry: 'Energy' },
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
  const my = (a.y + b.y) / 2 - 40
  return `M ${a.x} ${a.y} Q ${mx} ${my} ${b.x} ${b.y}`
}

function connectionOpacity(elapsed: number, duration: number) {
  const t = elapsed / duration
  if (t < 0.15) return (t / 0.15) * 0.6
  if (t < 0.7) return 0.6
  return 0.6 * (1 - (t - 0.7) / 0.3)
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
  const [activeLabels, setActiveLabels] = useState<{ dotId: number; label: string; color: string }[]>([])
  const [paused, setPaused] = useState(false)
  const [tick, setTick] = useState(0)

  const connIdRef = useRef(0)
  const rafRef = useRef<number>(0)
  const lastSpawnRef = useRef(0)
  const lastScanRef = useRef(0)

  const addConnection = useCallback((from?: number, burst = false) => {
    let fromId: number
    let toId: number
    if (from !== undefined) {
      fromId = from
      const others = DOTS.filter((d) => d.id !== from).map((d) => d.id)
      toId = others[Math.floor(Math.random() * others.length)]
    } else {
      ;[fromId, toId] = pickRandomPair()
    }

    const fromDot = DOTS.find((d) => d.id === fromId)!
    const toDot = DOTS.find((d) => d.id === toId)!
    const label = fromDot.label || toDot.label

    connIdRef.current += 1
    const conn: Connection = {
      id: connIdRef.current,
      from: fromId,
      to: toId,
      startTime: performance.now(),
      duration: burst ? 2000 : 3000,
      label,
      burst,
    }

    setConnections((prev) => {
      const alive = prev.filter((c) => performance.now() - c.startTime < c.duration)
      const next = [...alive, conn]
      return next.length > 5 ? next.slice(-5) : next
    })

    if (label) {
      const dot = fromDot.label ? fromDot : toDot
      setActiveLabels((prev) => {
        const filtered = prev.filter((l) => l.dotId !== dot.id)
        return [...filtered, { dotId: dot.id, label: dot.label!, color: dot.color }].slice(-4)
      })
    }
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
      setTick(now)

      if (now - lastSpawnRef.current > 1500) {
        lastSpawnRef.current = now
        setConnections((prev) => {
          const alive = prev.filter((c) => now - c.startTime < c.duration)
          if (alive.length >= 5) return alive
          let fromId: number
          let toId: number
          ;[fromId, toId] = pickRandomPair()
          const fromDot = DOTS.find((d) => d.id === fromId)!
          const toDot = DOTS.find((d) => d.id === toId)!
          const label = fromDot.label || toDot.label
          connIdRef.current += 1
          const conn: Connection = {
            id: connIdRef.current,
            from: fromId,
            to: toId,
            startTime: now,
            duration: 3000,
            label,
          }
          if (label) {
            const dot = fromDot.label ? fromDot : toDot
            setActiveLabels((labels) => {
              const filtered = labels.filter((l) => l.dotId !== dot.id)
              return [...filtered, { dotId: dot.id, label: dot.label!, color: dot.color }].slice(-4)
            })
          }
          const next = [...alive, conn]
          return next.length > 5 ? next.slice(-5) : next
        })
      }

      if (now - lastScanRef.current > 8000) {
        lastScanRef.current = now
        triggerScan()
      }

      setConnections((prev) => {
        const alive = prev.filter((c) => now - c.startTime < c.duration)
        if (alive.length !== prev.length) {
          const activeDotIds = new Set<number>()
          alive.forEach((c) => {
            if (c.label) {
              const fd = DOTS.find((d) => d.id === c.from)
              const td = DOTS.find((d) => d.id === c.to)
              if (fd?.label) activeDotIds.add(fd.id)
              if (td?.label) activeDotIds.add(td.id)
            }
          })
          setActiveLabels((labels) => labels.filter((l) => activeDotIds.has(l.dotId)))
        }
        return alive
      })

      rafRef.current = requestAnimationFrame(loop)
    }

    rafRef.current = requestAnimationFrame(loop)
    return () => {
      running = false
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [paused, triggerScan])

  const latLines = Array.from({ length: 7 }, (_, i) => {
    const phi = ((i + 1) / 8 - 0.5) * Math.PI * 0.85
    const ry = Math.abs(Math.cos(phi)) * R * 0.92
    const y = CY + Math.sin(phi) * R * 0.92
    return { y, ry }
  })

  const lonLines = Array.from({ length: 12 }, (_, i) => i * 15)

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
      {/* Left readability gradient */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          zIndex: 2,
          background: 'linear-gradient(90deg, #0d0f1a 40%, transparent 80%)',
        }}
      />

      {/* Globe glow */}
      <div
        style={{
          position: 'absolute',
          right: '-60px',
          top: '50%',
          transform: 'translateY(-50%)',
          width: 620,
          height: 620,
          borderRadius: '50%',
          background:
            'radial-gradient(circle, rgba(0,212,212,0.12) 0%, rgba(139,92,246,0.08) 45%, transparent 70%)',
          filter: 'blur(20px)',
          zIndex: 0,
        }}
      />

      {/* Globe container */}
      <div
        style={{
          position: 'absolute',
          right: '-80px',
          top: '50%',
          transform: 'translateY(-50%)',
          width: 600,
          height: 600,
          zIndex: 1,
        }}
      >
        <svg
          width={600}
          height={600}
          viewBox="0 0 600 600"
          style={{ overflow: 'visible' }}
        >
          <defs>
            {DOTS.map((dot) => (
              <radialGradient key={`g-${dot.id}`} id={`dot-glow-${dot.id}`}>
                <stop offset="0%" stopColor={dot.color} stopOpacity={0.9} />
                <stop offset="100%" stopColor={dot.color} stopOpacity={0} />
              </radialGradient>
            ))}
          </defs>

          {/* Sphere fill */}
          <circle cx={CX} cy={CY} r={R} fill="#0a0a1a" />

          {/* Wireframe — latitudes */}
          {latLines.map((line, i) => (
            <ellipse
              key={`lat-${i}`}
              cx={CX}
              cy={line.y}
              rx={line.ry}
              ry={line.ry * 0.28}
              fill="none"
              stroke="rgba(0, 212, 212, 0.15)"
              strokeWidth={0.8}
            />
          ))}

          {/* Wireframe — longitudes (rotating) */}
          <g
            className="hero-globe-spin"
            style={{ transformOrigin: `${CX}px ${CY}px` }}
          >
            {lonLines.map((deg) => (
              <ellipse
                key={`lon-${deg}`}
                cx={CX}
                cy={CY}
                rx={R * 0.28}
                ry={R}
                fill="none"
                stroke="rgba(0, 212, 212, 0.15)"
                strokeWidth={0.8}
                transform={`rotate(${deg} ${CX} ${CY})`}
              />
            ))}

            {/* Connection lines */}
            {connections.map((c) => {
              const elapsed = tick - c.startTime
              const opacity = connectionOpacity(elapsed, c.duration)
              if (opacity <= 0) return null
              const fromDot = DOTS.find((d) => d.id === c.from)!
              const toDot = DOTS.find((d) => d.id === c.to)!
              return (
                <path
                  key={c.id}
                  d={curvedPath(c.from, c.to)}
                  fill="none"
                  stroke={fromDot.color}
                  strokeWidth={c.burst ? 1.5 : 1}
                  strokeOpacity={opacity}
                  style={{ filter: `drop-shadow(0 0 2px ${toDot.color}88)` }}
                />
              )
            })}

            {/* Industry dots */}
            {DOTS.map((dot) => {
              const { x, y, depth } = projectDot(dot.theta, dot.phi)
              if (depth < -0.15) return null
              const isFlashing = flashDot === dot.id
              const scale = isFlashing ? 2.2 : 1
              return (
                <g key={dot.id}>
                  <circle
                    cx={x}
                    cy={y}
                    r={8 * scale}
                    fill={`url(#dot-glow-${dot.id})`}
                    opacity={0.35}
                    className={isFlashing ? undefined : 'hero-globe-dot-pulse'}
                    style={{ animationDelay: `${dot.id * 0.35}s` }}
                  />
                  <circle
                    cx={x}
                    cy={y}
                    r={4 * scale}
                    fill={isFlashing ? '#ffffff' : dot.color}
                    style={{
                      filter: isFlashing
                        ? 'drop-shadow(0 0 8px #fff)'
                        : `drop-shadow(0 0 4px ${dot.color})`,
                      transition: 'fill 0.15s ease',
                    }}
                  />
                  {showCheck === dot.id && (
                    <text
                      x={x + 10}
                      y={y - 8}
                      fill="#22c55e"
                      fontSize={11}
                      fontWeight={700}
                    >
                      ✓
                    </text>
                  )}
                </g>
              )
            })}
          </g>
        </svg>

        {/* Floating labels */}
        {activeLabels.map((item) => {
          const { x, y } = getDotPos(item.dotId)
          return (
            <div
              key={item.dotId}
              className="hero-globe-label"
              style={{
                position: 'absolute',
                left: x + 12,
                top: y - 10,
                fontSize: 9,
                padding: '2px 7px',
                borderRadius: 999,
                background: 'rgba(0,0,0,0.6)',
                border: `1px solid ${item.color}`,
                color: item.color,
                whiteSpace: 'nowrap',
                letterSpacing: '0.02em',
              }}
            >
              {item.label}
            </div>
          )
        })}
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
          animation: heroGlobeDotPulse 2.8s ease-in-out infinite;
        }
        @keyframes heroGlobeDotPulse {
          0%, 100% { opacity: 0.25; transform: scale(1); }
          50% { opacity: 0.55; transform: scale(1.35); }
        }
        .hero-globe-label {
          animation: heroGlobeLabelFade 3s ease forwards;
        }
        @keyframes heroGlobeLabelFade {
          0% { opacity: 0; transform: translateY(4px); }
          15% { opacity: 1; transform: translateY(0); }
          75% { opacity: 1; }
          100% { opacity: 0; }
        }
        @media (prefers-reduced-motion: reduce) {
          .hero-globe-spin,
          .hero-globe-dot-pulse,
          .hero-globe-label {
            animation: none !important;
          }
        }
      `}</style>
    </div>
  )
}
