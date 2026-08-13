import Link from 'next/link'
import type { ReactNode } from 'react'

type Variant = 'gold' | 'surface' | 'ghost'
type Size = 'md' | 'lg'

const VARIANTS: Record<Variant, string> = {
  gold: 'bg-abc-gold text-[#1a1205] hover:brightness-[1.06] active:brightness-95 font-semibold',
  surface:
    'bg-abc-raised text-abc-text border border-abc-border hover:border-abc-border-strong font-medium',
  ghost:
    'bg-transparent text-abc-secondary hover:text-abc-text hover:bg-abc-raised font-medium',
}

const SIZES: Record<Size, string> = {
  md: 'h-11 px-4 text-[14px] gap-2',
  lg: 'h-[52px] px-5 text-[15px] gap-2.5',
}

function classes(variant: Variant, size: Size, fullWidth: boolean, extra: string) {
  return [
    'inline-flex items-center justify-center rounded-btn',
    'transition-[filter,background-color,border-color,transform] duration-200 ease-abc',
    'active:scale-[0.99] disabled:opacity-45 disabled:pointer-events-none',
    'abc-focus-ring touch-target',
    VARIANTS[variant],
    SIZES[size],
    fullWidth ? 'w-full' : '',
    extra,
  ]
    .filter(Boolean)
    .join(' ')
}

export default function Button({
  children,
  href,
  onClick,
  variant = 'gold',
  size = 'md',
  fullWidth = false,
  disabled = false,
  type = 'button',
  className = '',
  ariaLabel,
}: {
  children: ReactNode
  href?: string
  onClick?: () => void
  variant?: Variant
  size?: Size
  fullWidth?: boolean
  disabled?: boolean
  type?: 'button' | 'submit'
  className?: string
  ariaLabel?: string
}) {
  const cls = classes(variant, size, fullWidth, className)

  if (href && !disabled) {
    return (
      <Link href={href} className={cls} aria-label={ariaLabel}>
        {children}
      </Link>
    )
  }

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={cls}
      aria-label={ariaLabel}
    >
      {children}
    </button>
  )
}
