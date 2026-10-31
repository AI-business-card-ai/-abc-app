'use client'

import type { CSSProperties, ReactNode } from 'react'
import {
  IconBell,
  IconCalendarEvent,
  IconCircleDashed,
  IconFileInvoice,
  IconMessageCircle,
  IconPhone,
  IconSend,
  IconTargetArrow,
  IconUsers,
} from '@tabler/icons-react'
import type { TablerIcon } from '@tabler/icons-react'
import { bucketFor } from '@/lib/followups'
import { dueDateLabel, relativeDay } from '@/lib/format-date'
import {
  STAGE_LABEL,
  STAGE_TONE,
  type Interaction,
  type NextActionType,
  type OpportunityStage,
} from '@/lib/opportunities/model'

export const ACTION_ICON: Record<NextActionType, TablerIcon> = {
  follow_up: IconSend,
  call: IconPhone,
  meeting: IconCalendarEvent,
  quote: IconFileInvoice,
  reminder: IconBell,
  other: IconCircleDashed,
}

export const INTERACTION_ICON: Record<Interaction['kind'], TablerIcon> = {
  met: IconUsers,
  message: IconSend,
  reply: IconMessageCircle,
}

export const MISSING_ICON = IconTargetArrow

export function StageChip({ stage, className = '' }: { stage: OpportunityStage; className?: string }) {
  const tone = STAGE_TONE[stage]
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11.5px] font-semibold leading-[1.5] ${className}`}
      style={{ color: tone.text, background: tone.bg, borderColor: tone.border }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: tone.dot }} aria-hidden="true" />
      {STAGE_LABEL[stage]}
    </span>
  )
}

const DUE_COLOR = {
  overdue: 'var(--abc-overdue)',
  today: 'var(--abc-today)',
  upcoming: 'var(--abc-upcoming)',
} as const

/** "Overdue · Mon 3 Nov", "Today", "Thu 6 Nov" — coloured only when it matters. */
export function DueLabel({ dueAt, className = '' }: { dueAt: string | null; className?: string }) {
  if (!dueAt) return null
  const bucket = bucketFor(dueAt)
  const label =
    bucket === 'overdue' ? `Overdue · ${dueDateLabel(dueAt)}` : bucket === 'today' ? 'Today' : dueDateLabel(dueAt)
  return (
    <span
      className={`whitespace-nowrap text-[12px] font-medium ${className}`}
      style={{ color: bucket ? DUE_COLOR[bucket] : 'var(--abc-text-muted)' }}
    >
      {label}
    </span>
  )
}

export function InteractionLine({ interaction }: { interaction: Interaction | null }) {
  if (!interaction) {
    return <p className="text-[12px] text-abc-muted">No interaction recorded</p>
  }
  const Icon = INTERACTION_ICON[interaction.kind]
  return (
    <p className="flex min-w-0 items-center gap-1.5 text-[12px] text-abc-secondary">
      <Icon size={14} stroke={1.8} className="shrink-0 text-abc-muted" aria-hidden="true" />
      <span className="min-w-0 truncate">
        {interaction.label} · {relativeDay(interaction.at)}
      </span>
    </p>
  )
}

/** A short failure, in the light workspace's own red. */
export function InlineError({ children }: { children: ReactNode }) {
  return (
    <p
      role="alert"
      className="rounded-inner border px-3.5 py-2.5 text-[13px]"
      style={{
        color: 'var(--abc-overdue)',
        background: 'rgba(192, 39, 31, 0.06)',
        borderColor: 'rgba(192, 39, 31, 0.24)',
      }}
    >
      {children}
    </p>
  )
}

/** A short confirmation that leaves on its own. */
export function Notice({ children }: { children: ReactNode }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-4 bottom-[calc(84px+env(safe-area-inset-bottom))] z-[115] mx-auto max-w-[420px] rounded-inner border border-abc-border bg-abc-card px-4 py-3 text-center text-[13.5px] text-abc-text lg:bottom-6"
      style={{ boxShadow: 'var(--abc-shadow-raised)' }}
    >
      {children}
    </div>
  )
}

export const PILL_CLASS =
  'min-h-[44px] shrink-0 whitespace-nowrap rounded-full border px-3.5 py-2 text-[12.5px] font-medium transition-colors duration-200 ease-abc abc-focus-ring'

export function pillState(active: boolean): { className: string; style?: CSSProperties } {
  return active
    ? { className: 'border-transparent text-[#1a1205]', style: { background: 'var(--abc-gold)' } }
    : { className: 'border-abc-border bg-abc-raised text-abc-secondary hover:border-abc-border-strong hover:text-abc-text' }
}
