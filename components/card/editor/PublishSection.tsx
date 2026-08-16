'use client'

import { IconCheck, IconLoader2, IconX } from '@tabler/icons-react'
import { Toggle } from '@/components/card/editor/EditorPrimitives'
import { CARD_PUBLIC_BASE } from '@/lib/card/types'
import type { EditorForm } from '@/lib/card/editor-form'

export type SlugStatus = 'idle' | 'checking' | 'ok' | 'bad'

export default function PublishSection({
  form,
  patch,
  slugStatus,
  slugMessage,
}: {
  form: EditorForm
  patch: (patch: Partial<EditorForm>) => void
  slugStatus: SlugStatus
  slugMessage: string | null
}) {
  const base = CARD_PUBLIC_BASE.replace(/^https?:\/\//, '') + '/'

  return (
    <div className="flex flex-col gap-5">
      <div>
        <label htmlFor="card-slug" className="block text-[12.5px] font-medium text-abc-secondary">
          Card address
        </label>

        <div className="mt-1.5 flex items-center rounded-inner border border-abc-border bg-abc-raised transition-colors duration-200 ease-abc focus-within:border-abc-gold-border">
          <span className="shrink-0 py-3 pl-3 text-[13px] text-abc-muted" aria-hidden="true">
            {base}
          </span>
          <input
            id="card-slug"
            value={form.card_slug}
            onChange={(e) => patch({ card_slug: e.target.value.toLowerCase() })}
            placeholder="your-name"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            className="h-[48px] w-full min-w-0 rounded-inner bg-transparent pl-0.5 pr-3 text-[16px] text-abc-text outline-none placeholder:text-abc-muted"
          />
        </div>

        <div aria-live="polite" className="mt-1.5 min-h-[18px]">
          {slugStatus === 'checking' ? (
            <p className="inline-flex items-center gap-1.5 text-[12px] text-abc-muted">
              <IconLoader2 size={13} stroke={2} className="animate-spin" />
              Checking…
            </p>
          ) : null}
          {slugStatus === 'ok' ? (
            <p
              className="inline-flex items-center gap-1.5 text-[12px]"
              style={{ color: 'var(--abc-green)' }}
            >
              <IconCheck size={13} stroke={2.2} />
              Available
            </p>
          ) : null}
          {slugStatus === 'bad' ? (
            <p
              className="inline-flex items-start gap-1.5 text-[12px] leading-[1.45]"
              style={{ color: 'var(--abc-overdue)' }}
            >
              <IconX size={13} stroke={2.2} className="mt-px shrink-0" />
              <span>{slugMessage || 'Unavailable'}</span>
            </p>
          ) : null}
          {slugStatus === 'idle' ? (
            <p className="text-[12px] text-abc-muted">
              Letters, numbers and dashes. This is the address on your QR code.
            </p>
          ) : null}
        </div>
      </div>

      <div className="flex items-start justify-between gap-4 rounded-inner border border-abc-border bg-abc-raised p-3.5">
        <div className="min-w-0">
          <p className="text-[14px] font-semibold text-abc-text">Publish card</p>
          <p className="mt-1 text-[12.5px] leading-[1.45] text-abc-muted">
            {form.card_published
              ? 'Anyone with your link or QR can open your card.'
              : 'Your card stays private until you publish it.'}
          </p>
        </div>
        <Toggle
          label="Publish card"
          checked={form.card_published}
          onChange={(card_published) => patch({ card_published })}
          onLabel="Live"
          offLabel="Draft"
        />
      </div>
    </div>
  )
}
