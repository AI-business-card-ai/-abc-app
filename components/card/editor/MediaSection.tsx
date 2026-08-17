'use client'

import { useRef, useState } from 'react'
import {
  IconAlertTriangle,
  IconCheck,
  IconPhotoPlus,
  IconRefresh,
  IconSparkles,
  IconTrash,
  IconUpload,
} from '@tabler/icons-react'
import { generateCutout, isPendingCutout, type CutoutProgress } from '@/lib/card/cutout'
import {
  CARD_MEDIA_LABELS,
  removeCardMedia,
  uploadCardMedia,
  type CardProfileMediaKind,
} from '@/lib/card/media'
import { initialsFromName } from '@/lib/card/theme'
import HeroFramingEditor from '@/components/card/editor/HeroFramingEditor'
import {
  BACKGROUND_TRANSFORM_DEFAULT,
  PORTRAIT_TRANSFORM_DEFAULT,
  backgroundScaleLimits,
  portraitScaleLimits,
  type CardCoverFit,
  type CardMediaTransforms,
  type CardTheme,
  type PortraitMode,
} from '@/lib/card/types'

type MediaState = { status: 'idle' | 'uploading' | 'done' | 'error'; message?: string }

/**
 * Profile photo, cover and logo. Each tile owns its own status, so a failing
 * logo upload can never be mistaken for a successful photo upload — the
 * original bug was a single shared state that reported nothing where the user
 * was looking.
 */
export default function MediaSection({
  photoUrl,
  coverUrl,
  logoUrl,
  coverPosition,
  coverFit,
  transforms,
  theme,
  fullName,
  onChange,
}: {
  photoUrl: string
  coverUrl: string
  logoUrl: string
  coverPosition: string
  coverFit: CardCoverFit
  transforms: CardMediaTransforms
  theme: CardTheme
  fullName: string
  onChange: (patch: {
    card_photo_url?: string
    card_cover_url?: string
    company_logo_url?: string
    card_cover_position?: string
    card_cover_fit?: CardCoverFit
    card_media_transforms?: CardMediaTransforms
  }) => void
}) {
  const [state, setState] = useState<Record<CardProfileMediaKind, MediaState>>({
    photo: { status: 'idle' },
    cover: { status: 'idle' },
    logo: { status: 'idle' },
  })

  const urls: Record<CardProfileMediaKind, string> = {
    photo: photoUrl,
    cover: coverUrl,
    logo: logoUrl,
  }

  function applyUrl(kind: CardProfileMediaKind, url: string) {
    if (kind === 'photo') onChange({ card_photo_url: url })
    else if (kind === 'cover') onChange({ card_cover_url: url })
    else onChange({ company_logo_url: url })
  }

  async function handleFile(kind: CardProfileMediaKind, file: File | undefined) {
    if (!file) return
    const previous = urls[kind]

    setState((s) => ({ ...s, [kind]: { status: 'uploading' } }))
    const result = await uploadCardMedia(kind, file)

    if ('error' in result) {
      setState((s) => ({ ...s, [kind]: { status: 'error', message: result.error } }))
      return
    }

    applyUrl(kind, result.url)
    setState((s) => ({ ...s, [kind]: { status: 'done', message: 'Uploaded' } }))

    // The replaced object is no longer referenced by anything.
    if (previous && previous !== result.url) void removeCardMedia(previous)
  }

  function handleRemove(kind: CardProfileMediaKind) {
    const current = urls[kind]
    applyUrl(kind, '')
    setState((s) => ({ ...s, [kind]: { status: 'idle' } }))
    if (current) void removeCardMedia(current)
  }

  return (
    <div className="flex flex-col gap-5">
      <MediaTile
        kind="photo"
        url={photoUrl}
        state={state.photo}
        fullName={fullName}
        onFile={(f) => void handleFile('photo', f)}
        onRemove={() => handleRemove('photo')}
      />
      <MediaTile
        kind="cover"
        url={coverUrl}
        state={state.cover}
        fullName={fullName}
        onFile={(f) => void handleFile('cover', f)}
        onRemove={() => handleRemove('cover')}
      />
      <MediaTile
        kind="logo"
        url={logoUrl}
        state={state.logo}
        fullName={fullName}
        onFile={(f) => void handleFile('logo', f)}
        onRemove={() => handleRemove('logo')}
      />

      {coverUrl ? (
        <>
          <CoverFraming
            fit={coverFit}
            onFit={(card_cover_fit) => {
              // Fit allows the image to be smaller than the frame; fill does
              // not. Switching back must not leave a card with a visible gap,
              // so the stored scale is re-clamped to the new mode's floor.
              const limits = backgroundScaleLimits(card_cover_fit)
              const scale = Math.min(limits.max, Math.max(limits.min, transforms.background.scale))
              onChange({
                card_cover_fit,
                card_media_transforms: {
                  ...transforms,
                  background: { ...transforms.background, scale },
                },
              })
            }}
          />
          <HeroFramingEditor
            label="Background framing"
            imageUrl={coverUrl}
            theme={theme}
            contain={coverFit === 'fit'}
            limits={backgroundScaleLimits(coverFit)}
            transform={transforms.background}
            onChange={(background) => onChange({ card_media_transforms: { ...transforms, background } })}
            onReset={() =>
              onChange({
                card_media_transforms: { ...transforms, background: BACKGROUND_TRANSFORM_DEFAULT },
              })
            }
          />
        </>
      ) : null}

      {photoUrl ? (
        <PortraitStyle
          transforms={transforms}
          photoUrl={photoUrl}
          theme={theme}
          onChange={onChange}
        />
      ) : null}

      <p className="text-[12px] leading-[1.5] text-abc-muted">
        JPG, PNG or WebP, up to 10 MB. Large photos are resized before upload.
      </p>
    </div>
  )
}

function MediaTile({
  kind,
  url,
  state,
  fullName,
  onFile,
  onRemove,
}: {
  kind: CardProfileMediaKind
  url: string
  state: MediaState
  fullName: string
  onFile: (file: File | undefined) => void
  onRemove: () => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const { title, help } = CARD_MEDIA_LABELS[kind]
  const busy = state.status === 'uploading'

  return (
    <div>
      <div className="flex items-start gap-3.5">
        <MediaThumb kind={kind} url={url} fullName={fullName} busy={busy} />

        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-semibold text-abc-text">{title}</p>
          <p className="mt-0.5 text-[12.5px] leading-[1.45] text-abc-muted">{help}</p>

          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={busy}
              className="inline-flex h-[44px] items-center gap-2 rounded-btn border border-abc-border bg-abc-raised px-3.5 text-[13.5px] font-medium text-abc-text transition-colors duration-200 ease-abc hover:border-abc-border-strong disabled:opacity-50 abc-focus-ring"
            >
              <IconUpload size={16} stroke={1.8} />
              {busy ? 'Uploading…' : url ? 'Replace' : 'Upload'}
            </button>

            {url && !busy ? (
              <button
                type="button"
                onClick={onRemove}
                className="inline-flex h-[44px] items-center gap-2 rounded-btn border border-abc-border bg-transparent px-3.5 text-[13.5px] font-medium text-abc-secondary transition-colors duration-200 ease-abc hover:text-abc-text disabled:opacity-50 abc-focus-ring"
              >
                <IconTrash size={16} stroke={1.8} />
                Remove
              </button>
            ) : null}
          </div>

          <div aria-live="polite" className="min-h-[18px]">
            {state.status === 'uploading' ? (
              <p className="mt-2 text-[12px] text-abc-secondary">Uploading…</p>
            ) : null}
            {state.status === 'done' ? (
              <p
                className="mt-2 inline-flex items-center gap-1.5 text-[12px]"
                style={{ color: 'var(--abc-green)' }}
              >
                <IconCheck size={14} stroke={2} />
                {state.message}
              </p>
            ) : null}
            {state.status === 'error' ? (
              <p
                className="mt-2 flex items-start gap-1.5 text-[12px] leading-[1.45]"
                style={{ color: 'var(--abc-overdue)' }}
                role="alert"
              >
                <IconAlertTriangle size={14} stroke={1.9} className="mt-px shrink-0" />
                <span>{state.message}</span>
              </p>
            ) : null}
          </div>
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif,image/*"
        className="sr-only"
        aria-label={`Choose a ${title.toLowerCase()}`}
        onChange={(e) => {
          onFile(e.target.files?.[0])
          e.target.value = ''
        }}
      />
    </div>
  )
}

/** Each kind previews the way it is actually used on the card. */
function MediaThumb({
  kind,
  url,
  fullName,
  busy,
}: {
  kind: CardProfileMediaKind
  url: string
  fullName: string
  busy: boolean
}) {
  const base = 'relative shrink-0 overflow-hidden border border-abc-border bg-abc-raised'
  const shape =
    kind === 'photo' ? 'h-[72px] w-[72px] rounded-full' : 'h-[72px] w-[104px] rounded-inner'

  return (
    <div className={`${base} ${shape}`} style={{ opacity: busy ? 0.55 : 1 }}>
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt=""
          className="h-full w-full"
          style={{ objectFit: kind === 'logo' ? 'contain' : 'cover' }}
        />
      ) : kind === 'photo' ? (
        <span className="flex h-full w-full items-center justify-center text-[19px] font-semibold text-abc-muted">
          {initialsFromName(fullName)}
        </span>
      ) : (
        <span className="flex h-full w-full items-center justify-center">
          <IconPhotoPlus size={22} stroke={1.6} className="text-abc-muted" />
        </span>
      )}
    </div>
  )
}

/**
 * Portrait presentation.
 *
 * Two genuinely different compositions, not a style switch: Classic clips the
 * photograph into a circle that straddles the hero edge, Hero places the person
 * into the artwork as a foreground layer. Hero only works with a transparent
 * source, so it stays unavailable — and says why — until one exists, rather
 * than letting the owner select a mode that would paste a rectangle over their
 * own branding.
 */
function PortraitStyle({
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
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [errorDetail, setErrorDetail] = useState<string | null>(null)

  const [progress, setProgress] = useState<CutoutProgress | null>(null)
  const pendingBlob = useRef<Blob | null>(null)

  const portrait = transforms.portrait
  const hasCutout = Boolean(portrait.cutoutUrl)
  const pending = isPendingCutout(portrait.cutoutUrl)
  const mode = portrait.mode

  function setMode(next: PortraitMode) {
    const limits = portraitScaleLimits(next)
    const scale = Math.min(limits.max, Math.max(limits.min, portrait.scale))
    onChange({ card_media_transforms: { ...transforms, portrait: { ...portrait, mode: next, scale } } })
  }

  function applyCutout(url: string | null, nextMode: PortraitMode) {
    onChange({
      card_media_transforms: {
        ...transforms,
        portrait: { ...portrait, cutoutUrl: url, mode: nextMode },
      },
    })
  }

  /**
   * Generate on-device, then show the result in the real card preview before
   * anything is uploaded. The object URL goes into form state so CardHero —
   * the same renderer the public card uses — draws it immediately; the write
   * boundary refuses to persist a blob URL, so an unaccepted attempt cannot
   * leak into the database.
   */
  async function createCutout() {
    if (!photoUrl) return
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

    // Replace any previous unaccepted attempt so object URLs do not pile up.
    if (isPendingCutout(portrait.cutoutUrl)) URL.revokeObjectURL(portrait.cutoutUrl as string)
    pendingBlob.current = result.blob
    applyCutout(result.url, 'hero')
  }

  /** Accepting uploads the transparent PNG and swaps in its stored URL. */
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
    applyCutout(result.url, 'hero')
  }

  function discardCutout() {
    if (isPendingCutout(portrait.cutoutUrl)) URL.revokeObjectURL(portrait.cutoutUrl as string)
    pendingBlob.current = null
    applyCutout(null, 'classic')
  }

  async function handleCutout(file: File | undefined) {
    if (!file) return
    setError(null)
    setBusy(true)
    const previous = portrait.cutoutUrl
    const result = await uploadCardMedia('cutout', file)
    setBusy(false)

    if ('error' in result) {
      setError(result.error)
      return
    }
    onChange({
      card_media_transforms: {
        ...transforms,
        portrait: { ...portrait, cutoutUrl: result.url, mode: 'hero' },
      },
    })
    if (previous && previous !== result.url) void removeCardMedia(previous)
  }

  function removeCutout() {
    const current = portrait.cutoutUrl
    discardCutout()
    // Only a stored object needs deleting; a pending one never reached storage.
    if (current && !isPendingCutout(current)) void removeCardMedia(current)
  }

  return (
    <div className="rounded-inner border border-abc-border bg-abc-raised p-3.5">
      <p className="text-[13.5px] font-semibold text-abc-text">Portrait style</p>

      <div className="mt-2.5 flex gap-2">
        {(
          [
            { id: 'classic', label: 'Classic', hint: 'Circular portrait' },
            { id: 'hero', label: 'Hero', hint: 'Person composed into the artwork' },
          ] as const
        ).map((option) => {
          const active = mode === option.id
          // Hero stays selectable without a cutout: choosing it is how the
          // owner asks for the setup steps. A permanently greyed-out tab reads
          // as "not for you" rather than "needs one more thing".
          return (
            <button
              key={option.id}
              type="button"
              onClick={() => setMode(option.id)}
              aria-pressed={active}
              title={option.hint}
              className="min-h-[44px] flex-1 rounded-btn border px-3 text-[13px] font-medium transition-colors duration-200 ease-abc disabled:opacity-45 abc-focus-ring"
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
        {/*
          Hero selected without a cutout is a setup state, not an error: the
          owner has chosen the mode and now needs the one thing it requires.
        */}
        {mode === 'hero' && !hasCutout ? (
          <div className="rounded-inner border border-abc-gold-border bg-abc-gold-soft p-3">
            <p className="text-[13px] font-semibold text-abc-gold">
              Hero needs a background-free portrait
            </p>
            <p className="mt-1 text-[12.5px] leading-[1.5] text-abc-secondary">
              Create one from your photo, or upload a portrait that already has its background
              removed.
            </p>
          </div>
        ) : (
          <p className="text-[12.5px] leading-[1.5] text-abc-muted">
            {mode === 'hero'
              ? 'Your portrait sits in front of the cover artwork.'
              : 'Hero style places you in front of your cover, with the background removed.'}
          </p>
        )}

        {/* Progress, never a frozen button. The first run downloads a model. */}
        {busy && progress ? (
          <div className="mt-2.5" role="status" aria-live="polite">
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

        <div className="mt-2.5 flex flex-wrap items-center gap-2">
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
              {busy ? 'Working…' : 'Create cutout'}
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
                {busy ? 'Saving…' : 'Use cutout'}
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
            {hasCutout ? 'Upload instead' : 'Upload cutout'}
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
            Previewing your cutout below. Choose <strong className="font-semibold text-abc-text">Use cutout</strong> to
            keep it — it is not stored until you do.
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
              {/*
                The technical stage stays folded away. An owner never needs to
                read it, but when a device fails in a way we cannot reproduce,
                it is the difference between a bug report and a guess.
              */}
              {errorDetail ? (
                <details className="mt-1.5">
                  <summary className="cursor-pointer text-[11.5px] text-abc-muted">
                    Details
                  </summary>
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
          accept="image/png,image/webp"
          className="sr-only"
          aria-label="Choose a portrait with the background removed"
          onChange={(e) => {
            void handleCutout(e.target.files?.[0])
            e.target.value = ''
          }}
        />
      </div>

      <div className="mt-4">
        <HeroFramingEditor
          label={mode === 'hero' ? 'Position in the hero' : 'Portrait framing'}
          imageUrl={mode === 'hero' && portrait.cutoutUrl ? portrait.cutoutUrl : photoUrl}
          shape={mode === 'hero' ? 'hero' : 'circle'}
          contain={mode === 'hero'}
          theme={theme}
          limits={portraitScaleLimits(mode)}
          transform={portrait}
          onChange={(next) => onChange({ card_media_transforms: { ...transforms, portrait: next } })}
          onReset={() =>
            onChange({
              card_media_transforms: {
                ...transforms,
                // Reset means framing, not the mode or the uploaded cutout.
                portrait: { ...PORTRAIT_TRANSFORM_DEFAULT, mode, cutoutUrl: portrait.cutoutUrl },
              },
            })
          }
        />
      </div>
    </div>
  )
}

/**
 * Cover display.
 *
 * Fill crops the artwork to cover the hero; Fit shows all of it against the
 * card's own background, which is what a wordmark or a poster needs. The
 * nine-point position picker that used to live here is gone: dragging the
 * image in the framing editor below sets the same two numbers directly, and
 * asking an owner to think in "left top" while a live preview sits under
 * their thumb was the worse of the two ways to say it.
 */
function CoverFraming({
  fit,
  onFit,
}: {
  fit: CardCoverFit
  onFit: (value: CardCoverFit) => void
}) {
  return (
    <div className="rounded-inner border border-abc-border bg-abc-raised p-3.5">
      <p className="text-[13.5px] font-semibold text-abc-text">Cover display</p>

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
            onClick={() => onFit(option.id)}
            aria-pressed={fit === option.id}
            title={option.hint}
            className="min-h-[44px] flex-1 rounded-btn border px-3 text-[13px] font-medium transition-colors duration-200 ease-abc abc-focus-ring"
            style={{
              background: fit === option.id ? 'var(--abc-gold-soft)' : 'var(--abc-card)',
              borderColor: fit === option.id ? 'var(--abc-gold-border)' : 'var(--abc-border)',
              color: fit === option.id ? 'var(--abc-gold-accent)' : 'var(--abc-text-secondary)',
            }}
          >
            {option.label}
          </button>
        ))}
      </div>

      <p className="mt-2 text-[12px] leading-[1.45] text-abc-muted">
        {fit === 'fit'
          ? 'The whole cover is shown against your card background.'
          : 'The cover fills the hero. Drag below to choose what stays in frame.'}
      </p>
    </div>
  )
}
