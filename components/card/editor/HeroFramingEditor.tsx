'use client'

import { useCallback, useRef, useState } from 'react'
import { IconArrowBackUp } from '@tabler/icons-react'
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
import { getCardThemeTokens, heroScrimGradient } from '@/lib/card/theme'

/**
 * Visual framing for one hero image.
 *
 * The preview is the real crop: the same frame ratio and the same
 * transformStyle the public card renders with, so what the owner lines up here
 * is what a visitor sees. Nothing is written back to the uploaded file — only
 * scale and position are stored, so the framing can be changed again later.
 *
 * Dragging pans, the slider zooms. Both map to the same two numbers, so the
 * pointer and the slider can never disagree.
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
      // A drag moves the visible window, so the object-position moves opposite
      // to the pointer. Dividing by the frame size keeps the feel consistent
      // at any preview width.
      const nextX = Math.min(100, Math.max(0, transform.x - (dx / rect.width) * 100))
      const nextY = Math.min(100, Math.max(0, transform.y - (dy / rect.height) * 100))
      onChange({ ...transform, x: Math.round(nextX), y: Math.round(nextY) })
    },
    [onChange, transform]
  )

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    const frame = frameRef.current
    if (!frame) return
    frame.setPointerCapture(e.pointerId)
    setDragging(true)

    let lastX = e.clientX
    let lastY = e.clientY

    function move(ev: PointerEvent) {
      const rect = frame!.getBoundingClientRect()
      applyDrag(ev.clientX - lastX, ev.clientY - lastY, rect)
      lastX = ev.clientX
      lastY = ev.clientY
    }

    function up(ev: PointerEvent) {
      setDragging(false)
      frame!.releasePointerCapture(ev.pointerId)
      frame!.removeEventListener('pointermove', move)
      frame!.removeEventListener('pointerup', up)
      frame!.removeEventListener('pointercancel', up)
    }

    frame.addEventListener('pointermove', move)
    frame.addEventListener('pointerup', up)
    frame.addEventListener('pointercancel', up)
  }

  const overlay = 'overlay' in transform ? (transform as unknown as BackgroundTransform).overlay : null

  return (
    <div className="rounded-inner border border-abc-border bg-abc-raised p-3.5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[13.5px] font-semibold text-abc-text">{label}</p>
        <button
          type="button"
          onClick={onReset}
          className="inline-flex h-[36px] items-center gap-1.5 rounded-btn px-2.5 text-[12.5px] font-medium text-abc-secondary transition-colors hover:text-abc-text abc-focus-ring"
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
