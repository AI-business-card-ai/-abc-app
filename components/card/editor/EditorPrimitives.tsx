'use client'

import { useId, type ReactNode } from 'react'
import { IconChevronDown } from '@tabler/icons-react'
import type { TablerIcon } from '@tabler/icons-react'

/**
 * Editor building blocks in the ABC system: near-black surfaces, gold for the
 * one active thing, gray for everything else. Inputs are 16px so iOS does not
 * zoom the page when they take focus.
 */

export function Section({
  id,
  title,
  description,
  icon: SectionIcon,
  open,
  onToggle,
  badge,
  children,
}: {
  id: string
  title: string
  description?: string
  icon?: TablerIcon
  open: boolean
  onToggle: () => void
  badge?: ReactNode
  children: ReactNode
}) {
  const panelId = `${id}-panel`

  return (
    <section className="overflow-hidden rounded-card border border-abc-border bg-abc-card">
      <h2>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-controls={panelId}
          className="flex w-full items-center gap-3 px-4 py-4 text-left transition-colors duration-200 ease-abc hover:bg-abc-raised abc-focus-ring sm:px-5"
        >
          {SectionIcon ? (
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-abc-border bg-abc-raised">
              <SectionIcon size={18} stroke={1.7} style={{ color: 'var(--abc-gold-accent)' }} />
            </span>
          ) : null}

          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-2">
              <span className="text-[15px] font-semibold text-abc-text">{title}</span>
              {badge}
            </span>
            {description ? (
              <span className="mt-0.5 block text-[12.5px] leading-[1.45] text-abc-muted">
                {description}
              </span>
            ) : null}
          </span>

          <IconChevronDown
            size={19}
            stroke={1.8}
            className="shrink-0 text-abc-muted transition-transform duration-200 ease-abc"
            style={{ transform: open ? 'rotate(180deg)' : 'none' }}
          />
        </button>
      </h2>

      {open ? (
        <div id={panelId} className="border-t border-abc-border px-4 py-5 sm:px-5">
          {children}
        </div>
      ) : null}
    </section>
  )
}

export function Field({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
  hint,
  error,
  prefix,
  maxLength,
  inputMode,
  autoComplete,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  type?: string
  hint?: string
  error?: string | null
  prefix?: string
  maxLength?: number
  inputMode?: 'text' | 'tel' | 'email' | 'url'
  autoComplete?: string
}) {
  const id = useId()

  return (
    <div>
      <label htmlFor={id} className="block text-[12.5px] font-medium text-abc-secondary">
        {label}
      </label>

      <div
        className={`mt-1.5 flex items-center rounded-inner border bg-abc-raised transition-colors duration-200 ease-abc focus-within:border-abc-gold-border ${
          error ? 'border-[color:var(--abc-overdue)]' : 'border-abc-border'
        }`}
      >
        {prefix ? (
          <span className="shrink-0 pl-3 text-[15px] text-abc-muted" aria-hidden="true">
            {prefix}
          </span>
        ) : null}
        <input
          id={id}
          type={type}
          value={value}
          inputMode={inputMode}
          autoComplete={autoComplete}
          maxLength={maxLength}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          aria-invalid={error ? true : undefined}
          /* 16px keeps iOS Safari from zooming the viewport on focus. */
          className="h-[48px] w-full min-w-0 rounded-inner bg-transparent px-3 text-[16px] text-abc-text outline-none placeholder:text-abc-muted"
        />
      </div>

      {error ? (
        <p className="mt-1.5 text-[12px]" style={{ color: 'var(--abc-overdue)' }} role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="mt-1.5 text-[12px] leading-[1.45] text-abc-muted">{hint}</p>
      ) : null}
    </div>
  )
}

export function TextArea({
  label,
  value,
  onChange,
  placeholder,
  maxLength,
  rows = 3,
  hint,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  maxLength?: number
  rows?: number
  hint?: string
}) {
  const id = useId()

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="block text-[12.5px] font-medium text-abc-secondary">
          {label}
        </label>
        {maxLength ? (
          <span className="text-[11.5px] tabular-nums text-abc-muted">
            {value.length}/{maxLength}
          </span>
        ) : null}
      </div>
      <textarea
        id={id}
        value={value}
        rows={rows}
        maxLength={maxLength}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-1.5 w-full resize-y rounded-inner border border-abc-border bg-abc-raised px-3 py-2.5 text-[16px] leading-[1.5] text-abc-text outline-none transition-colors duration-200 ease-abc placeholder:text-abc-muted focus:border-abc-gold-border"
      />
      {hint ? <p className="mt-1.5 text-[12px] leading-[1.45] text-abc-muted">{hint}</p> : null}
    </div>
  )
}

/**
 * Visibility switch. Gold means shown on the public card, gray means hidden —
 * and the state is also written out, so it never depends on colour alone.
 */
export function Toggle({
  checked,
  onChange,
  label,
  onLabel = 'Shown',
  offLabel = 'Hidden',
}: {
  checked: boolean
  onChange: (next: boolean) => void
  label: string
  onLabel?: string
  offLabel?: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={`${label}: ${checked ? onLabel : offLabel}`}
      onClick={() => onChange(!checked)}
      className="group inline-flex min-h-[44px] shrink-0 items-center gap-2 rounded-full py-1 abc-focus-ring"
    >
      <span
        className="relative flex h-[26px] w-[46px] shrink-0 items-center rounded-full border transition-colors duration-200 ease-abc"
        style={{
          background: checked ? 'var(--abc-gold-soft)' : 'var(--abc-raised)',
          borderColor: checked ? 'var(--abc-gold-border)' : 'var(--abc-border)',
        }}
      >
        <span
          className="absolute h-[18px] w-[18px] rounded-full transition-[left] duration-200 ease-abc"
          style={{
            left: checked ? 24 : 4,
            background: checked ? 'var(--abc-gold-accent)' : 'var(--abc-text-muted)',
          }}
        />
      </span>
      <span
        className="w-[46px] text-left text-[12px] font-medium"
        style={{ color: checked ? 'var(--abc-gold-accent)' : 'var(--abc-text-muted)' }}
      >
        {checked ? onLabel : offLabel}
      </span>
    </button>
  )
}

export function Chip({
  children,
  active = false,
  onClick,
  ariaLabel,
}: {
  children: ReactNode
  active?: boolean
  onClick: () => void
  ariaLabel?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={ariaLabel}
      className="min-h-[40px] rounded-full border px-3.5 py-2 text-[13px] font-medium transition-colors duration-200 ease-abc abc-focus-ring"
      style={{
        background: active ? 'var(--abc-gold-soft)' : 'var(--abc-raised)',
        borderColor: active ? 'var(--abc-gold-border)' : 'var(--abc-border)',
        color: active ? 'var(--abc-gold-accent)' : 'var(--abc-text-secondary)',
      }}
    >
      {children}
    </button>
  )
}

export function FieldRow({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-4">{children}</div>
}
