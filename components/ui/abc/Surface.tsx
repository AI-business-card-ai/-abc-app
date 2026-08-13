import type { ReactNode } from 'react'

/**
 * The base card geometry of the approved design system:
 * #121214 surface, 1px #232326 border, 22px radius, near-flat shadow.
 */
export default function Surface({
  children,
  className = '',
  interactive = false,
  as: Tag = 'div',
}: {
  children: ReactNode
  className?: string
  interactive?: boolean
  as?: 'div' | 'section' | 'article' | 'li'
}) {
  return (
    <Tag
      className={`abc-surface ${interactive ? 'abc-surface-interactive' : ''} ${className}`}
    >
      {children}
    </Tag>
  )
}
