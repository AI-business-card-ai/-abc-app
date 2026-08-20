'use client'

import { useRef, useState } from 'react'
import {
  IconAlertTriangle,
  IconArrowBackUp,
  IconCheck,
  IconRefresh,
  IconSparkles,
  IconTrash,
  IconUpload,
} from '@tabler/icons-react'
import CardHero from '@/components/card/CardHero'
import LayerEditor from '@/components/card/editor/LayerEditor'
import HeroCanvas, { type HeroLayerId } from '@/components/card/editor/HeroCanvas'
import HeroFramingEditor from '@/components/card/editor/HeroFramingEditor'
import { generateCutout, isPendingCutout, type CutoutProgress } from '@/lib/card/cutout'
import { removeCardMedia, uploadCardMedia } from '@/lib/card/media'
import {
  BACKGROUND_TRANSFORM_DEFAULT,
  GRAPHIC_SCALE_LIMITS,
  HERO_PERSON_ANCHOR_DEFAULT,
  GRAPHIC_TRANSFORM_DEFAULT,
  LOGO_SCALE_LIMITS,
  MAX_GRAPHIC_LAYERS,
  LOGO_TRANSFORM_DEFAULT,
  PORTRAIT_TRANSFORM_DEFAULT,
  backgroundScaleLimits,
  portraitScaleLimits,
  type CardCoverFit,
  type CardMediaTransforms,
  type CardTheme,
  type DigitalCardData,
  type GraphicLayer,
  type LogoTransform,
  type PortraitMode,
} from '@/lib/card/types'

/**
 * One place to compose the card.
 *
 * The controls that shape the hero used to be scattered: a cover-fit switch in
 * one box, a background framing editor in another, a portrait style block in a
 * third, each with its own zoom slider for a different image. An owner had to
 * hold the internal media model in their head to know which one to touch.
 *
 * This is the whole composition in the order someone actually thinks about it
 * — see it, choose a style, place the background, place yourself — with the
 * real card at the top so every control has visible consequences.
 */
export default function CustomizeHero({
  card,
  transforms,
  photoUrl,
  coverUrl,
  logoUrl,
  coverFit,
  theme,
  onChange,
}: {
  /** The live card, built from unsaved editor state by the shell. */
  card: DigitalCardData
  transforms: CardMediaTransforms
  photoUrl: string
  coverUrl: string
  logoUrl: string
  coverFit: CardCoverFit
  theme: CardTheme
  onChange: (patch: {
    card_cover_fit?: CardCoverFit
    card_media_transforms?: CardMediaTransforms
  }) => void
}) {
  const portrait = transforms.portrait
  const mode = portrait.mode
  const hasCutout = Boolean(portrait.cutoutUrl)
  const [selected, setSelected] = useState<HeroLayerId>('person')

  const layers: { id: HeroLayerId; label: string; available: boolean }[] = [
    { id: 'background', label: 'Background', available: Boolean(coverUrl) },
    { id: 'person', label: 'Person', available: hasCutout },
    { id: 'logo', label: 'Logo', available: Boolean(logoUrl) && transforms.logo.visible },
    { id: 'graphic-0', label: 'Graphic 1', available: Boolean(transforms.graphics[0]) },
    { id: 'graphic-1', label: 'Graphic 2', available: Boolean(transforms.graphics[1]) },
  ]

  return (
    <div className="flex flex-col gap-4">
      {/*
        The card is the canvas. Pick a layer, put a finger on it, move it —
        the panels below are for the things a finger is bad at.
      */}
      <div className="overflow-hidden rounded-card border border-abc-border">
        {mode === 'hero' ? (
          <HeroCanvas
            card={card}
            transforms={transforms}
            selected={selected}
            onSelect={setSelected}
            onChange={(next) => onChange({ card_media_transforms: next })}
          />
        ) : (
          <>
            <CardHero card={card} size="compact" />
            <div style={{ height: 14 }} aria-hidden />
          </>
        )}
      </div>

      {mode === 'hero' ? (
        <div className="-mt-1">
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Layer to edit">
            {layers
              .filter((l) => l.available)
              .map((l) => {
                const active = selected === l.id
                return (
                  <button
                    key={l.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setSelected(l.id)}
                    className="min-h-[36px] abc-tap rounded-full border px-3 text-[12.5px] font-medium transition-colors duration-200 ease-abc abc-focus-ring"
                    style={{
                      background: active ? 'var(--abc-gold-soft)' : 'var(--abc-card)',
                      borderColor: active ? 'var(--abc-gold-border)' : 'var(--abc-border)',
                      color: active ? 'var(--abc-gold-accent)' : 'var(--abc-text-secondary)',
                    }}
                  >
                    {l.label}
                  </button>
                )
              })}
          </div>
          <p className="mt-1.5 text-[11.5px] leading-[1.45] text-abc-muted">
            Drag on the card to move the selected layer. Pinch to resize.
          </p>
        </div>
      ) : null}

      <StyleSection mode={mode} hasCutout={hasCutout} transforms={transforms} onChange={onChange} />

      {coverUrl ? (
        <BackgroundSection
          transforms={transforms}
          coverUrl={coverUrl}
          coverFit={coverFit}
          theme={theme}
          onChange={onChange}
        />
      ) : (
        <Empty text="Add a cover image above to design the background." />
      )}

      {logoUrl && mode === 'hero' ? (
        <LogoSection transforms={transforms} logoUrl={logoUrl} theme={theme} onChange={onChange} />
      ) : null}

      {mode === 'hero' ? (
        <GraphicsSection transforms={transforms} onChange={onChange} onSelect={setSelected} />
      ) : null}

      {photoUrl ? (
        <PersonSection
          transforms={transforms}
          photoUrl={photoUrl}
          theme={theme}
          onChange={onChange}
        />
      ) : (
        <Empty text="Add a profile photo above to use it on your card." />
      )}
    </div>
  )
}

function Empty({ text }: { text: string }) {
  return (
    <p className="rounded-inner border border-abc-border bg-abc-raised p-3.5 text-[12.5px] leading-[1.5] text-abc-muted">
      {text}
    </p>
  )
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-inner border border-abc-border bg-abc-raised p-3.5">
      <p className="text-[13.5px] font-semibold text-abc-text">{title}</p>
      {children}
    </section>
  )
}

/** Classic or Hero, plus the one thing Hero needs before it can render. */
function StyleSection({
  mode,
  hasCutout,
  transforms,
  onChange,
}: {
  mode: PortraitMode
  hasCutout: boolean
  transforms: CardMediaTransforms
  onChange: (patch: { card_media_transforms?: CardMediaTransforms }) => void
}) {
  function setMode(next: PortraitMode) {
    // Clamp to the mode being switched to. Hero draws the hero composition
    // whether or not a cutout exists yet, so there is no circle whose cover
    // floor the scale would have to respect.
    const limits = portraitScaleLimits(next)
    const scale = Math.min(limits.max, Math.max(limits.min, transforms.portrait.scale))
    onChange({
      card_media_transforms: {
        ...transforms,
        portrait: { ...transforms.portrait, mode: next, scale },
      },
    })
  }

  return (
    <Panel title="Style">
      <div className="mt-2.5 flex gap-2">
        {(
          [
            { id: 'classic', label: 'Classic', hint: 'Circular portrait on your cover' },
            { id: 'hero', label: 'Hero', hint: 'You in front of your cover' },
          ] as const
        ).map((option) => {
          const active = mode === option.id
          return (
            <button
              key={option.id}
              type="button"
              onClick={() => setMode(option.id)}
              aria-pressed={active}
              title={option.hint}
              className="min-h-[44px] flex-1 rounded-btn border px-3 text-[13px] font-medium transition-colors duration-200 ease-abc abc-focus-ring"
              style={{
                background: active ? 'var(--abc-gold-soft)' : 'var(--abc-card)',
                borderColor: active ? 'var(--abc-gold-border)' : 'var(--abc-border)',
                color: active ? 'var(--abc-gold-accent)' : 'var(--abc-text-secondary)',
              }}
            >
              {option.label}
            </button>
          )
        })}
      </div>

      {mode === 'hero' && !hasCutout ? (
        <div className="mt-3 rounded-inner border border-abc-gold-border bg-abc-gold-soft p-3">
          <p className="text-[13px] font-semibold text-abc-gold">
            Hero needs a background-free portrait
          </p>
          <p className="mt-1 text-[12.5px] leading-[1.5] text-abc-secondary">
            Use Create automatically below to lift you out of your photo, or upload an image
            that already has its background removed.
          </p>
        </div>
      ) : (
        <p className="mt-2.5 text-[12.5px] leading-[1.5] text-abc-muted">
          {mode === 'hero'
            ? 'Your portrait sits in front of the cover artwork.'
            : 'A circular portrait sits over your cover, as it does today.'}
        </p>
      )}
    </Panel>
  )
}

/** Everything that shapes the artwork behind the person. */
function BackgroundSection({
  transforms,
  coverUrl,
  coverFit,
  theme,
  onChange,
}: {
  transforms: CardMediaTransforms
  coverUrl: string
  coverFit: CardCoverFit
  theme: CardTheme
  onChange: (patch: {
    card_cover_fit?: CardCoverFit
    card_media_transforms?: CardMediaTransforms
  }) => void
}) {
  return (
    <Panel title="Background">
      <div className="mt-2.5 flex gap-2">
        {(
          [
            { id: 'fill', label: 'Fill', hint: 'Crops to fill the hero' },
            { id: 'fit', label: 'Fit', hint: 'Shows the whole image' },
          ] as const
        ).map((option) => (
          <button
            key={option.id}
            type="button"
            aria-pressed={coverFit === option.id}
            title={option.hint}
            onClick={() => {
              // Fit allows an image smaller than the frame; fill does not.
              // Re-clamp so switching back can never leave a visible gap.
              const limits = backgroundScaleLimits(option.id)
              const scale = Math.min(
                limits.max,
                Math.max(limits.min, transforms.background.scale)
              )
              onChange({
                card_cover_fit: option.id,
                card_media_transforms: {
                  ...transforms,
                  background: { ...transforms.background, scale },
                },
              })
            }}
            className="min-h-[44px] flex-1 rounded-btn border px-3 text-[13px] font-medium transition-colors duration-200 ease-abc abc-focus-ring"
            style={{
              background: coverFit === option.id ? 'var(--abc-gold-soft)' : 'var(--abc-card)',
              borderColor: coverFit === option.id ? 'var(--abc-gold-border)' : 'var(--abc-border)',
              color: coverFit === option.id ? 'var(--abc-gold-accent)' : 'var(--abc-text-secondary)',
            }}
          >
            {option.label}
          </button>
        ))}
      </div>

      <p className="mt-2 text-[12px] leading-[1.45] text-abc-muted">
        {coverFit === 'fit'
          ? 'The whole cover is shown against your card background.'
          : 'The cover fills the hero. Drag below to choose what stays in frame.'}
      </p>

      <div className="mt-3">
        <LayerEditor
          layer="background"
          label="Position and zoom"
          imageUrl={coverUrl}
          transforms={transforms}
          scaleLimits={backgroundScaleLimits(coverFit)}
          scaleValue={transforms.background.scale}
          onChange={(next) => onChange({ card_media_transforms: next })}
          onScale={(scale) =>
            onChange({
              card_media_transforms: {
                ...transforms,
                background: { ...transforms.background, scale },
              },
            })
          }
          onReset={() =>
            onChange({
              card_media_transforms: { ...transforms, background: BACKGROUND_TRANSFORM_DEFAULT },
            })
          }
        >
          <Slider
            label="Darken"
            value={transforms.background.overlay}
            min={0}
            max={100}
            step={5}
            format={(v) => `${Math.round(v)}%`}
            onChange={(overlay) =>
              onChange({
                card_media_transforms: {
                  ...transforms,
                  background: { ...transforms.background, overlay },
                },
              })
            }
          />
        </LayerEditor>
      </div>
    </Panel>
  )
}

/** Shared by every panel: one row, one number, one value readout. */
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


/**
 * The company logo, as a layer the owner places rather than a fixed corner.
 *
 * Hero only. In classic the logo sits in the identity row beside the circular
 * portrait, where there is nothing to position it against.
 */
function LogoSection({
  transforms,
  logoUrl,
  theme,
  onChange,
}: {
  transforms: CardMediaTransforms
  logoUrl: string
  theme: CardTheme
  onChange: (patch: { card_media_transforms?: CardMediaTransforms }) => void
}) {
  const logo = transforms.logo

  function set(next: Partial<LogoTransform>) {
    /*
      Anything the owner does here is a deliberate placement, so it settles the
      logo into the anchored model — position stops depending on size, and the
      preview stops disagreeing with the card.
    */
    onChange({
      card_media_transforms: {
        ...transforms,
        logo: { ...logo, ...next, positionModel: 'anchor' },
      },
    })
  }

  return (
    <Panel title="Logo">
      <div className="mt-2.5 flex items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={logoUrl}
          alt=""
          className="h-[48px] w-[64px] shrink-0 rounded-inner border border-abc-border bg-abc-card object-contain"
        />
        <button
          type="button"
          onClick={() => set({ visible: !logo.visible })}
          aria-pressed={logo.visible}
          className="min-h-[44px] flex-1 rounded-btn border px-3 text-[13px] font-medium transition-colors duration-200 ease-abc abc-focus-ring"
          style={{
            background: logo.visible ? 'var(--abc-gold-soft)' : 'var(--abc-card)',
            borderColor: logo.visible ? 'var(--abc-gold-border)' : 'var(--abc-border)',
            color: logo.visible ? 'var(--abc-gold-accent)' : 'var(--abc-text-secondary)',
          }}
        >
          {logo.visible ? 'Shown on the card' : 'Hidden'}
        </button>
      </div>

      {logo.visible ? (
        <div className="mt-3">
          <LayerEditor
            layer="logo"
            label="Place the logo"
            imageUrl={logoUrl}
            transforms={transforms}
            scaleLimits={LOGO_SCALE_LIMITS}
            scaleValue={logo.scale}
            opacity={logo.opacity}
            onChange={(next) => onChange({ card_media_transforms: next })}
            onScale={(scale) => set({ scale })}
            onOpacity={(opacity) => set({ opacity })}
            onReset={() =>
              onChange({
                card_media_transforms: {
                  ...transforms,
                  // Back to the corner it has always defaulted to, read the
                  // legacy way so Reset reproduces the original placement.
                  logo: { ...LOGO_TRANSFORM_DEFAULT },
                },
              })
            }
          />
        </div>
      ) : (
        <p className="mt-2.5 text-[12.5px] leading-[1.5] text-abc-muted">
          Your logo is hidden on the hero. The rest of the card is unchanged.
        </p>
      )}
    </Panel>
  )
}

/**
 * Up to two extra layers: an event badge, a product mark, a partner logo.
 *
 * Deliberately capped. The point is a business card that can carry the one or
 * two marks a trade fair actually needs, not a canvas with an unbounded layer
 * stack — two is the number past which "behind me or in front of me" stops
 * being a sufficient way to describe the order.
 */
function GraphicsSection({
  transforms,
  onChange,
  onSelect,
}: {
  transforms: CardMediaTransforms
  onChange: (patch: { card_media_transforms?: CardMediaTransforms }) => void
  onSelect: (layer: HeroLayerId) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [replacing, setReplacing] = useState<number | null>(null)
  const graphics = transforms.graphics

  function write(next: GraphicLayer[]) {
    onChange({ card_media_transforms: { ...transforms, graphics: next } })
  }

  function set(index: number, next: Partial<GraphicLayer>) {
    write(graphics.map((g, i) => (i === index ? { ...g, ...next } : g)))
  }

  async function handleFile(file: File | undefined) {
    if (!file) return
    setError(null)
    setBusy(true)
    const result = await uploadCardMedia('graphic', file)
    setBusy(false)

    if ('error' in result) {
      setError(result.error)
      return
    }
    const target = replacing
    if (target !== null && graphics[target]) {
      const previous = graphics[target].url
      set(target, { url: result.url })
      if (previous) void removeCardMedia(previous)
    } else if (graphics.length < MAX_GRAPHIC_LAYERS) {
      write([...graphics, { url: result.url, ...GRAPHIC_TRANSFORM_DEFAULT }])
      onSelect(graphics.length === 0 ? 'graphic-0' : 'graphic-1')
    }
    setReplacing(null)
  }

  function remove(index: number) {
    const previous = graphics[index]?.url
    write(graphics.filter((_, i) => i !== index))
    if (previous) void removeCardMedia(previous)
  }

  return (
    <Panel title="Graphics">
      <p className="mt-1 text-[12px] leading-[1.45] text-abc-muted">
        An event badge, a product mark or a partner logo. Up to two.
      </p>

      {graphics.map((g, index) => (
        <div key={index} className="mt-3 rounded-inner border border-abc-border p-3">
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={g.url}
              alt=""
              className="h-[44px] w-[56px] shrink-0 rounded-inner border border-abc-border bg-abc-card object-contain"
            />
            <p className="flex-1 text-[13px] font-semibold text-abc-text">Graphic {index + 1}</p>
            <button
              type="button"
              onClick={() => set(index, { visible: !g.visible })}
              aria-pressed={g.visible}
              className="min-h-[36px] abc-tap rounded-btn border border-abc-border px-2.5 text-[12px] text-abc-secondary abc-focus-ring"
            >
              {g.visible ? 'Shown' : 'Hidden'}
            </button>
          </div>

          <div className="mt-2.5 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setReplacing(index)
                inputRef.current?.click()
              }}
              className="inline-flex h-[40px] abc-tap items-center gap-1.5 rounded-btn border border-abc-border px-3 text-[12.5px] text-abc-text disabled:opacity-50 abc-focus-ring"
            >
              <IconUpload size={15} stroke={1.8} />
              Replace
            </button>
            <button
              type="button"
              onClick={() => remove(index)}
              className="inline-flex h-[40px] abc-tap items-center gap-1.5 rounded-btn border border-abc-border px-3 text-[12.5px] text-abc-secondary abc-focus-ring"
            >
              <IconTrash size={15} stroke={1.8} />
              Remove
            </button>
            <button
              type="button"
              onClick={() => onSelect(index === 0 ? 'graphic-0' : 'graphic-1')}
              className="inline-flex h-[40px] abc-tap items-center rounded-btn border border-abc-border px-3 text-[12.5px] text-abc-secondary abc-focus-ring"
            >
              Edit on card
            </button>
          </div>

          {/* Order, in the only terms anyone ever asks it in. */}
          <div className="mt-3 flex gap-2" role="group" aria-label="Graphic placement">
            {(
              [
                { id: 'behind-person', label: 'Behind person' },
                { id: 'front-person', label: 'In front' },
              ] as const
            ).map((option) => {
              const active = g.placement === option.id
              return (
                <button
                  key={option.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => set(index, { placement: option.id })}
                  className="min-h-[40px] abc-tap flex-1 rounded-btn border px-2 text-[12.5px] font-medium transition-colors duration-200 ease-abc abc-focus-ring"
                  style={{
                    background: active ? 'var(--abc-gold-soft)' : 'var(--abc-card)',
                    borderColor: active ? 'var(--abc-gold-border)' : 'var(--abc-border)',
                    color: active ? 'var(--abc-gold-accent)' : 'var(--abc-text-secondary)',
                  }}
                >
                  {option.label}
                </button>
              )
            })}
          </div>

          <div className="mt-3">
            <LayerEditor
              layer={index === 0 ? 'graphic-0' : 'graphic-1'}
              label={`Place graphic ${index + 1}`}
              imageUrl={g.url}
              transforms={transforms}
              scaleLimits={GRAPHIC_SCALE_LIMITS}
              scaleValue={g.scale}
              opacity={g.opacity}
              visible={g.visible}
              onChange={(next) => onChange({ card_media_transforms: next })}
              onScale={(scale) => set(index, { scale })}
              onOpacity={(opacity) => set(index, { opacity })}
              onToggleVisible={() => set(index, { visible: !g.visible })}
              onReset={() => set(index, { ...GRAPHIC_TRANSFORM_DEFAULT })}
            />
          </div>
        </div>
      ))}

      {graphics.length < MAX_GRAPHIC_LAYERS ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            setReplacing(null)
            inputRef.current?.click()
          }}
          className="mt-3 inline-flex h-[44px] items-center gap-2 rounded-btn border px-3.5 text-[13.5px] font-semibold transition-colors duration-200 ease-abc disabled:opacity-50 abc-focus-ring"
          style={{
            background: 'var(--abc-gold-soft)',
            borderColor: 'var(--abc-gold-border)',
            color: 'var(--abc-gold-accent)',
          }}
        >
          <IconUpload size={16} stroke={1.8} />
          {busy ? 'Uploading…' : 'Add graphic'}
        </button>
      ) : (
        <p className="mt-3 text-[12px] leading-[1.45] text-abc-muted">
          Two graphics is the maximum. Remove one to add another.
        </p>
      )}

      {error ? (
        <p
          className="mt-2 flex items-start gap-1.5 text-[12px] leading-[1.45]"
          style={{ color: 'var(--abc-overdue)' }}
          role="alert"
        >
          <IconAlertTriangle size={14} stroke={1.9} className="mt-px shrink-0" />
          <span>{error}</span>
        </p>
      ) : null}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="sr-only"
        aria-label="Choose a graphic"
        onChange={(e) => {
          void handleFile(e.target.files?.[0])
          e.target.value = ''
        }}
      />
    </Panel>
  )
}

/** The person: their cutout, and where they stand in the composition. */
function PersonSection({
  transforms,
  photoUrl,
  theme,
  onChange,
}: {
  transforms: CardMediaTransforms
  photoUrl: string
  theme: CardTheme
  onChange: (patch: { card_media_transforms?: CardMediaTransforms }) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const pendingBlob = useRef<Blob | null>(null)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<CutoutProgress | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [errorDetail, setErrorDetail] = useState<string | null>(null)

  const portrait = transforms.portrait
  const hasCutout = Boolean(portrait.cutoutUrl)
  const pending = isPendingCutout(portrait.cutoutUrl)
  const mode = portrait.mode
  /** Hero only truly engages once there is a subject to place. */
  const heroActive = mode === 'hero' && hasCutout

  function apply(url: string | null, nextMode: PortraitMode) {
    /*
      Clamp to the mode being applied. Each mode has its own floor — classic
      must keep a circle covered, hero may float a subject smaller than its
      frame — and the two are no longer entangled, because losing a cutout no
      longer drops the card back into a circle.
    */
    const limits = portraitScaleLimits(nextMode)
    const scale = Math.min(limits.max, Math.max(limits.min, portrait.scale))

    onChange({
      card_media_transforms: {
        ...transforms,
        portrait: { ...portrait, cutoutUrl: url, mode: nextMode, scale },
      },
    })
  }

  async function createCutout() {
    setError(null)
    setErrorDetail(null)
    setBusy(true)
    setProgress({ stage: 'checking', percent: null, label: 'Preparing…' })

    const result = await generateCutout(photoUrl, setProgress)
    setBusy(false)
    setProgress(null)

    if ('error' in result) {
      setError(result.error)
      setErrorDetail(result.detail)
      return
    }
    if (isPendingCutout(portrait.cutoutUrl)) URL.revokeObjectURL(portrait.cutoutUrl as string)
    pendingBlob.current = result.blob
    apply(result.url, 'hero')
  }

  /** Accepting is what uploads; an unaccepted attempt never reaches storage. */
  async function acceptCutout() {
    const blob = pendingBlob.current
    if (!blob) return
    setError(null)
    setBusy(true)

    const file = new File([blob], 'portrait-cutout.png', { type: 'image/png' })
    const previous = portrait.cutoutUrl
    const result = await uploadCardMedia('cutout', file)
    setBusy(false)

    if ('error' in result) {
      setError(result.error)
      return
    }
    if (isPendingCutout(previous)) URL.revokeObjectURL(previous as string)
    pendingBlob.current = null
    apply(result.url, 'hero')
  }

  async function uploadCutout(file: File | undefined) {
    if (!file) return
    setError(null)
    setErrorDetail(null)
    setBusy(true)
    const previous = portrait.cutoutUrl
    const result = await uploadCardMedia('cutout', file)
    setBusy(false)

    if ('error' in result) {
      setError(result.error)
      return
    }
    if (isPendingCutout(previous)) URL.revokeObjectURL(previous as string)
    else if (previous) void removeCardMedia(previous)
    pendingBlob.current = null
    apply(result.url, 'hero')
  }

  function removeCutout() {
    /*
      Removing the subject is not the same as abandoning the design. The mode
      is left exactly as the owner set it: under Hero the preview keeps the
      hero composition and returns to its setup state, so a delete never
      silently switches them back to the circular card. Leaving Hero is a
      deliberate act, and it has its own control in Style.
    */
    const current = portrait.cutoutUrl
    if (isPendingCutout(current)) URL.revokeObjectURL(current as string)
    pendingBlob.current = null
    apply(null, mode)
    if (current && !isPendingCutout(current)) void removeCardMedia(current)
  }

  return (
    <Panel title={heroActive ? 'Person' : mode === 'hero' ? 'Person — needs a cutout' : 'Portrait'}>
      <div className="mt-2.5 flex items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={portrait.cutoutUrl || photoUrl}
          alt=""
          className="h-[64px] w-[64px] shrink-0 rounded-inner border border-abc-border bg-abc-card object-contain"
        />
        <div className="min-w-0 flex-1">
          <p className="text-[12.5px] leading-[1.45] text-abc-secondary">
            {hasCutout
              ? 'Background-free portrait ready.'
              : mode === 'hero'
                ? 'No person in the hero yet — this photo is the source.'
                : 'Using your original profile photo.'}
          </p>
          <p className="mt-0.5 text-[11.5px] leading-[1.45] text-abc-muted">
            Your original photo is always kept.
          </p>
        </div>
      </div>

      {busy && progress ? (
        <div className="mt-3" role="status" aria-live="polite">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-[12.5px] text-abc-text">{progress.label}</span>
            {progress.percent !== null ? (
              <span className="text-[11.5px] tabular-nums text-abc-secondary">
                {progress.percent}%
              </span>
            ) : null}
          </div>
          <div
            className="mt-1.5 h-[6px] overflow-hidden rounded-full"
            style={{ background: 'var(--abc-border)' }}
            role="progressbar"
            aria-valuenow={progress.percent ?? undefined}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className="h-full rounded-full transition-[width] duration-200 ease-abc"
              style={{
                width: progress.percent !== null ? `${progress.percent}%` : '40%',
                background: 'var(--abc-gold-accent)',
                opacity: progress.percent === null ? 0.5 : 1,
              }}
            />
          </div>
          <p className="mt-1.5 text-[11.5px] leading-[1.45] text-abc-muted">
            This runs on your device — your photo is not uploaded anywhere for this.
          </p>
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {!hasCutout ? (
          <button
            type="button"
            onClick={() => void createCutout()}
            disabled={busy}
            className="inline-flex h-[44px] items-center gap-2 rounded-btn border px-3.5 text-[13.5px] font-semibold transition-colors duration-200 ease-abc disabled:opacity-50 abc-focus-ring"
            style={{
              background: 'var(--abc-gold-soft)',
              borderColor: 'var(--abc-gold-border)',
              color: 'var(--abc-gold-accent)',
            }}
          >
            <IconSparkles size={16} stroke={1.8} />
            {busy ? 'Working…' : 'Create automatically'}
          </button>
        ) : null}

        {pending ? (
          <>
            <button
              type="button"
              onClick={() => void acceptCutout()}
              disabled={busy}
              className="inline-flex h-[44px] items-center gap-2 rounded-btn border px-3.5 text-[13.5px] font-semibold transition-colors duration-200 ease-abc disabled:opacity-50 abc-focus-ring"
              style={{
                background: 'var(--abc-gold-soft)',
                borderColor: 'var(--abc-gold-border)',
                color: 'var(--abc-gold-accent)',
              }}
            >
              <IconCheck size={16} stroke={2} />
              {busy ? 'Saving…' : 'Use result'}
            </button>
            <button
              type="button"
              onClick={() => void createCutout()}
              disabled={busy}
              className="inline-flex h-[44px] items-center gap-2 rounded-btn border border-abc-border bg-abc-card px-3.5 text-[13.5px] font-medium text-abc-text transition-colors duration-200 ease-abc disabled:opacity-50 abc-focus-ring"
            >
              <IconRefresh size={16} stroke={1.8} />
              Try again
            </button>
          </>
        ) : null}

        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="inline-flex h-[44px] items-center gap-2 rounded-btn border border-abc-border bg-abc-card px-3.5 text-[13.5px] font-medium text-abc-text transition-colors duration-200 ease-abc hover:border-abc-border-strong disabled:opacity-50 abc-focus-ring"
        >
          <IconUpload size={16} stroke={1.8} />
          {hasCutout ? 'Replace' : 'Upload transparent image'}
        </button>

        {hasCutout && !busy ? (
          <button
            type="button"
            onClick={removeCutout}
            className="inline-flex h-[44px] items-center gap-2 rounded-btn border border-abc-border px-3.5 text-[13.5px] font-medium text-abc-secondary transition-colors duration-200 ease-abc hover:text-abc-text abc-focus-ring"
          >
            <IconTrash size={16} stroke={1.8} />
            Remove
          </button>
        ) : null}
      </div>

      {pending && !busy ? (
        <p className="mt-2 text-[12px] leading-[1.45] text-abc-muted">
          Previewing above. Choose{' '}
          <strong className="font-semibold text-abc-text">Use result</strong> to keep it — it is not
          stored until you do.
        </p>
      ) : null}

      <div aria-live="polite">
        {error ? (
          <div className="mt-2" role="alert">
            <p
              className="flex items-start gap-1.5 text-[12px] leading-[1.45]"
              style={{ color: 'var(--abc-overdue)' }}
            >
              <IconAlertTriangle size={14} stroke={1.9} className="mt-px shrink-0" />
              <span>{error}</span>
            </p>
            {errorDetail ? (
              <details className="mt-1.5">
                <summary className="cursor-pointer text-[11.5px] text-abc-muted">Details</summary>
                <code className="mt-1 block break-all rounded-inner bg-abc-card px-2 py-1.5 text-[11px] text-abc-secondary">
                  {errorDetail}
                </code>
              </details>
            ) : null}
          </div>
        ) : null}
      </div>

      <input
        ref={inputRef}
        type="file"
        /*
          Broad on purpose. iOS hands transparent stickers and Files picks over
          with an empty or generic type, and a narrow accept list makes the
          picker hide the very file the owner is trying to choose. What the
          file actually is gets decided from its bytes after it is chosen.
        */
        accept="image/*"
        className="sr-only"
        aria-label="Choose a portrait with the background removed"
        onChange={(e) => {
          void uploadCutout(e.target.files?.[0])
          e.target.value = ''
        }}
      />

      {/*
        Placement. Hero never falls back to the circular editor: a round crop
        frame is the Classic mental model, and showing it while the owner is
        composing a Hero card is what made Hero feel like Classic in disguise.
        Without a cutout there is no subject to place yet, so the section shows
        the setup state above and no framing control at all.
      */}
      {heroActive ? (
        <div className="mt-3">
          <LayerEditor
            layer="person"
            label="Place the person"
            imageUrl={portrait.cutoutUrl as string}
            transforms={transforms}
            scaleLimits={portraitScaleLimits('hero')}
            scaleValue={portrait.scale}
            onChange={(next) => onChange({ card_media_transforms: next })}
            onScale={(scale) =>
              onChange({
                card_media_transforms: {
                  ...transforms,
                  portrait: { ...portrait, scale, positionModel: 'anchor' },
                },
              })
            }
            onReset={() =>
              onChange({
                card_media_transforms: {
                  ...transforms,
                  /*
                    Reset placement, not the mode or the cutout the owner made
                    — and reset to the anchored centre rather than the shared
                    default, whose y is the Classic circle's crop and would put
                    an anchored subject somewhere nobody asked for.
                  */
                  portrait: {
                    ...portrait,
                    ...HERO_PERSON_ANCHOR_DEFAULT,
                    mode,
                    cutoutUrl: portrait.cutoutUrl,
                    positionModel: 'anchor',
                  },
                },
              })
            }
          />
        </div>
      ) : null}

      {mode === 'classic' ? (
        <div className="mt-4">
          <HeroFramingEditor
            label="Portrait framing"
            imageUrl={photoUrl}
            shape="circle"
            theme={theme}
            limits={portraitScaleLimits('classic')}
            transform={portrait}
            onChange={(next) => onChange({ card_media_transforms: { ...transforms, portrait: next } })}
            onReset={() =>
              onChange({
                card_media_transforms: {
                  ...transforms,
                  portrait: { ...PORTRAIT_TRANSFORM_DEFAULT, mode, cutoutUrl: portrait.cutoutUrl },
                },
              })
            }
          />
        </div>
      ) : null}
    </Panel>
  )
}
