import type { ReactNode } from 'react'
import Link from 'next/link'
import type { TablerIcon } from '@tabler/icons-react'

/** Uppercase eyebrow label — "RECENT ACTIVITY" in the approved dashboard. */
export function SectionLabel({
  children,
  className = '',
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <p
      className={`text-[11px] font-semibold uppercase tracking-[0.08em] text-abc-muted ${className}`}
    >
      {children}
    </p>
  )
}

/** Event chip — indigo tint, as used on contact rows. */
export function EventChip({ children }: { children: ReactNode }) {
  return (
    <span
      className="inline-flex max-w-full items-center truncate rounded-md border px-1.5 py-0.5 text-[10.5px] font-medium leading-[1.5]"
      style={{
        background: 'var(--abc-chip-bg)',
        color: 'var(--abc-chip-text)',
        borderColor: 'var(--abc-chip-border)',
      }}
    >
      {children}
    </span>
  )
}

/**
 * Square icon-over-label tile — the Call / Email / WhatsApp / Save contact
 * and Edit / Share / QR Code / Wallet pattern from the approved screens.
 */
export function IconTile({
  icon: TileIcon,
  label,
  href,
  onClick,
  iconColor,
  disabled = false,
  title,
  labelClassName = '',
}: {
  icon: TablerIcon
  label: string
  href?: string
  onClick?: () => void
  iconColor?: string
  disabled?: boolean
  title?: string
  /** Extra classes on the label — lets a cramped column hide it responsively. */
  labelClassName?: string
}) {
  const inner = (
    <>
      <TileIcon size={19} stroke={1.75} style={{ color: iconColor || 'var(--abc-gold-accent)' }} />
      <span
        className={`mt-1.5 whitespace-nowrap text-[11px] font-medium leading-none text-abc-secondary lg:text-[10px] ${labelClassName}`}
      >
        {label}
      </span>
    </>
  )

  const cls =
    'flex min-h-[62px] min-w-0 flex-1 flex-col items-center justify-center rounded-inner border border-abc-border bg-abc-raised px-0.5 py-2.5 transition-colors duration-200 ease-abc hover:border-abc-border-strong abc-focus-ring disabled:opacity-40 disabled:pointer-events-none'

  // aria-label keeps the action named even when the visible label is hidden.
  if (href && !disabled) {
    return (
      <Link href={href} className={cls} title={title || label} aria-label={label}>
        {inner}
      </Link>
    )
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cls}
      title={title || label}
      aria-label={label}
    >
      {inner}
    </button>
  )
}

/** Honest empty state — headline + action, no illustration. */
export function EmptyState({
  icon: EmptyIcon,
  title,
  description,
  action,
}: {
  icon?: TablerIcon
  title: string
  description?: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-10 text-center">
      {EmptyIcon ? (
        <span className="mb-3.5 flex h-11 w-11 items-center justify-center rounded-full border border-abc-border bg-abc-raised">
          <EmptyIcon size={20} stroke={1.6} style={{ color: 'var(--abc-text-muted)' }} />
        </span>
      ) : null}
      <p className="text-[15px] font-semibold text-abc-text">{title}</p>
      {description ? (
        <p className="mt-1.5 max-w-[34ch] text-[13px] leading-[1.55] text-abc-secondary">
          {description}
        </p>
      ) : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  )
}

/** Shimmer placeholder — replaces spinners on route transitions. */
export function Skeleton({
  className = '',
  radius = 10,
}: {
  className?: string
  radius?: number
}) {
  return (
    <span
      className={`skeleton-block block ${className}`}
      style={{ borderRadius: radius }}
      aria-hidden="true"
    />
  )
}
