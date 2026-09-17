'use client'

import { Fragment, useEffect, useRef, type CSSProperties } from 'react'
import { MOBILE_QUERY, REDUCED_MOTION_QUERY, matches, observe } from './observe'

/**
 * The landing's one headline treatment: warm light travelling across type that
 * is already there.
 *
 * Nothing appears letter by letter. The heading is fully painted and readable
 * from the first frame; a wave then passes through it — each character warms
 * to champagne, peaks with a restrained backlight, leaves an afterglow and
 * settles back to its own colour. Neighbouring characters overlap in the
 * light, so it reads as one source moving behind the lettering rather than a
 * row of letters blinking in turn.
 *
 * Accessibility: the semantic element carries the full sentence once, in a
 * visually hidden span. The lit characters are a presentation copy marked
 * aria-hidden, so assistive technology reads the heading exactly once and
 * never meets forty single-letter spans.
 *
 * The motion is CSS (see CINEMATIC SYSTEM in globals.css). This component only
 * decides *when*: on first meaningful visibility, and then occasionally while
 * the heading stays in view — paused when it scrolls away or the tab is
 * hidden, and resumed on a fresh interval rather than with an instant flash.
 */

/* ---------------------------------------------------------------- timing */

/** Per-character duration and stagger range. Must match the CSS durations. */
export const HEADLINE_TIMING = {
  desktop: { duration: 735, staggerMin: 14, staggerMax: 37, budget: 1250 },
  mobile: { duration: 575, staggerMin: 12, staggerMax: 28, budget: 1000 },
} as const

/** Replay window while the heading remains visible, in ms. */
export const HEADLINE_REPLAY = {
  standard: { desktop: [8500, 10500], mobile: [10000, 13000] },
  hero: { desktop: [10000, 12000], mobile: [11000, 13000] },
} as const

/** Share of the heading that must be visible to fire the first wave. */
export const HEADLINE_ACTIVATION = { standard: 0.42, hero: 0.25 } as const

/** Share that must stay visible for replays to keep running. */
export const HEADLINE_REPLAY_VISIBILITY = 0.3

/** Lets the chapter's reveal bring the heading in before the light arrives. */
const ENTRY_DELAY = { standard: 320, hero: 420 } as const

/** After returning to the tab: settle first, never flash on arrival. */
const RESUME_DELAY = 1400

type Timing = (typeof HEADLINE_TIMING)[keyof typeof HEADLINE_TIMING]

/**
 * Normalised stagger: long headings travel faster per character so the whole
 * wave stays under ~2s, short ones slow down so they still read as travel.
 */
export function headlineStagger(length: number, timing: Timing): number {
  const raw = Math.round(timing.budget / Math.max(length - 1, 1))
  return Math.min(timing.staggerMax, Math.max(timing.staggerMin, raw))
}

function waveLength(length: number, timing: Timing): number {
  return timing.duration + (length - 1) * headlineStagger(length, timing)
}

/* ------------------------------------------------------------- component */

type Tag = 'h1' | 'h2' | 'p'

export default function CinematicHeadline({
  children,
  as: Element = 'h2',
  id,
  className = '',
  variant = 'standard',
  tone = 'dark',
}: {
  /** Plain text only — the wave is built from its characters. */
  children: string
  as?: Tag
  id?: string
  className?: string
  variant?: 'standard' | 'hero'
  tone?: 'dark' | 'light'
}) {
  const ref = useRef<HTMLElement>(null)
  const text = children
  const length = text.length

  useEffect(() => {
    const el = ref.current
    if (!el) return

    let ratio = 0
    let played = false
    let run: 'a' | 'b' = 'b'
    let replayTimer: number | undefined
    let entryTimer: number | undefined
    let endTimer: number | undefined

    const timing = () => (matches(MOBILE_QUERY) ? HEADLINE_TIMING.mobile : HEADLINE_TIMING.desktop)
    const reduced = () => matches(REDUCED_MOTION_QUERY)

    const play = () => {
      if (reduced() || document.hidden) return
      // Alternating two identical keyframe names restarts the animation
      // without removing the class and forcing a reflow.
      run = run === 'a' ? 'b' : 'a'
      el.dataset.wave = run
      window.clearTimeout(endTimer)
      const current = run
      endTimer = window.setTimeout(() => {
        if (el.dataset.wave === current) delete el.dataset.wave
      }, waveLength(length, timing()) + 80)
    }

    const clearReplay = () => {
      window.clearTimeout(replayTimer)
      replayTimer = undefined
    }

    const scheduleReplay = () => {
      clearReplay()
      if (reduced()) return
      const range = HEADLINE_REPLAY[variant][matches(MOBILE_QUERY) ? 'mobile' : 'desktop']
      const wait = range[0] + Math.random() * (range[1] - range[0])
      replayTimer = window.setTimeout(() => {
        replayTimer = undefined
        if (ratio < HEADLINE_REPLAY_VISIBILITY || document.hidden) return
        play()
        scheduleReplay()
      }, wait)
    }

    const firstPlay = (delay: number) => {
      window.clearTimeout(entryTimer)
      entryTimer = window.setTimeout(() => {
        entryTimer = undefined
        if (ratio < HEADLINE_REPLAY_VISIBILITY || document.hidden) return
        played = true
        play()
        scheduleReplay()
      }, delay)
    }

    const unobserve = observe(
      el,
      {
        threshold: [0, HEADLINE_REPLAY_VISIBILITY, HEADLINE_ACTIVATION[variant]],
        // Standard headings wait until they are clear of the bottom edge.
        rootMargin: variant === 'hero' ? '0px' : '0px 0px -10% 0px',
      },
      (entry) => {
        ratio = entry.isIntersecting ? entry.intersectionRatio : 0

        if (!played) {
          if (ratio >= HEADLINE_ACTIVATION[variant] - 0.001 && entryTimer === undefined) {
            firstPlay(ENTRY_DELAY[variant])
          }
          return
        }

        if (ratio < HEADLINE_REPLAY_VISIBILITY) clearReplay()
        else if (replayTimer === undefined) scheduleReplay()
      }
    )

    const onVisibility = () => {
      if (document.hidden) {
        clearReplay()
        window.clearTimeout(entryTimer)
        entryTimer = undefined
        return
      }
      if (ratio < HEADLINE_REPLAY_VISIBILITY) return
      if (played) scheduleReplay()
      else if (ratio >= HEADLINE_ACTIVATION[variant] - 0.001) firstPlay(RESUME_DELAY)
    }
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      unobserve()
      document.removeEventListener('visibilitychange', onVisibility)
      window.clearTimeout(replayTimer)
      window.clearTimeout(entryTimer)
      window.clearTimeout(endTimer)
      delete el.dataset.wave
    }
  }, [length, variant])

  const style = {
    '--cine-stg-d': `${headlineStagger(length, HEADLINE_TIMING.desktop)}ms`,
    '--cine-stg-m': `${headlineStagger(length, HEADLINE_TIMING.mobile)}ms`,
  } as CSSProperties

  // Index runs across spaces too, so the light pauses naturally between words.
  let index = 0
  const words = text.split(' ')

  return (
    <Element
      ref={ref as never}
      id={id}
      className={`cine-h cine-h--${tone}${variant === 'hero' ? ' cine-h--hero' : ''}${className ? ` ${className}` : ''}`}
      style={style}
    >
      <span className="cine-sr">{text}</span>
      <span className="cine-vis" aria-hidden="true">
        {words.map((word, w) => {
          const chars = Array.from(word).map((ch) => {
            const i = index++
            return (
              <span className="cine-c" key={i} style={{ '--i': i } as CSSProperties}>
                {ch}
              </span>
            )
          })
          index++
          return (
            <Fragment key={w}>
              <span className="cine-w">{chars}</span>
              {w < words.length - 1 ? ' ' : null}
            </Fragment>
          )
        })}
      </span>
    </Element>
  )
}
