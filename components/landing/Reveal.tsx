'use client'

import { useEffect, useRef, useState, type ElementType, type ReactNode } from 'react'

/**
 * Reveals its children once, when they first come into view.
 *
 * One observer per block, disconnected on first intersection — a scroll
 * listener recalculating positions for a dozen sections is the kind of thing
 * that only shows up as jank on the cheap Android phone somebody is holding at
 * a trade fair, which is exactly this site's audience.
 *
 * `as` keeps the wrapper out of the way of the layout it sits inside: a reveal
 * around a grid child has to be able to *be* the grid child rather than
 * introduce a div that breaks the grid.
 *
 * Reduced motion is handled entirely in CSS, so there is no second code path
 * here to keep in sync: .pub-reveal simply resolves to the finished state.
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
  const ref = useRef<HTMLElement>(null)
  const [shown, setShown] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    // Already in view on load (short pages, deep links, restored scroll):
    // show immediately rather than waiting for a scroll that never comes.
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
  }, [])

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
