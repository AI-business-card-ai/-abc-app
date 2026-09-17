'use client'

import { createContext, useContext, useEffect, useRef, type CSSProperties, type ReactNode } from 'react'
import { observe, supportsObserver } from './observe'

/**
 * One landing chapter: the section reveal and the active-section lighting.
 *
 * Two attributes, set straight on the element so neither causes a React
 * render:
 *
 *  - data-seen — once, when the section first comes into view. The CSS then
 *    wakes the chapter in order: eyebrow, headline, supporting copy, visual,
 *    controls.
 *  - data-active — while the section crosses the middle of the viewport. Only
 *    one chapter can do that at a time, so this is the "current chapter" cue
 *    that brightens its media and lifts its ambient light. It is a band
 *    intersection, not a scroll handler.
 *
 * Reveal blocks rendered inside a chapter hand their timing to it (see
 * useInChapter), so there is exactly one reveal path on the page.
 */

const ChapterContext = createContext(false)

export function useInChapter(): boolean {
  return useContext(ChapterContext)
}

export default function Chapter({
  children,
  id,
  className = '',
  labelledBy,
  label,
  glow,
}: {
  children: ReactNode
  id?: string
  className?: string
  labelledBy?: string
  label?: string
  /** Where the chapter's ambient light sits, as CSS percentages. */
  glow?: { x: string; y: string }
}) {
  const ref = useRef<HTMLElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    if (!supportsObserver()) {
      el.dataset.seen = 'true'
      return
    }

    const stopSeen = observe(el, { threshold: [0], rootMargin: '0px 0px -14% 0px' }, (entry) => {
      if (!entry.isIntersecting) return
      el.dataset.seen = 'true'
      stopSeen()
    })

    const stopActive = observe(el, { threshold: [0], rootMargin: '-44% 0px -44% 0px' }, (entry) => {
      if (entry.isIntersecting) el.dataset.active = 'true'
      else delete el.dataset.active
    })

    return () => {
      stopSeen()
      stopActive()
    }
  }, [])

  const style = glow ? ({ '--cine-glow-x': glow.x, '--cine-glow-y': glow.y } as CSSProperties) : undefined

  return (
    <ChapterContext.Provider value={true}>
      <section
        ref={ref}
        id={id}
        className={`cine-chapter${className ? ` ${className}` : ''}`}
        aria-labelledby={labelledBy}
        aria-label={label}
        style={style}
      >
        {children}
      </section>
    </ChapterContext.Provider>
  )
}
