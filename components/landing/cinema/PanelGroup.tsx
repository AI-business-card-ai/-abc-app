'use client'

import { useState, type CSSProperties, type ReactNode } from 'react'

/**
 * Expanding panels: one concept leads, the rest stay readable beside it.
 *
 * On wide screens the active panel takes 1.32fr of the row and the others
 * 0.84fr, over 700ms. Hover (mouse only), click, tap and keyboard focus all
 * move it — nothing depends on hover. Below 1080px the row becomes a vertical
 * story and the active state is only a lighting cue: no content is ever
 * hidden, clipped or moved behind an interaction.
 *
 * Each panel's title is a real button inside its heading, stretched over the
 * panel, so the whole panel is one target and the tab order is simply the
 * panels in reading order.
 */

export type Panel = {
  key: string
  title: string
  /** Decorative lead — number or icon. Hidden from assistive technology. */
  lead?: ReactNode
  body: ReactNode
}

export const PANEL_ACTIVE_FR = 1.32
export const PANEL_INACTIVE_FR = 0.84

export default function PanelGroup({
  panels,
  className = '',
  label,
  ordered = false,
  initial = 0,
}: {
  panels: Panel[]
  className?: string
  label: string
  ordered?: boolean
  initial?: number
}) {
  const [active, setActive] = useState(initial)
  const List = ordered ? 'ol' : 'ul'

  const columns = panels
    .map((_, i) => `minmax(0, ${i === active ? PANEL_ACTIVE_FR : PANEL_INACTIVE_FR}fr)`)
    .join(' ')

  return (
    <List
      className={`cine-panels${className ? ` ${className}` : ''}`}
      style={{ '--cine-cols': columns } as CSSProperties}
      aria-label={label}
    >
      {panels.map((panel, i) => (
        <li
          key={panel.key}
          className="cine-panel cine-item"
          data-active={i === active ? 'true' : undefined}
          style={{ '--cine-d': `${i * 70}ms` } as CSSProperties}
          onPointerEnter={(event) => {
            if (event.pointerType === 'mouse') setActive(i)
          }}
        >
          {panel.lead ? (
            <span className="cine-panel-lead" aria-hidden="true">
              {panel.lead}
            </span>
          ) : null}
          <h3 className="cine-panel-title">
            <button
              type="button"
              className="cine-panel-trigger"
              aria-pressed={i === active}
              onClick={() => setActive(i)}
              onFocus={() => setActive(i)}
            >
              {panel.title}
            </button>
          </h3>
          <div className="cine-panel-body">{panel.body}</div>
        </li>
      ))}
    </List>
  )
}
