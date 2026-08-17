'use client'

import { useRef, useState } from 'react'
import { IconAlertTriangle, IconCheck, IconPhotoPlus, IconTrash, IconUpload } from '@tabler/icons-react'
import { CARD_MEDIA_LABELS, removeCardMedia, uploadCardMedia, type CardMediaKind } from '@/lib/card/media'
import { initialsFromName } from '@/lib/card/theme'
import HeroFramingEditor from '@/components/card/editor/HeroFramingEditor'
import {
  BACKGROUND_TRANSFORM_DEFAULT,
  COVER_POSITIONS_X,
  COVER_POSITIONS_Y,
  PORTRAIT_TRANSFORM_DEFAULT,
  type CardCoverFit,
  type CardMediaTransforms,
  type CardTheme,
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
  const [state, setState] = useState<Record<CardMediaKind, MediaState>>({
    photo: { status: 'idle' },
    cover: { status: 'idle' },
    logo: { status: 'idle' },
  })

  const urls: Record<CardMediaKind, string> = {
    photo: photoUrl,
    cover: coverUrl,
    logo: logoUrl,
  }

  function applyUrl(kind: CardMediaKind, url: string) {
    if (kind === 'photo') onChange({ card_photo_url: url })
    else if (kind === 'cover') onChange({ card_cover_url: url })
    else onChange({ company_logo_url: url })
  }

  async function handleFile(kind: CardMediaKind, file: File | undefined) {
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

  function handleRemove(kind: CardMediaKind) {
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
          {coverFit === 'fill' ? (
            <HeroFramingEditor
              label="Background framing"
              imageUrl={coverUrl}
              theme={theme}
              transform={transforms.background}
              onChange={(background) => onChange({ card_media_transforms: { ...transforms, background } })}
              onReset={() =>
                onChange({
                  card_media_transforms: { ...transforms, background: BACKGROUND_TRANSFORM_DEFAULT },
                })
              }
            />
          ) : null}
          <CoverFraming
            position={coverPosition}
            fit={coverFit}
            onPosition={(card_cover_position) => onChange({ card_cover_position })}
            onFit={(card_cover_fit) => onChange({ card_cover_fit })}
          />
        </>
      ) : null}

      {photoUrl ? (
        <HeroFramingEditor
          label="Portrait framing"
          imageUrl={photoUrl}
          shape="circle"
          transform={transforms.portrait}
          onChange={(portrait) => onChange({ card_media_transforms: { ...transforms, portrait } })}
          onReset={() =>
            onChange({ card_media_transforms: { ...transforms, portrait: PORTRAIT_TRANSFORM_DEFAULT } })
          }
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
  kind: CardMediaKind
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
  kind: CardMediaKind
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
 * Cover framing. object-fit: cover keeps the middle of the image and throws
 * the rest away, which ruins a branded header whose wordmark sits off-centre.
 * "Fit" shows the whole image on the card background instead, and the position
 * picker chooses which part survives when filling.
 */
function CoverFraming({
  position,
  fit,
  onPosition,
  onFit,
}: {
  position: string
  fit: CardCoverFit
  onPosition: (value: string) => void
  onFit: (value: CardCoverFit) => void
}) {
  const [x, y] = position.split(' ')

  return (
    <div className="rounded-inner border border-abc-border bg-abc-raised p-3.5">
      <p className="text-[13.5px] font-semibold text-abc-text">Cover framing</p>

      <fieldset className="mt-3">
        <legend className="text-[12px] text-abc-muted">Fit</legend>
        <div className="mt-1.5 flex gap-2">
          {(
            [
              { id: 'fill', label: 'Fill', hint: 'Crops to fill the header' },
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
      </fieldset>

      {fit === 'fill' ? (
        <>
          <fieldset className="mt-3.5">
            <legend className="text-[12px] text-abc-muted">Vertical</legend>
            <div className="mt-1.5 flex gap-2">
              {COVER_POSITIONS_Y.map((value) => (
                <PositionButton
                  key={value}
                  label={value}
                  active={y === value}
                  onClick={() => onPosition(`${x} ${value}`)}
                />
              ))}
            </div>
          </fieldset>

          <fieldset className="mt-3">
            <legend className="text-[12px] text-abc-muted">Horizontal</legend>
            <div className="mt-1.5 flex gap-2">
              {COVER_POSITIONS_X.map((value) => (
                <PositionButton
                  key={value}
                  label={value}
                  active={x === value}
                  onClick={() => onPosition(`${value} ${y}`)}
                />
              ))}
            </div>
          </fieldset>
        </>
      ) : (
        <p className="mt-3 text-[12px] leading-[1.45] text-abc-muted">
          The whole cover is shown, letterboxed against your card background.
        </p>
      )}
    </div>
  )
}

function PositionButton({
  label,
  active,
  onClick,
}: {
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className="min-h-[44px] flex-1 rounded-btn border px-2 text-[13px] font-medium capitalize transition-colors duration-200 ease-abc abc-focus-ring"
      style={{
        background: active ? 'var(--abc-gold-soft)' : 'var(--abc-card)',
        borderColor: active ? 'var(--abc-gold-border)' : 'var(--abc-border)',
        color: active ? 'var(--abc-gold-accent)' : 'var(--abc-text-secondary)',
      }}
    >
      {label}
    </button>
  )
}
