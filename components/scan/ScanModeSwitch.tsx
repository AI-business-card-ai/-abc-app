'use client'

import { IconLayoutGrid, IconScan } from '@tabler/icons-react'
import { MAX_BATCH_CARDS } from '@/lib/scan/batch'

export type ScanFlow = 'single' | 'multi'

/**
 * Which of the two scanning flows the owner is in.
 *
 * A switch above the viewfinder rather than another chip in the capture-mode
 * row, because the capture modes are hints about what you are pointing at —
 * they all end in the same review of one person. This changes the shape of the
 * whole session: one contact or up to ten with one shared meeting. Putting it
 * beside "Badge" and "Document" would file a different kind of decision under
 * the same heading.
 */
export default function ScanModeSwitch({
  flow,
  onChange,
  disabled = false,
}: {
  flow: ScanFlow
  onChange: (flow: ScanFlow) => void
  disabled?: boolean
}) {
  const options: { id: ScanFlow; label: string; hint: string; Icon: typeof IconScan }[] = [
    { id: 'single', label: 'Single card', hint: 'One contact at a time', Icon: IconScan },
    {
      id: 'multi',
      label: 'Multi-Card',
      hint: `Up to ${MAX_BATCH_CARDS} at once`,
      Icon: IconLayoutGrid,
    },
  ]

  return (
    <div className="grid grid-cols-2 gap-2" role="tablist" aria-label="Scanning mode">
      {options.map((option) => {
        const active = flow === option.id
        return (
          <button
            key={option.id}
            type="button"
            role="tab"
            aria-selected={active}
            disabled={disabled}
            onClick={() => onChange(option.id)}
            className={`flex flex-col items-start gap-0.5 rounded-card border px-3.5 py-3 text-left transition-colors duration-200 ease-abc abc-focus-ring disabled:opacity-60 ${
              active
                ? 'border-abc-gold-accent bg-abc-raised'
                : 'border-abc-border bg-abc-card hover:border-abc-border-strong'
            }`}
          >
            <span className="flex items-center gap-2">
              <option.Icon
                size={17}
                stroke={1.8}
                style={{ color: active ? 'var(--abc-gold-accent)' : 'var(--abc-text-muted)' }}
              />
              <span
                className={`text-[13.5px] font-semibold ${
                  active ? 'text-abc-text' : 'text-abc-secondary'
                }`}
              >
                {option.label}
              </span>
            </span>
            <span className="text-[12px] text-abc-muted">{option.hint}</span>
          </button>
        )
      })}
    </div>
  )
}
