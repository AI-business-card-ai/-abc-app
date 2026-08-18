'use client'

import { useRef, useState } from 'react'
import { IconAlertTriangle, IconCheck, IconPhotoPlus, IconTrash, IconUpload } from '@tabler/icons-react'
import {
  CARD_MEDIA_LABELS,
  removeCardMedia,
  uploadCardMedia,
  type CardProfileMediaKind,
} from '@/lib/card/media'
import { initialsFromName } from '@/lib/card/theme'
import CustomizeHero from '@/components/card/editor/CustomizeHero'
import type {
  CardCoverFit,
  CardMediaTransforms,
  CardTheme,
  DigitalCardData,
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
  previewCard,
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
  /** Live card built from unsaved editor state, for the composition preview. */
  previewCard: DigitalCardData
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

      <p className="text-[12px] leading-[1.5] text-abc-muted">
        JPG, PNG or WebP, up to 10 MB. Large photos are resized before upload.
      </p>

      {/*
        Composition lives in one place below the uploads. Replacing an image is
        a different job from designing with it, and mixing the two is what made
        the same background transform reachable from three separate boxes.
      */}
      <div className="border-t border-abc-border pt-5">
        <p className="text-[14px] font-semibold text-abc-text">Customize hero</p>
        <p className="mt-0.5 text-[12.5px] leading-[1.45] text-abc-muted">
          Arrange how your card looks when someone scans it.
        </p>
        <div className="mt-3.5">
          <CustomizeHero
            card={previewCard}
            transforms={transforms}
            photoUrl={photoUrl}
            coverUrl={coverUrl}
            logoUrl={logoUrl}
            coverFit={coverFit}
            theme={theme}
            onChange={onChange}
          />
        </div>
      </div>
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
