'use client'

import { useEffect, useRef, useState, type ElementType, type ReactNode } from 'react'

/**
 * The two primitives every champagne scene is built from.
 *
 * Both are deliberately small and self-contained: the previous landing's
 * `Reveal` is wired into the cinematic Chapter context, which carries the dark
 * system's timing and classes with it. Nothing here depends on that, so the two
 * systems can live side by side in the repository without one tinting the
 * other.
 */

/** Fades its children up once, when they first reach the viewport. */
export function Reveal({
  children,
  as: Tag = 'div',
  delay = 0,
  className = '',
}: {
  children: ReactNode
  as?: ElementType
  /** Small stagger for siblings, in ms. Punctuation, not choreography. */
  delay?: number
  className?: string
}) {
  const ref = useRef<HTMLElement>(null)
  const [shown, setShown] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return
        setShown(true)
        observer.disconnect()
      },
      { threshold: 0.08, rootMargin: '0px 0px -50px 0px' }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return (
    <Tag
      ref={ref}
      className={`lp-reveal${shown ? ' is-in' : ''}${className ? ` ${className}` : ''}`}
      style={delay && shown ? { transitionDelay: `${delay}ms` } : undefined}
    >
      {children}
    </Tag>
  )
}

/**
 * The signature gold line.
 *
 * One continuous stroke that runs behind the hero composition and again,
 * larger, under the closing scene — the motif that makes the page recognisably
 * ABC rather than a beige template. It draws once on load and then holds.
 *
 * Decoration only: `aria-hidden`, no information, and the layout is identical
 * without it. `prefers-reduced-motion` renders it already drawn.
 */
export function GoldFlow({ variant = 'hero' }: { variant?: 'hero' | 'closing' }) {
  const hero = variant === 'hero'
  const path = hero
    ? 'M-40 210 C 120 150, 190 300, 330 250 S 540 70, 700 150 S 880 330, 1040 240'
    : 'M-40 120 C 180 20, 320 230, 520 150 S 820 10, 1060 110 S 1280 230, 1480 150'

  return (
    <svg
      className="lp-flow"
      viewBox={hero ? '0 0 1000 400' : '0 0 1440 260'}
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id="lp-flow-gradient" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#c99628" stopOpacity="0" />
          <stop offset="28%" stopColor="#c99628" stopOpacity="0.55" />
          <stop offset="58%" stopColor="#e2b64e" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#c99628" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path className="lp-flow-soft" d={path} />
      <path d={path} />
    </svg>
  )
}

/** A zero-height target that keeps an older in-page link working. */
export function Anchor({ id }: { id: string }) {
  return <span id={id} className="lp-anchor" aria-hidden="true" />
}
