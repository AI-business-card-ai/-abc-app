'use client'

import { IconCheck } from '@tabler/icons-react'
import { CARD_ACCENTS, type CardTheme } from '@/lib/card/types'
import type { EditorForm } from '@/lib/card/editor-form'

const THEMES: { id: CardTheme; label: string; description: string; swatch: string }[] = [
  { id: 'graphite', label: 'Graphite', description: 'Dark card', swatch: '#0a0a0b' },
  { id: 'light', label: 'Light', description: 'Light card', swatch: '#ffffff' },
]

/**
 * Appearance applies to the user's public card only — the ABC app itself
 * stays dark and gold regardless of what is chosen here.
 */
export default function AppearanceSection({
  form,
  patch,
}: {
  form: EditorForm
  patch: (patch: Partial<EditorForm>) => void
}) {
  return (
    <div className="flex flex-col gap-6">
      <fieldset>
        <legend className="text-[12.5px] font-medium text-abc-secondary">Accent</legend>
        <div className="mt-2.5 flex flex-wrap gap-2.5">
          {CARD_ACCENTS.map((accent) => {
            const active = form.card_accent.toLowerCase() === accent.value.toLowerCase()
            return (
              <button
                key={accent.key}
                type="button"
                onClick={() => patch({ card_accent: accent.value })}
                aria-pressed={active}
                className="flex min-h-[44px] items-center gap-2 rounded-full border px-3.5 py-2 text-[13px] font-medium transition-colors duration-200 ease-abc abc-focus-ring"
                style={{
                  background: active ? 'var(--abc-raised)' : 'transparent',
                  borderColor: active ? accent.value : 'var(--abc-border)',
                  color: active ? 'var(--abc-text)' : 'var(--abc-text-secondary)',
                }}
              >
                <span
                  className="h-4 w-4 shrink-0 rounded-full"
                  style={{ background: accent.value }}
                  aria-hidden="true"
                />
                {accent.label}
                {active ? <IconCheck size={14} stroke={2.2} aria-hidden="true" /> : null}
              </button>
            )
          })}
        </div>
      </fieldset>

      <fieldset>
        <legend className="text-[12.5px] font-medium text-abc-secondary">Card theme</legend>
        <div className="mt-2.5 grid grid-cols-2 gap-2.5">
          {THEMES.map((theme) => {
            const active = form.card_theme === theme.id
            return (
              <button
                key={theme.id}
                type="button"
                onClick={() => patch({ card_theme: theme.id })}
                aria-pressed={active}
                className="flex items-center gap-3 rounded-inner border p-3 text-left transition-colors duration-200 ease-abc abc-focus-ring"
                style={{
                  background: 'var(--abc-raised)',
                  borderColor: active ? 'var(--abc-gold-border)' : 'var(--abc-border)',
                }}
              >
                <span
                  className="h-9 w-9 shrink-0 rounded-full border border-abc-border"
                  style={{ background: theme.swatch }}
                  aria-hidden="true"
                />
                <span className="min-w-0">
                  <span
                    className="block text-[13.5px] font-semibold"
                    style={{ color: active ? 'var(--abc-gold-accent)' : 'var(--abc-text)' }}
                  >
                    {theme.label}
                  </span>
                  <span className="block text-[11.5px] text-abc-muted">{theme.description}</span>
                </span>
              </button>
            )
          })}
        </div>
      </fieldset>

      <p className="text-[12px] leading-[1.5] text-abc-muted">
        This changes how your public card looks to visitors. The ABC app stays dark.
      </p>
    </div>
  )
}
