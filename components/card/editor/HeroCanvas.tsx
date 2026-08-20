'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import CardHero from '@/components/card/CardHero'
import { moveLayer, scaleLayer, type HeroLayerId } from '@/lib/card/hero-gestures'
import {
  GRAPHIC_SCALE_LIMITS,
  LOGO_SCALE_LIMITS,
  hasHeroSubject,
  heroAspectRatio,
  portraitScaleLimits,
  type CardMediaTransforms,
  type DigitalCardData,
  type ScaleLimits,
} from '@/lib/card/types'

/**
 * The card itself, as the thing you edit.
 *
 * Every layer used to be positioned through its own black preview box further
 * down the page — a crop window for the person, another for the logo, another
 * for the background. Three copies of the card, none of them the card, each
 * needing the owner to translate "move him slightly left" into a control they
 * were looking at instead of the composition they were making.
 *
 * So the real hero becomes the canvas. Pick a layer, put a finger on it, move
 * it. The panels below keep only what a finger is bad at: exact numbers,
 * alignment shortcuts, and the things that are not positions at all.
 *
 * The composition is still CardHero's. This adds a transparent surface over
 * the hero frame, reads gestures, and writes the same canonical transforms the
 * panels write. It renders no card of its own.
 */

export type { HeroLayerId }

/** Only the hero frame is editable; identity and actions are never targets. */
export default function HeroCanvas({
  card,
  transforms,
  selected,
  onSelect,
  onChange,
}: {
  card: DigitalCardData
  transforms: CardMediaTransforms
  selected: HeroLayerId
  onSelect: (layer: HeroLayerId) => void
  onChange: (next: CardMediaTransforms) => void
}) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const [dragging, setDragging] = useState(false)
  const [box, setBox] = useState<{ left: number; top: number; width: number; height: number } | null>(
    null
  )

  /*
    Live values for the gesture handlers.

    A pointermove closure created on pointerdown would otherwise keep the
    transforms it was born with, and every move would compute its delta from
    the same stale starting point — the layer would snap back to where the
    gesture started on every frame.
  */
  const stateRef = useRef({ transforms, selected })
  stateRef.current = { transforms, selected }

  const frameEl = useCallback(
    () => wrapRef.current?.querySelector('[data-hero-frame]') as HTMLElement | null,
    []
  )

  /*
    A legacy person is converted to the anchor model exactly once, from the
    geometry actually on screen.

    The two models are different readings of the same two numbers, so there is
    no arithmetic that converts one to the other without knowing how large the
    subject renders — which the browser knows and the database does not. So the
    conversion happens here, in the editor, where the image is laid out: the
    subject's rendered centre becomes the anchor point, which by construction
    puts them exactly where they already are. Nothing moves; the numbers simply
    start meaning what the composer needs them to mean.

    It waits for the image to actually have dimensions. Measuring a picture
    that has not loaded would anchor the person to a box of zero size, and the
    one thing this must never do is move somebody's portrait.
  */
  useEffect(() => {
    if (transforms.logo.positionModel !== 'legacy') return
    if (!card.logoUrl || !transforms.logo.visible) return

    let cancelled = false
    const convertLogo = () => {
      if (cancelled) return true
      const frame = frameEl()
      const el = frame?.querySelector('[data-hero-layer="logo"]') as HTMLImageElement | null
      if (!frame || !el || !el.complete || !el.naturalWidth) return false

      const fr = frame.getBoundingClientRect()
      const er = el.getBoundingClientRect()
      if (!fr.width || !fr.height || !er.width || !er.height) return false

      /*
        The logo's rect is the logo, so its centre can simply be measured —
        unlike the person, whose image is stretched across the whole frame.
        Recording that centre as the anchor leaves it exactly where it is and
        decouples its position from its size.
      */
      const clamp = (v: number) => Math.min(100, Math.max(0, Math.round(v)))
      onChange({
        ...stateRef.current.transforms,
        logo: {
          ...stateRef.current.transforms.logo,
          x: clamp(((er.left + er.width / 2 - fr.left) / fr.width) * 100),
          y: clamp(((er.top + er.height / 2 - fr.top) / fr.height) * 100),
          positionModel: 'anchor',
        },
      })
      return true
    }

    if (convertLogo()) return
    const logoId = window.setInterval(() => {
      if (convertLogo()) window.clearInterval(logoId)
    }, 120)
    return () => {
      cancelled = true
      window.clearInterval(logoId)
    }
  }, [card.logoUrl, frameEl, onChange, transforms.logo])

  useEffect(() => {
    if (transforms.portrait.positionModel !== 'legacy') return
    if (!hasHeroSubject(transforms.portrait)) return

    let cancelled = false
    const convert = () => {
      if (cancelled) return true
      const frame = frameEl()
      const el = frame?.querySelector('[data-hero-layer="person"]') as HTMLImageElement | null
      if (!frame || !el || !el.complete || !el.naturalWidth) return false

      const fr = frame.getBoundingClientRect()
      if (!fr.width || !fr.height) return false

      /*
        The picture, not the element that holds it.

        A legacy person is an <img> stretched over the whole frame with
        object-fit: contain, so its bounding rect is the frame — measuring that
        would anchor the subject to the middle of the card no matter where they
        actually stood. The visible picture sits somewhere inside that box, and
        where exactly is what object-fit and object-position decide, so it is
        reconstructed here from the same rules the browser painted with:
        contain the natural aspect, offset it through the leftover space, then
        apply the scale about the frame's bottom centre.

        The centre of that reconstructed picture is the anchor point, which by
        construction leaves the subject exactly where they already are.
      */
      const p = stateRef.current.transforms.portrait
      const W = fr.width
      const H = fr.height
      const aspect = el.naturalWidth / el.naturalHeight
      const contentW = W / H > aspect ? H * aspect : W
      const contentH = W / H > aspect ? H : W / aspect
      const offsetX = (p.x / 100) * (W - contentW)
      const offsetY = (p.y / 100) * (H - contentH)
      const s = p.scale

      // Scaling pivots on the frame's bottom centre, as the legacy path does.
      const centreX = W / 2 + (offsetX - W / 2) * s + (contentW * s) / 2
      const centreY = H + (offsetY - H) * s + (contentH * s) / 2

      const clamp = (v: number) => Math.min(100, Math.max(0, Math.round(v)))
      onChange({
        ...stateRef.current.transforms,
        portrait: {
          ...p,
          x: clamp((centreX / W) * 100),
          y: clamp((centreY / H) * 100),
          positionModel: 'anchor',
        },
      })
      return true
    }

    if (convert()) return
    const id = window.setInterval(() => {
      if (convert()) window.clearInterval(id)
    }, 120)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [frameEl, onChange, transforms.portrait])

  /** Where the selected layer currently sits, for the selection outline. */
  const measure = useCallback(() => {
    const frame = frameEl()
    const wrap = wrapRef.current
    if (!frame || !wrap) return setBox(null)
    if (selected === 'background') return setBox(null)
    const el = frame.querySelector(`[data-hero-layer="${selected}"]`) as HTMLElement | null
    if (!el) return setBox(null)
    const r = el.getBoundingClientRect()
    const w = wrap.getBoundingClientRect()
    setBox({ left: r.left - w.left, top: r.top - w.top, width: r.width, height: r.height })
  }, [frameEl, selected])

  useEffect(() => {
    measure()
    const id = window.setTimeout(measure, 50)
    window.addEventListener('resize', measure)
    return () => {
      window.clearTimeout(id)
      window.removeEventListener('resize', measure)
    }
  }, [measure, transforms])

  const limitsFor = (layer: HeroLayerId): ScaleLimits =>
    layer === 'person'
      ? portraitScaleLimits('hero')
      : layer === 'logo'
        ? LOGO_SCALE_LIMITS
        : GRAPHIC_SCALE_LIMITS

  /*
    Both gestures defer to the shared arithmetic. The canvas measures — which
    frame, which layer, how big — and hero-gestures decides what that means for
    the transforms, so a drag here and a drag in a layer's own editor can never
    disagree about which way a person moves.
  */
  const moveBy = useCallback(
    (layer: HeroLayerId, dx: number, dy: number) => {
      const frame = frameEl()
      if (!frame) return
      const fr = frame.getBoundingClientRect()
      const el = frame.querySelector(`[data-hero-layer="${layer}"]`) as HTMLElement | null
      const er = el?.getBoundingClientRect()
      onChange(
        moveLayer(
          stateRef.current.transforms,
          layer,
          dx,
          dy,
          { width: fr.width, height: fr.height },
          er ? { width: er.width, height: er.height } : null
        )
      )
    },
    [frameEl, onChange]
  )

  const scaleBy = useCallback(
    (layer: HeroLayerId, factor: number) => {
      if (layer === 'background') return
      onChange(scaleLayer(stateRef.current.transforms, layer, factor, limitsFor(layer)))
    },
    // limitsFor is derived from constants only, so it is stable in practice.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [onChange]
  )

  /** Topmost layer under the point, so a tap selects what the eye sees. */
  const layerAt = useCallback(
    (clientX: number, clientY: number): HeroLayerId | null => {
      const frame = frameEl()
      if (!frame) return null
      const order: HeroLayerId[] = ['logo', 'graphic-1', 'graphic-0', 'person']
      for (const id of order) {
        const el = frame.querySelector(`[data-hero-layer="${id}"]`) as HTMLElement | null
        if (!el) continue
        const r = el.getBoundingClientRect()
        if (clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom) {
          return id
        }
      }
      return 'background'
    },
    [frameEl]
  )

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    const surface = e.currentTarget
    const points = new Map<number, { x: number; y: number }>()
    points.set(e.pointerId, { x: e.clientX, y: e.clientY })

    let moved = false
    let pinchStart = 0
    const startedOn = layerAt(e.clientX, e.clientY)

    try {
      surface.setPointerCapture(e.pointerId)
    } catch {
      // Capture is a convenience; the window listeners below do the work.
    }
    setDragging(true)

    const dist = () => {
      const [a, b] = [...points.values()]
      return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0
    }

    function down(ev: PointerEvent) {
      points.set(ev.pointerId, { x: ev.clientX, y: ev.clientY })
      if (points.size === 2) pinchStart = dist()
    }

    function move(ev: PointerEvent) {
      const prev = points.get(ev.pointerId)
      if (!prev) return
      const layer = stateRef.current.selected

      if (points.size >= 2) {
        // Pinch. Updating the point first means the ratio is measured between
        // consecutive frames, so the layer cannot jump when the second finger
        // lands part-way through a drag.
        points.set(ev.pointerId, { x: ev.clientX, y: ev.clientY })
        const now = dist()
        if (pinchStart > 8 && now > 8) {
          scaleBy(layer, now / pinchStart)
          pinchStart = now
        }
        moved = true
        return
      }

      const dx = ev.clientX - prev.x
      const dy = ev.clientY - prev.y
      points.set(ev.pointerId, { x: ev.clientX, y: ev.clientY })
      if (Math.abs(dx) + Math.abs(dy) > 0) moved = true
      moveBy(layer, dx, dy)
    }

    function up(ev: PointerEvent) {
      points.delete(ev.pointerId)
      if (points.size === 1) pinchStart = 0
      if (points.size > 0) return

      // A press that never travelled is a selection, not a move.
      if (!moved && startedOn) onSelect(startedOn)
      setDragging(false)
      try {
        surface.releasePointerCapture(ev.pointerId)
      } catch {
        // Already gone.
      }
      window.removeEventListener('pointerdown', down)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
    }

    window.addEventListener('pointerdown', down)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
  }

  return (
    <div ref={wrapRef} className="relative">
      <CardHero card={card} size="compact" />
      <div style={{ height: 14 }} aria-hidden />

      {/*
        Exactly the hero frame, never the identity below it. The ratio is read
        from the same helper the card renders with, so the editable region and
        the artwork can never drift apart.
      */}
      <div
        onPointerDown={handlePointerDown}
        role="application"
        aria-label="Hero composition: drag to move the selected layer"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          aspectRatio: String(heroAspectRatio(transforms.portrait)),
          touchAction: 'none',
          cursor: dragging ? 'grabbing' : 'grab',
        }}
      >
        {/*
          A thin gold frame and four corner ticks — enough to say "this one is
          selected" without the blue bounding box of a desktop design tool.
          Editor only: nothing here exists on the saved or public card.
        */}
        {box ? (
          <div
            aria-hidden
            style={{
              position: 'absolute',
              left: box.left,
              top: box.top,
              width: box.width,
              height: box.height,
              border: '1px solid var(--abc-gold-border)',
              borderRadius: 4,
              boxShadow: '0 0 0 1px rgba(0,0,0,0.28)',
              pointerEvents: 'none',
            }}
          >
            {[
              { top: -3, left: -3 },
              { top: -3, right: -3 },
              { bottom: -3, left: -3 },
              { bottom: -3, right: -3 },
            ].map((pos, i) => (
              <span
                key={i}
                style={{
                  position: 'absolute',
                  ...pos,
                  width: 6,
                  height: 6,
                  borderRadius: 2,
                  background: 'var(--abc-gold-accent)',
                }}
              />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  )
}
