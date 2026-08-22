'use client'

import { useCallback, useRef, useState } from 'react'
import { IconArrowBackUp } from '@tabler/icons-react'
import { GRAPHIC_BASE_WIDTH, LOGO_BASE_HEIGHT_ANCHOR } from '@/components/card/CardHero'
import { moveLayer, type HeroLayerId } from '@/lib/card/hero-gestures'
import {
  backgroundStyle,
  heroAspectRatio,
  type CardMediaTransforms,
  type ScaleLimits,
} from '@/lib/card/types'

/**
 * One layer's own controls, built around the layer itself.
 *
 * What stood here was a pad of nine dots. It was compact and it was honest
 * about what it did, but it asked the owner to think in abstractions —
 * "top-left" — while what they wanted was to look at their photograph and put
 * it where it goes. Nine dots cannot show you a face.
 *
 * So the control is the asset. The real image, on the real card's proportions,
 * dragged directly, with the numbers a finger is bad at kept as sliders
 * underneath. The presets survive as a small row of secondary shortcuts,
 * because "exactly centred" is still a thing worth being able to ask for and a
 * finger is bad at that too.
 */

const PRESETS = [
  { label: 'Left', x: 20, y: 50 },
  { label: 'Centre', x: 50, y: 50 },
  { label: 'Right', x: 80, y: 50 },
  { label: 'Top', x: 50, y: 20 },
  { label: 'Bottom', x: 50, y: 80 },
] as const

export default function LayerEditor({
  layer,
  label,
  imageUrl,
  transforms,
  scaleLimits,
  scaleValue,
  opacity,
  visible,
  aspect,
  onChange,
  onScale,
  onOpacity,
  onToggleVisible,
  onReset,
  children,
}: {
  layer: HeroLayerId
  label: string
  /** The actual asset, shown at the size and place it occupies on the card. */
  imageUrl: string
  transforms: CardMediaTransforms
  scaleLimits: ScaleLimits
  scaleValue: number
  /** Omitted for layers that have no opacity of their own. */
  opacity?: number
  visible?: boolean
  /** How the mini stage is shaped — the hero's own ratio. */
  aspect?: number
  onChange: (next: CardMediaTransforms) => void
  onScale: (scale: number) => void
  onOpacity?: (opacity: number) => void
  onToggleVisible?: () => void
  onReset: () => void
  children?: React.ReactNode
}) {
  const stageRef = useRef<HTMLDivElement>(null)
  const assetRef = useRef<HTMLImageElement>(null)
  const [dragging, setDragging] = useState(false)

  // Live, so a pointermove closure never computes from a stale transform.
  const stateRef = useRef(transforms)
  stateRef.current = transforms

  const isBackground = layer === 'background'
  const position =
    layer === 'person'
      ? transforms.portrait
      : layer === 'logo'
        ? transforms.logo
        : isBackground
          ? transforms.background
          : transforms.graphics[layer === 'graphic-0' ? 0 : 1]

  /*
    What each layer hands the mover.

    A background gives its source's natural size, because how far it can travel
    depends on how `object-fit` sized that source against this stage — which
    the rendered element cannot tell anyone, since it fills the stage whatever
    the picture inside it is doing. Every other layer is its own artwork, so
    its measured box is the honest answer.
  */
  const measure = useCallback(() => {
    const el = assetRef.current
    if (!el) return { rendered: null, natural: null }
    const r = el.getBoundingClientRect()
    return {
      rendered: { width: r.width, height: r.height },
      natural: el.naturalWidth ? { width: el.naturalWidth, height: el.naturalHeight } : null,
    }
  }, [])

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const stage = stageRef.current
      if (!stage) return

      let captured = false
      try {
        stage.setPointerCapture(e.pointerId)
        captured = true
      } catch {
        // Capture is a convenience; window listeners do the work regardless.
      }
      const target: EventTarget = captured ? stage : window
      setDragging(true)

      let lastX = e.clientX
      let lastY = e.clientY

      const move = (ev: Event) => {
        const pe = ev as PointerEvent
        const fr = stage.getBoundingClientRect()
        const { rendered, natural } = measure()
        onChange(
          moveLayer(
            stateRef.current,
            layer,
            pe.clientX - lastX,
            pe.clientY - lastY,
            { width: fr.width, height: fr.height },
            rendered,
            natural
          )
        )
        lastX = pe.clientX
        lastY = pe.clientY
      }

      const up = (ev: Event) => {
        setDragging(false)
        if (captured) {
          try {
            stage.releasePointerCapture((ev as PointerEvent).pointerId)
          } catch {
            // Already gone.
          }
        }
        target.removeEventListener('pointermove', move)
        target.removeEventListener('pointerup', up)
        target.removeEventListener('pointercancel', up)
      }

      target.addEventListener('pointermove', move)
      target.addEventListener('pointerup', up)
      target.addEventListener('pointercancel', up)
    },
    [layer, measure, onChange]
  )

  const applyPreset = (x: number, y: number) => {
    const stage = stageRef.current
    if (!stage) return

    /*
      A background's x/y are already the position the preset is asking for, so
      it is written straight in. The other layers keep going through the drag
      arithmetic, which is also what marks them anchored.

      This used to convert every preset into a pixel delta against the frame
      and hand it to the mover. That only worked while a background's percent
      meant a fixed number of frame pixels; it now means a share of the
      artwork's own travel, so the round trip through pixels would land the
      preset somewhere else entirely. Asking for the centre and writing the
      centre is both simpler and exact.
    */
    if (isBackground) {
      onChange({ ...stateRef.current, background: { ...stateRef.current.background, x, y } })
      return
    }

    const fr = stage.getBoundingClientRect()
    const dx = ((x - position.x) / 100) * fr.width
    const dy = ((y - position.y) / 100) * fr.height
    const er = assetRef.current?.getBoundingClientRect() ?? null
    onChange(
      moveLayer(stateRef.current, layer, dx, dy, { width: fr.width, height: fr.height },
        er ? { width: er.width, height: er.height } : null)
    )
  }

  return (
    <div className="rounded-inner border border-abc-border bg-abc-raised p-3.5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[13.5px] font-semibold text-abc-text">{label}</p>
        <div className="flex items-center gap-1.5">
          {onToggleVisible ? (
            <button
              type="button"
              onClick={onToggleVisible}
              aria-pressed={visible}
              className="inline-flex h-[36px] abc-tap items-center rounded-btn border border-abc-border px-2.5 text-[12px] text-abc-secondary abc-focus-ring"
            >
              {visible ? 'Shown' : 'Hidden'}
            </button>
          ) : null}
          <button
            type="button"
            onClick={onReset}
            className="inline-flex h-[36px] abc-tap items-center gap-1.5 rounded-btn px-2.5 text-[12.5px] font-medium text-abc-secondary transition-colors hover:text-abc-text abc-focus-ring"
          >
            <IconArrowBackUp size={15} stroke={1.8} />
            Reset
          </button>
        </div>
      </div>

      {/*
        The asset, on the card's own proportions, at the place and size it
        actually occupies. Dragging here and dragging on the card above are the
        same gesture through the same arithmetic — this is the close-up.
      */}
      <div
        ref={stageRef}
        onPointerDown={handlePointerDown}
        role="application"
        aria-label={`${label}: drag to move`}
        className="relative mt-3 select-none overflow-hidden rounded-[12px] border border-abc-border"
        style={{
          aspectRatio: String(aspect ?? heroAspectRatio(transforms.portrait)),
          width: '100%',
          background:
            'repeating-conic-gradient(var(--abc-card) 0% 25%, var(--abc-raised) 0% 50%) 50% / 18px 18px',
          cursor: dragging ? 'grabbing' : 'grab',
          touchAction: 'none',
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          ref={assetRef}
          src={imageUrl}
          alt=""
          draggable={false}
          style={
            isBackground
              ? {
                  /*
                    The card's own geometry, from the card's own helper. This
                    used to hardcode `cover`, so an owner who chose Fit — and
                    now Stretch — composed against a preview that was showing
                    them a different picture from the one they were making.
                  */
                  ...backgroundStyle(transforms.background),
                  opacity: transforms.background.opacity,
                }
              : {
                  /*
                    Each layer sized the way the card sizes it, from the card's
                    own base constants.

                    This used to draw the logo and both graphics as `26% ×
                    scale` of the stage width — one rule for three layers that
                    the card measures three different ways. A logo is a share of
                    the hero's *height*, so the panel was showing a size the
                    card would never produce; and because the width was layout
                    rather than transform, the panel hit the same `max-width`
                    ceiling the card did and went quiet past about 3.85×.

                    Scale is now a transform here too, so the close-up and the
                    composition agree at every value in the range.
                  */
                  position: 'absolute',
                  left: `${position.x}%`,
                  top: `${position.y}%`,
                  ...(layer === 'person'
                    ? {
                        height: '100%',
                        width: 'auto',
                        maxWidth: '100%',
                        transform: `translate(-50%, -50%) scale(${scaleValue})`,
                      }
                    : layer === 'logo'
                      ? {
                          height: `${LOGO_BASE_HEIGHT_ANCHOR}%`,
                          width: 'auto',
                          maxWidth: '60%',
                          transform: `translate(-50%, -50%) scale(${scaleValue})`,
                        }
                      : {
                          width: `${GRAPHIC_BASE_WIDTH}%`,
                          height: 'auto',
                          transformOrigin: `${position.x}% ${position.y}%`,
                          transform: `translate(-${position.x}%, -${position.y}%) scale(${scaleValue})`,
                        }),
                  objectFit: 'contain',
                  opacity: opacity ?? 1,
                }
          }
        />
      </div>

      <p className="mt-2 text-center text-[11.5px] text-abc-muted">
        Drag here or on the card above
      </p>

      {/* Secondary: the placements a finger is clumsy at asking for exactly. */}
      <div className="mt-2.5 flex flex-wrap gap-1.5" role="group" aria-label={`${label} presets`}>
        {PRESETS.map((p) => (
          <button
            key={p.label}
            type="button"
            onClick={() => applyPreset(p.x, p.y)}
            className="min-h-[36px] abc-tap flex-1 rounded-btn border border-abc-border bg-abc-card px-2 text-[12px] text-abc-secondary transition-colors hover:text-abc-text abc-focus-ring"
          >
            {p.label}
          </button>
        ))}
      </div>

      <Slider
        label="Size"
        value={scaleValue}
        min={scaleLimits.min}
        max={scaleLimits.max}
        step={0.01}
        format={(v) => `${v.toFixed(2)}×`}
        onChange={onScale}
      />

      {onOpacity ? (
        <Slider
          label="Opacity"
          value={opacity ?? 1}
          min={0}
          max={1}
          step={0.01}
          format={(v) => `${Math.round(v * 100)}%`}
          onChange={onOpacity}
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
        className="mt-1.5 h-[44px] w-full accent-[color:var(--abc-gold-accent)]"
        aria-label={label}
      />
    </label>
  )
}
