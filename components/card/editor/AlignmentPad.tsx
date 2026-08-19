'use client'

/**
 * Nine alignments in the space one control should take.
 *
 * This replaced nine full-width buttons stacked three to a row, which on a
 * phone pushed every actual setting below the fold and made a shortcut look
 * like the main event. Dragging the layer on the card is the primary way to
 * place it; this is the "put it in the corner, exactly" shortcut, and it
 * should read as one small pad rather than nine cards.
 *
 * Each cell is a real 44px target, because a compact control that cannot be
 * tapped is not compact, it is broken. That fixes the pad at 148px square,
 * which is still a single glanceable control rather than nine cards.
 */

const CELLS = [
  { label: 'Top left', col: 0, row: 0 },
  { label: 'Top center', col: 1, row: 0 },
  { label: 'Top right', col: 2, row: 0 },
  { label: 'Center left', col: 0, row: 1 },
  { label: 'Center', col: 1, row: 1 },
  { label: 'Center right', col: 2, row: 1 },
  { label: 'Bottom left', col: 0, row: 2 },
  { label: 'Bottom center', col: 1, row: 2 },
  { label: 'Bottom right', col: 2, row: 2 },
] as const

export default function AlignmentPad({
  x,
  y,
  onChange,
  /**
   * Edge value for the outer cells. A cropped background aligns to its true
   * edges; a subject that floats keeps a margin, so "top left" still leaves it
   * on the card rather than half off it.
   */
  inset = 0,
  label = 'Position',
}: {
  x: number
  y: number
  onChange: (x: number, y: number) => void
  inset?: number
  label?: string
}) {
  const axis = [inset, 50, 100 - inset]

  return (
    <div className="mt-3">
      <p className="text-[12px] text-abc-muted">{label}</p>
      <div
        role="group"
        aria-label={`${label} presets`}
        className="mt-1.5 grid w-[148px] grid-cols-3 gap-[2px] rounded-inner border border-abc-border bg-abc-card p-[2px]"
      >
        {CELLS.map((cell) => {
          const cx = axis[cell.col]
          const cy = axis[cell.row]
          const active = Math.round(x) === cx && Math.round(y) === cy
          return (
            <button
              key={cell.label}
              type="button"
              aria-label={cell.label}
              aria-pressed={active}
              onClick={() => onChange(cx, cy)}
              className="flex h-[44px] w-[44px] items-center justify-center rounded-[6px] transition-colors duration-150 ease-abc abc-focus-ring"
              style={{ background: active ? 'var(--abc-gold-soft)' : 'transparent' }}
            >
              <span
                className="block rounded-full transition-all duration-150"
                style={{
                  width: active ? 9 : 5,
                  height: active ? 9 : 5,
                  background: active ? 'var(--abc-gold-accent)' : 'var(--abc-text-muted)',
                }}
              />
            </button>
          )
        })}
      </div>
    </div>
  )
}
