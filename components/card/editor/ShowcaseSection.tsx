'use client'

import { useRef, useState } from 'react'
import {
  IconAlertTriangle,
  IconArrowDown,
  IconArrowUp,
  IconPhotoPlus,
  IconTrash,
} from '@tabler/icons-react'
import { Field, Toggle } from '@/components/card/editor/EditorPrimitives'
import { removeCardMedia, uploadCardMedia } from '@/lib/card/media'
import {
  SHOWCASE_CAPTION_MAX,
  SHOWCASE_ITEM_TYPES,
  SHOWCASE_MAX_ITEMS,
  SHOWCASE_TITLE_MAX,
  SHOWCASE_TITLE_SUGGESTIONS,
  type ShowcaseItem,
  type ShowcaseItemType,
} from '@/lib/card/showcase'

/**
 * Showcase editing.
 *
 * Reorder is buttons, not drag-and-drop: the gallery has at most eight tiles,
 * the owner is usually on a phone at a stand, and a Move up that always works
 * beats a drag that sometimes fights the page scroll. Order is positional —
 * sort_order is rewritten from the array on save, so it can never drift.
 */
export default function ShowcaseSection({
  enabled,
  title,
  items,
  userId,
  onToggle,
  onTitle,
  onItems,
}: {
  enabled: boolean
  title: string
  items: ShowcaseItem[]
  userId: string
  onToggle: (next: boolean) => void
  onTitle: (next: string) => void
  onItems: (next: ShowcaseItem[]) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const full = items.length >= SHOWCASE_MAX_ITEMS

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return
    setError(null)

    // Multi-select is allowed, but only up to the remaining room — picking six
    // when two slots are left should fill two, not fail eight times.
    const room = SHOWCASE_MAX_ITEMS - items.length
    if (room <= 0) {
      setError(`Maximum ${SHOWCASE_MAX_ITEMS} images.`)
      return
    }
    const chosen = Array.from(files).slice(0, room)
    const skipped = files.length - chosen.length

    setUploading(true)
    const added: ShowcaseItem[] = []
    let failure: string | null = null

    for (const file of chosen) {
      const result = await uploadCardMedia('showcase', file)
      if ('error' in result) {
        failure = result.error
        break
      }
      added.push({
        // crypto.randomUUID is what the links and events editors already use
        // for optimistic rows, so the id is stable before the row exists.
        id: crypto.randomUUID(),
        user_id: userId,
        image_url: result.url,
        caption: null,
        item_type: 'other',
        sort_order: items.length + added.length,
      })
    }

    setUploading(false)
    if (added.length) onItems([...items, ...added])
    if (failure) setError(failure)
    else if (skipped > 0) {
      setError(`Only ${chosen.length} added — maximum ${SHOWCASE_MAX_ITEMS} images.`)
    }
  }

  function patchItem(id: string, patch: Partial<ShowcaseItem>) {
    onItems(items.map((item) => (item.id === id ? { ...item, ...patch } : item)))
  }

  function removeItem(item: ShowcaseItem) {
    onItems(items.filter((i) => i.id !== item.id))
    // The row is gone from the card the moment the owner saves; the object is
    // best-effort, exactly as a replaced cover image already is.
    if (item.image_url) void removeCardMedia(item.image_url)
  }

  function move(index: number, direction: -1 | 1) {
    const target = index + direction
    if (target < 0 || target >= items.length) return
    const next = items.slice()
    const [moved] = next.splice(index, 1)
    next.splice(target, 0, moved)
    onItems(next)
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[14px] font-semibold text-abc-text">Show on my card</p>
          <p className="mt-0.5 text-[12.5px] leading-[1.45] text-abc-muted">
            {enabled
              ? 'Your gallery appears on your public card.'
              : 'Your gallery is hidden. Your images are kept.'}
          </p>
        </div>
        <Toggle label="Showcase" checked={enabled} onChange={onToggle} />
      </div>

      <div>
        <Field
          label="Section title"
          value={title}
          onChange={onTitle}
          placeholder="My work"
          maxLength={SHOWCASE_TITLE_MAX}
          hint="Shown above your images. Leave empty for “My work”."
        />
        <div className="mt-2 flex flex-wrap gap-1.5">
          {SHOWCASE_TITLE_SUGGESTIONS.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              onClick={() => onTitle(suggestion)}
              className="min-h-[36px] rounded-full border border-abc-border bg-abc-raised px-3 text-[12px] font-medium text-abc-secondary transition-colors duration-200 ease-abc hover:text-abc-text abc-focus-ring"
            >
              {suggestion}
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-[13px] font-semibold text-abc-text">Images</p>
          <p className="text-[12px] tabular-nums text-abc-secondary" aria-live="polite">
            {items.length} / {SHOWCASE_MAX_ITEMS}
          </p>
        </div>

        {items.length > 0 ? (
          <ul className="mt-3 flex flex-col gap-3">
            {items.map((item, index) => (
              <li
                key={item.id}
                className="rounded-inner border border-abc-border bg-abc-raised p-3"
              >
                <div className="flex gap-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={item.image_url}
                    alt=""
                    className="h-[76px] w-[76px] shrink-0 rounded-inner border border-abc-border object-cover"
                  />

                  <div className="min-w-0 flex-1">
                    <label className="sr-only" htmlFor={`caption-${item.id}`}>
                      Caption for image {index + 1}
                    </label>
                    <input
                      id={`caption-${item.id}`}
                      type="text"
                      value={item.caption || ''}
                      maxLength={SHOWCASE_CAPTION_MAX}
                      placeholder="Caption (optional)"
                      onChange={(e) => patchItem(item.id, { caption: e.target.value })}
                      className="w-full rounded-inner border border-abc-border bg-abc-card px-3 py-2 text-[16px] text-abc-text placeholder:text-abc-muted focus:border-abc-gold-border focus:outline-none"
                    />

                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <label className="sr-only" htmlFor={`type-${item.id}`}>
                        Type for image {index + 1}
                      </label>
                      <select
                        id={`type-${item.id}`}
                        value={item.item_type}
                        onChange={(e) =>
                          patchItem(item.id, { item_type: e.target.value as ShowcaseItemType })
                        }
                        className="min-h-[40px] rounded-inner border border-abc-border bg-abc-card px-2.5 text-[13px] text-abc-secondary focus:border-abc-gold-border focus:outline-none"
                      >
                        {SHOWCASE_ITEM_TYPES.map((type) => (
                          <option key={type.id} value={type.id}>
                            {type.label}
                          </option>
                        ))}
                      </select>

                      <div className="ml-auto flex items-center gap-1">
                        <IconButton
                          label={`Move image ${index + 1} up`}
                          disabled={index === 0}
                          onClick={() => move(index, -1)}
                        >
                          <IconArrowUp size={16} stroke={1.8} />
                        </IconButton>
                        <IconButton
                          label={`Move image ${index + 1} down`}
                          disabled={index === items.length - 1}
                          onClick={() => move(index, 1)}
                        >
                          <IconArrowDown size={16} stroke={1.8} />
                        </IconButton>
                        <IconButton
                          label={`Remove image ${index + 1}`}
                          onClick={() => removeItem(item)}
                        >
                          <IconTrash size={16} stroke={1.8} />
                        </IconButton>
                      </div>
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-[12.5px] leading-[1.5] text-abc-muted">
            No images yet. Add photos of your projects, products or installations.
          </p>
        )}

        <div className="mt-3">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={full || uploading}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-btn border border-abc-border bg-abc-raised px-3.5 text-[13.5px] font-medium text-abc-text transition-colors duration-200 ease-abc hover:border-abc-border-strong disabled:opacity-50 abc-focus-ring"
          >
            <IconPhotoPlus size={17} stroke={1.8} />
            {uploading ? 'Uploading…' : 'Add image'}
          </button>

          {full ? (
            <p className="mt-2 text-[12px] text-abc-muted">
              Maximum {SHOWCASE_MAX_ITEMS} images. Remove one to add another.
            </p>
          ) : null}

          <div aria-live="polite">
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
          </div>
        </div>

        <input
          ref={inputRef}
          type="file"
          multiple
          accept="image/jpeg,image/png,image/webp,image/heic,image/heif,image/*"
          className="sr-only"
          aria-label="Choose showcase images"
          onChange={(e) => {
            void handleFiles(e.target.files)
            e.target.value = ''
          }}
        />
      </div>

      <p className="text-[12px] leading-[1.5] text-abc-muted">
        Showcase images are visible to anyone who can view your public card.
      </p>
    </div>
  )
}

function IconButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string
  onClick: () => void
  disabled?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="inline-flex h-[40px] w-[40px] items-center justify-center rounded-btn border border-abc-border bg-abc-card text-abc-secondary transition-colors duration-200 ease-abc hover:text-abc-text disabled:opacity-35 abc-focus-ring"
    >
      {children}
    </button>
  )
}
