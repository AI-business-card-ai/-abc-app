'use client'

import { useEffect, useId, useRef, useState, type CSSProperties } from 'react'

/**
 * The gold light that travels around a Home card's edge.
 *
 * One thin trace, brightest at its head and fading along a tail, moving
 * slowly round the perimeter while the rest of the border stays a hairline.
 *
 * It is an SVG stroke rather than a rotating conic gradient because a conic
 * sweep is measured in angle from the centre: on a wide panel it crawls along
 * the long edges and races down the short ones. A dash measured along the
 * path moves at one speed all the way round, which is what makes it read as
 * light running along a metal edge rather than a radar sweep.
 *
 * The perimeter is measured, not assumed, so the dash pattern has exactly one
 * period per lap whatever size the card is. Speed is held roughly constant
 * across cards and clamped to 7–12 s a lap; `phase` staggers cards so they
 * never move in step.
 *
 * Reduced motion: the animation is removed in CSS and the same segments stay
 * parked across the top-left corner — a still gold highlight, not a gap.
 * Off-screen cards pause, so a long page is not repainting what nobody sees.
 */
export default function GoldTrace({
  radius = 24,
  phase = 0,
  className = '',
}: {
  /** The card's outer corner radius, in px. */
  radius?: number
  /** 0–1: where in its lap this card starts. */
  phase?: number
  className?: string
}) {
  const ref = useRef<SVGSVGElement>(null)
  const [box, setBox] = useState<{ w: number; h: number } | null>(null)
  const [visible, setVisible] = useState(true)
  const gid = useId().replace(/:/g, '')

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const resize = new ResizeObserver(([entry]) => {
      // The layout box, not getBoundingClientRect(): a transformed ancestor
      // (a page transition, a zoom) would otherwise inflate the perimeter and
      // draw the trace outside the card.
      const rect = entry.contentRect
      setBox((prev) => {
        const next = { w: Math.round(rect.width), h: Math.round(rect.height) }
        return prev && prev.w === next.w && prev.h === next.h ? prev : next
      })
    })
    resize.observe(el)
    const seen = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting))
    seen.observe(el)
    return () => {
      resize.disconnect()
      seen.disconnect()
    }
  }, [])

  const stroke = 1.5
  const inset = stroke / 2

  let segments: { len: number; width: number; opacity: number; glow?: boolean }[] = []
  let perimeter = 0
  let duration = 10
  let geometry = { x: inset, y: inset, w: 0, h: 0, r: 0 }

  if (box && box.w > 8 && box.h > 8) {
    const w = box.w - stroke
    const h = box.h - stroke
    const r = Math.max(0, Math.min(radius - inset, w / 2, h / 2))
    geometry = { x: inset, y: inset, w, h, r }
    perimeter = 2 * (w + h) - (8 - 2 * Math.PI) * r
    duration = Math.min(12, Math.max(7, perimeter / 190))

    const tail = Math.min(260, perimeter * 0.16)
    segments = [
      { len: tail * 0.9, width: 7, opacity: 0.32, glow: true },
      { len: tail, width: stroke, opacity: 0.16 },
      { len: tail * 0.62, width: stroke, opacity: 0.26 },
      { len: tail * 0.34, width: stroke, opacity: 0.42 },
      { len: Math.max(18, tail * 0.13), width: 1.75, opacity: 0.95 },
    ]
  }

  /*
    Every segment shares one head. A dash covering [s, s + len] leads at
    s + len, so for the heads to coincide each segment starts len behind it:
    offset = len - head. The parked (reduced-motion) head sits a little past
    the top-left corner, which is where the static highlight should fall.
  */
  const parkedHead = perimeter * 0.06

  return (
    <svg
      ref={ref}
      aria-hidden="true"
      focusable="false"
      className={`abc-trace ${className}`}
      data-paused={visible ? undefined : ''}
      style={
        {
          '--abc-trace-dur': `${duration.toFixed(2)}s`,
          '--abc-trace-delay': `${(-phase * duration).toFixed(2)}s`,
          '--abc-trace-p': `${perimeter.toFixed(1)}px`,
        } as CSSProperties
      }
    >
      {segments.length > 0 ? (
        <>
          <defs>
            <linearGradient id={`t${gid}`} x1="0" y1="0" x2={geometry.w} y2={geometry.h} gradientUnits="userSpaceOnUse">
              <stop offset="0" stopColor="#e9c46a" />
              <stop offset="0.45" stopColor="#c99628" />
              <stop offset="0.7" stopColor="#f0d388" />
              <stop offset="1" stopColor="#c99628" />
            </linearGradient>
            <filter id={`g${gid}`} x="-10%" y="-10%" width="120%" height="120%">
              <feGaussianBlur stdDeviation="3.2" />
            </filter>
          </defs>
          {segments.map((seg, i) => (
            <rect
              key={i}
              className="abc-trace-seg"
              x={geometry.x}
              y={geometry.y}
              width={geometry.w}
              height={geometry.h}
              rx={geometry.r}
              ry={geometry.r}
              stroke={seg.glow ? '#e2b64e' : `url(#t${gid})`}
              strokeWidth={seg.width}
              strokeOpacity={seg.opacity}
              strokeDasharray={`${seg.len.toFixed(1)} ${(perimeter - seg.len).toFixed(1)}`}
              filter={seg.glow ? `url(#g${gid})` : undefined}
              style={{ '--abc-trace-from': `${(seg.len - parkedHead).toFixed(1)}px` } as CSSProperties}
            />
          ))}
        </>
      ) : null}
    </svg>
  )
}
