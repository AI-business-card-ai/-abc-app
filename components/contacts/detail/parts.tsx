'use client'

import type { ReactNode } from 'react'
import type { TablerIcon } from '@tabler/icons-react'

/** Shared field styling — 16px on mobile so iOS Safari does not zoom on focus. */
export const INPUT_CLASS =
  'w-full rounded-inner border border-abc-border bg-abc-raised px-3 text-[16px] text-abc-text outline-none transition-colors duration-200 ease-abc placeholder:text-abc-muted focus:border-abc-gold-accent sm:text-[15px]'

export const FIELD_LABEL_CLASS = 'mb-1.5 block text-[12px] text-abc-muted'

export function ErrorNote({ children }: { children: ReactNode }) {
  return (
    <p
      className="rounded-inner px-3.5 py-3 text-[13.5px]"
      style={{
        background: 'rgba(239, 68, 68, 0.1)',
        border: '1px solid rgba(239, 68, 68, 0.3)',
        color: '#fca5a5',
      }}
      role="alert"
    >
      {children}
    </p>
  )
}

/** One labelled value inside an information surface. */
export function FieldRow({
  icon: RowIcon,
  label,
  value,
  href,
}: {
  icon: TablerIcon
  label: string
  value: string
  href?: string
}) {
  const body = (
    <>
      <RowIcon
        size={17}
        stroke={1.75}
        className="shrink-0"
        style={{ color: 'var(--abc-gold-accent)' }}
      />
      <span className="shrink-0 text-[13px] text-abc-muted">{label}</span>
      <span className="ml-auto min-w-0 truncate text-right text-[14px] text-abc-text">
        {value}
      </span>
    </>
  )

  if (href) {
    return (
      <a
        href={href}
        target={href.startsWith('http') ? '_blank' : undefined}
        rel={href.startsWith('http') ? 'noopener noreferrer' : undefined}
        className="flex items-center gap-2.5 px-4 py-3 transition-colors duration-200 ease-abc hover:bg-abc-raised/60 abc-focus-ring"
      >
        {body}
      </a>
    )
  }

  return <span className="flex items-center gap-2.5 px-4 py-3">{body}</span>
}

/** Section heading used across the detail cards. */
export function CardTitle({ children }: { children: ReactNode }) {
  return (
    <h2 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-abc-muted">
      {children}
    </h2>
  )
}
