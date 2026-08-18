'use client'

import { useRef, useState } from 'react'
import {
  IconAlertTriangle,
  IconCheck,
  IconRefresh,
  IconSparkles,
  IconTrash,
  IconUpload,
} from '@tabler/icons-react'
import CardHero from '@/components/card/CardHero'
import HeroFramingEditor from '@/components/card/editor/HeroFramingEditor'
import { generateCutout, isPendingCutout, type CutoutProgress } from '@/lib/card/cutout'
import { removeCardMedia, uploadCardMedia } from '@/lib/card/media'
import {
  BACKGROUND_TRANSFORM_DEFAULT,
  PORTRAIT_TRANSFORM_DEFAULT,
  backgroundScaleLimits,
  portraitScaleLimits,
  type CardCoverFit,
  type CardMediaTransforms,
  type CardTheme,
  type DigitalCardData,
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
  coverFit,
  theme,
  onChange,
}: {
  /** The live card, built from unsaved editor state by the shell. */
  card: DigitalCardData
  transforms: CardMediaTransforms
  photoUrl: string
  coverUrl: string
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

  return (
    <div className="flex flex-col gap-4">
      {/*
        The real renderer, not a stand-in. Whatever is wrong here is wrong on
        the card someone receives, which is the only useful kind of preview.
      */}
      <div className="overflow-hidden rounded-card border border-abc-border">
        <CardHero card={card} size="compact" />
        <div style={{ height: 14 }} aria-hidden />
      </div>

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
        <HeroFramingEditor
          label="Position and zoom"
          imageUrl={coverUrl}
          theme={theme}
          contain={coverFit === 'fit'}
          limits={backgroundScaleLimits(coverFit)}
          showPositionGrid
          transform={transforms.background}
          onChange={(background) =>
            onChange({ card_media_transforms: { ...transforms, background } })
          }
          onReset={() =>
            onChange({
              card_media_transforms: { ...transforms, background: BACKGROUND_TRANSFORM_DEFAULT },
            })
          }
        />
      </div>
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
        <div className="mt-4">
          <HeroFramingEditor
            label="Position the person"
            imageUrl={portrait.cutoutUrl as string}
            shape="hero"
            contain
            theme={theme}
            limits={portraitScaleLimits('hero')}
            transform={portrait}
            onChange={(next) => onChange({ card_media_transforms: { ...transforms, portrait: next } })}
            onReset={() =>
              onChange({
                card_media_transforms: {
                  ...transforms,
                  // Reset placement, not the mode or the cutout the owner made.
                  portrait: { ...PORTRAIT_TRANSFORM_DEFAULT, mode, cutoutUrl: portrait.cutoutUrl },
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
