'use client'

import { useEffect, useRef, useState, type CSSProperties, type ElementType, type ReactNode } from 'react'
import { useInChapter } from '@/components/landing/cinema/Chapter'

/**
 * Reveals its children once, when they first come into view.
 *
 * Inside a cinematic Chapter it does not observe anything itself: it becomes a
 * timed item in the chapter's own reveal, so a section wakes as one sequence
 * instead of a dozen independent observers racing each other. Outside a
 * chapter it keeps its original behaviour — one observer, disconnected on
 * first intersection.
 *
 * `as` keeps the wrapper out of the way of the layout it sits inside: a reveal
 * around a grid child has to be able to *be* the grid child rather than
 * introduce a div that breaks the grid.
 *
 * Reduced motion is handled entirely in CSS, so there is no second code path
 * here to keep in sync.
 */
export default function Reveal({
  children,
  as: Tag = 'div',
  delay = 0,
  className = '',
}: {
  children: ReactNode
  as?: ElementType
  /** Small stagger for siblings, in ms. Keep under ~200 — this is punctuation, not choreography. */
  delay?: number
  className?: string
}) {
  const inChapter = useInChapter()
  const ref = useRef<HTMLElement>(null)
  const [shown, setShown] = useState(false)

  useEffect(() => {
    if (inChapter) return
    const el = ref.current
    if (!el) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return
        setShown(true)
        observer.disconnect()
      },
      { threshold: 0.08, rootMargin: '0px 0px -60px 0px' }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [inChapter])

  if (inChapter) {
    return (
      <Tag
        className={`cine-item${className ? ` ${className}` : ''}`}
        style={delay ? ({ '--cine-d': `${delay}ms` } as CSSProperties) : undefined}
      >
        {children}
      </Tag>
    )
  }

  return (
    <Tag
      ref={ref}
      className={`pub-reveal${shown ? ' is-in' : ''}${className ? ` ${className}` : ''}`}
      style={delay && shown ? { transitionDelay: `${delay}ms` } : undefined}
    >
      {children}
    </Tag>
  )
}
