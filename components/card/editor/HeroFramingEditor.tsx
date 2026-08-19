'use client'

import { useCallback, useRef, useState } from 'react'
import { IconArrowBackUp } from '@tabler/icons-react'
import { getCardThemeTokens, heroScrimGradient } from '@/lib/card/theme'
import {
  HERO_ASPECT_RATIO,
  HERO_ASPECT_RATIO_PERSON,
  SCALE_LIMITS,
  transformStyle,
  type BackgroundTransform,
  type CardTheme,
  type MediaTransform,
  type ScaleLimits,
} from '@/lib/card/types'

const MEDIA_TRANSFORM_LIMITS_DEFAULT: ScaleLimits = SCALE_LIMITS.backgroundFill

/**
 * Visual framing for the Classic circular portrait.
 *
 * The preview is the real crop: the same shape and the same transformStyle the
 * public card renders with, so what the owner lines up here is what a visitor
 * sees. Nothing is written back to the uploaded file — only scale and position
 * are stored, so the framing can be changed again later.
 *
 * Hero no longer comes through here. Its layers are placed by dragging them on
 * the card itself, which is what HeroCanvas is for; this is the one crop that
 * genuinely needs its own round window to line a face up inside.
 */
export default function HeroFramingEditor<T extends MediaTransform>({
  label,
  imageUrl,
  transform,
  onChange,
  onReset,
  shape = 'wide',
  theme = 'graphite',
  limits = MEDIA_TRANSFORM_LIMITS_DEFAULT,
  contain = false,
  children,
}: {
  label: string
  imageUrl: string
  transform: T
  onChange: (next: T) => void
  onReset: () => void
  shape?: 'wide' | 'circle' | 'hero'
  /** The card's own theme, so the preview darkens against the real backdrop. */
  theme?: CardTheme
  /**
   * Zoom range for this particular image. A frame that must stay covered
   * cannot go below 1; one that may show the card behind it can.
   */
  limits?: ScaleLimits
  /** Show the whole image rather than filling the frame — "fit" and cutouts. */
  contain?: boolean
  children?: React.ReactNode
}) {
  const frameRef = useRef<HTMLDivElement>(null)
  const [dragging, setDragging] = useState(false)

  const applyDrag = useCallback(
    (dx: number, dy: number, rect: DOMRect) => {
      // A crop pans: the window moves, so the image travels opposite the
      // pointer. Dividing by the frame keeps the feel the same at any size.
      const nextX = Math.min(100, Math.max(0, transform.x - (dx / rect.width) * 100))
      const nextY = Math.min(100, Math.max(0, transform.y - (dy / rect.height) * 100))
      onChange({ ...transform, x: Math.round(nextX), y: Math.round(nextY) })
    },
    [onChange, transform]
  )

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    const frame = frameRef.current
    if (!frame) return

    /*
      Capture is an optimisation, not a precondition.

      setPointerCapture throws NotFoundError if the pointer is no longer
      active — a gesture the browser already cancelled, a touch that ended
      between the event and this handler. It used to be the first statement
      here, so that throw took the whole handler with it and the listeners
      below were never attached: the owner pressed the image and dragging
      simply did nothing, with no error they could see.

      Now the drag is wired up either way, and the target is chosen to match:
      with capture the element keeps receiving moves past its own edges; if
      capture was refused, window does the same job.
    */
    let captured = false
    try {
      frame.setPointerCapture(e.pointerId)
      captured = true
    } catch {
      // Dragging still works; it is merely not pinned to this element.
    }

    const target: EventTarget = captured ? frame : window
    setDragging(true)

    let lastX = e.clientX
    let lastY = e.clientY

    function move(ev: Event) {
      const pe = ev as PointerEvent
      const rect = frame!.getBoundingClientRect()
      applyDrag(pe.clientX - lastX, pe.clientY - lastY, rect)
      lastX = pe.clientX
      lastY = pe.clientY
    }

    function up(ev: Event) {
      const pe = ev as PointerEvent
      setDragging(false)
      if (captured) {
        try {
          frame!.releasePointerCapture(pe.pointerId)
        } catch {
          // Already released — the pointer is gone either way.
        }
      }
      target.removeEventListener('pointermove', move)
      target.removeEventListener('pointerup', up)
      target.removeEventListener('pointercancel', up)
    }

    target.addEventListener('pointermove', move)
    target.addEventListener('pointerup', up)
    target.addEventListener('pointercancel', up)
  }

  const overlay = 'overlay' in transform ? (transform as unknown as BackgroundTransform).overlay : null

  return (
    <div className="rounded-inner border border-abc-border bg-abc-raised p-3.5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[13.5px] font-semibold text-abc-text">{label}</p>
        <button
          type="button"
          onClick={onReset}
          className="inline-flex h-[44px] items-center gap-1.5 rounded-btn px-3 text-[12.5px] font-medium text-abc-secondary transition-colors hover:text-abc-text abc-focus-ring"
        >
          <IconArrowBackUp size={15} stroke={1.8} />
          Reset
        </button>
      </div>

      {/* Live crop preview — same geometry as the public card */}
      <div
        ref={frameRef}
        onPointerDown={handlePointerDown}
        role="application"
        aria-label={`${label}: drag to reposition`}
        className="relative mt-3 select-none overflow-hidden border border-abc-border bg-abc-card"
        style={{
          // The preview carries the real frame's ratio rather than a
          // convenient box height, so what is cropped away here is what is
          // cropped away on the card.
          height: shape === 'circle' ? 168 : undefined,
          aspectRatio:
            shape === 'circle'
              ? undefined
              : String(shape === 'hero' ? HERO_ASPECT_RATIO_PERSON : HERO_ASPECT_RATIO),
          width: shape === 'circle' ? 168 : '100%',
          borderRadius: shape === 'circle' ? '50%' : 14,
          margin: shape === 'circle' ? '12px auto 0' : undefined,
          cursor: dragging ? 'grabbing' : 'grab',
          touchAction: 'none',
        }}
      >
        {/*
          The scrim sits under the image for a hero cutout and over it for a
          background, which is the same order the card itself paints in — an
          owner darkening the artwork must not watch their own face dim.
        */}
        {overlay === null && shape === 'hero' ? (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{ background: heroScrimGradient(55, getCardThemeTokens(theme)) }}
          />
        ) : null}

        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imageUrl}
          alt=""
          draggable={false}
          style={
            contain
              ? {
                  position: 'relative',
                  width: '100%',
                  height: '100%',
                  objectFit: 'contain',
                  objectPosition: `${transform.x}% ${transform.y}%`,
                  transform: `scale(${transform.scale})`,
                  transformOrigin: shape === 'hero' ? 'center bottom' : 'center',
                }
              : transformStyle(transform)
          }
        />

        {overlay !== null ? (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{ background: heroScrimGradient(overlay, getCardThemeTokens(theme)) }}
          />
        ) : null}
      </div>

      <p className="mt-2 text-center text-[11.5px] text-abc-muted">Drag the image to reposition</p>

      <Slider
        label="Zoom"
        value={transform.scale}
        min={limits.min}
        max={limits.max}
        step={0.05}
        format={(v) => `${v.toFixed(2)}×`}
        onChange={(scale) => onChange({ ...transform, scale })}
      />

      {overlay !== null ? (
        <Slider
          label="Darken"
          value={overlay}
          min={0}
          max={100}
          step={5}
          format={(v) => `${Math.round(v)}%`}
          onChange={(next) =>
            onChange({ ...(transform as unknown as BackgroundTransform), overlay: next } as unknown as T)
          }
        />
      ) : null}

      {children}
    </div>
  )
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  format,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  format: (value: number) => string
  onChange: (value: number) => void
}) {
  return (
    <label className="mt-3 block">
      <span className="flex items-baseline justify-between">
        <span className="text-[12px] text-abc-muted">{label}</span>
        <span className="text-[11.5px] tabular-nums text-abc-secondary">{format(value)}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1.5 h-[36px] w-full accent-[color:var(--abc-gold-accent)]"
      />
    </label>
  )
}
