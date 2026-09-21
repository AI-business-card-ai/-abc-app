'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  IconArrowLeft,
  IconFileText,
  IconGift,
  IconLink,
  IconPhoto,
  IconPlus,
  IconTrash,
  IconVideo,
} from '@tabler/icons-react'
import Button from '@/components/ui/abc/Button'
import { EmptyState, SectionLabel } from '@/components/ui/abc/Bits'
import {
  MEDIA_KINDS,
  MEDIA_KIND_LABEL,
  PHASE_HINT,
  PHASE_LABEL,
  UPLOAD_SUPPORTED,
  firstPartyNotice,
  type EventMaterial,
  type EventPhase,
  type EventProduct,
  type MediaKind,
} from '@/lib/event-intelligence/profile'
import type { IntelEvent } from '@/lib/event-intelligence/types'

/**
 * What this company will show at this fair.
 *
 * Two lists: the products they want to talk about, and the material that backs
 * each one up. Both are the owner's own words about their own company, which
 * the page says once at the top rather than hedging on every card — this is
 * first-party content, not a source fact and not ABC's opinion.
 *
 * Not a website builder. There is no layout, no theme and no page: material is
 * a titled reference with a kind and a moment, and the preview shows the order
 * somebody would see it in.
 */

const KIND_ICON: Record<MediaKind, typeof IconVideo> = {
  video: IconVideo,
  document: IconFileText,
  image: IconPhoto,
  link: IconLink,
  offer: IconGift,
}

type Props = {
  event: IntelEvent
  products: EventProduct[]
  materials: EventMaterial[]
}

export default function SmartProfileView({ event, products, materials }: Props) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [showProduct, setShowProduct] = useState(false)
  const [productName, setProductName] = useState('')
  const [productDescription, setProductDescription] = useState('')

  const [showMaterial, setShowMaterial] = useState(false)
  const [title, setTitle] = useState('')
  const [url, setUrl] = useState('')
  const [kind, setKind] = useState<MediaKind>('video')
  const [phase, setPhase] = useState<EventPhase>('any')
  const [productId, setProductId] = useState('')
  const [description, setDescription] = useState('')

  const input = 'abc-input min-h-[44px] w-full px-3 py-2.5 text-[14px]'

  async function send(path: string, init: RequestInit, onDone: () => void) {
    setBusy(true)
    setError(null)
    try {
      const response = await fetch(path, init)
      const body = await response.json().catch(() => null)
      if (!response.ok) {
        setError(body?.error || 'That could not be saved.')
        return
      }
      onDone()
      router.refresh()
    } catch {
      setError('ABC could not be reached. Check your connection and try again.')
    } finally {
      setBusy(false)
    }
  }

  const json = (payload: unknown): RequestInit => ({
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  return (
    <div className="mx-auto w-full max-w-[760px] abc-page-top px-4 pb-16 sm:px-6 lg:px-8">
      <Link
        href={`/events/intelligence/${event.eventKey}`}
        className="-my-3 inline-flex min-h-[44px] items-center gap-1.5 text-[13px] text-abc-secondary transition-colors hover:text-abc-text abc-focus-ring"
      >
        <IconArrowLeft size={16} stroke={1.8} aria-hidden="true" />
        {event.name}
      </Link>

      <header className="mt-4">
        <SectionLabel>Your event profile</SectionLabel>
        <h1 className="mt-2 text-[26px] font-bold leading-tight tracking-tight text-abc-text lg:text-[32px]">
          What you will show at {event.name}
        </h1>
        <p className="mt-1.5 max-w-[58ch] text-[14px] leading-[1.6] text-abc-secondary">
          The products you want to talk about, and the material that backs them up. Prepared for
          this edition only — nothing carries over from another year unless you add it again.
        </p>
        <p className="mt-2 text-[12px] leading-[1.55] text-abc-muted">{firstPartyNotice}</p>
      </header>

      {/* ── Products ── */}
      <section className="abc-surface mt-6 p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SectionLabel>Products and solutions</SectionLabel>
          <button
            type="button"
            onClick={() => setShowProduct((open) => !open)}
            className="touch-target inline-flex min-h-[44px] items-center gap-1.5 text-[13px] font-medium text-abc-secondary transition-colors hover:text-abc-text abc-focus-ring"
          >
            <IconPlus size={15} stroke={1.9} aria-hidden="true" />
            {showProduct ? 'Cancel' : 'Add a product'}
          </button>
        </div>

        {showProduct ? (
          <div className="mt-4 flex flex-col gap-3">
            <label className="block">
              <span className="block text-[13px] font-semibold text-abc-text">Name</span>
              <input
                className={`${input} mt-2`}
                value={productName}
                onChange={(e) => setProductName(e.target.value)}
                placeholder="Precision aluminium housings"
              />
            </label>
            <label className="block">
              <span className="block text-[13px] font-semibold text-abc-text">What it is</span>
              <textarea
                className="abc-input w-full px-3 py-2.5 text-[14px] leading-[1.55]"
                rows={2}
                value={productDescription}
                onChange={(e) => setProductDescription(e.target.value)}
                placeholder="Machined housings for electric motors and robotic systems."
              />
            </label>
            <div>
              <Button
                onClick={() =>
                  send(
                    '/api/event-intelligence/products',
                    json({ name: productName, description: productDescription }),
                    () => {
                      setProductName('')
                      setProductDescription('')
                      setShowProduct(false)
                    }
                  )
                }
                disabled={busy || !productName.trim()}
              >
                {busy ? 'Saving…' : 'Add product'}
              </Button>
            </div>
          </div>
        ) : null}

        {products.length === 0 ? (
          <p className="mt-4 text-[13.5px] leading-[1.55] text-abc-secondary">
            Nothing yet. A product is what you want a conversation to be about — you can attach
            material to it, and pick it when you prepare a meeting.
          </p>
        ) : (
          <ul className="mt-4 flex flex-col gap-2">
            {products.map((product) => (
              <li
                key={product.id}
                className="flex items-start justify-between gap-3 rounded-btn border border-abc-border p-3"
              >
                <span className="min-w-0">
                  <span className="block truncate text-[14px] font-semibold text-abc-text">
                    {product.name}
                  </span>
                  {product.description ? (
                    <span className="mt-0.5 block text-[12.5px] leading-[1.5] text-abc-secondary">
                      {product.description}
                    </span>
                  ) : null}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    send(
                      `/api/event-intelligence/products?id=${encodeURIComponent(product.id)}`,
                      { method: 'DELETE' },
                      () => undefined
                    )
                  }
                  disabled={busy}
                  aria-label={`Remove ${product.name}`}
                  className="touch-target inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-btn border border-abc-border text-abc-muted transition-colors hover:border-abc-border-strong hover:text-abc-text disabled:opacity-45 abc-focus-ring"
                >
                  <IconTrash size={16} stroke={1.7} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── Material ── */}
      <section className="abc-surface mt-4 p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SectionLabel>Material for this edition</SectionLabel>
          <button
            type="button"
            onClick={() => setShowMaterial((open) => !open)}
            className="touch-target inline-flex min-h-[44px] items-center gap-1.5 text-[13px] font-medium text-abc-secondary transition-colors hover:text-abc-text abc-focus-ring"
          >
            <IconPlus size={15} stroke={1.9} aria-hidden="true" />
            {showMaterial ? 'Cancel' : 'Add material'}
          </button>
        </div>

        {showMaterial ? (
          <div className="mt-4 flex flex-col gap-3">
            <label className="block">
              <span className="block text-[13px] font-semibold text-abc-text">Title</span>
              <input
                className={`${input} mt-2`}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="20-second housings teaser"
              />
            </label>

            <div className="flex flex-wrap gap-3">
              <label className="block min-w-0 flex-1">
                <span className="block text-[13px] font-semibold text-abc-text">Kind</span>
                <select
                  className={`${input} mt-2`}
                  value={kind}
                  onChange={(e) => setKind(e.target.value as MediaKind)}
                >
                  {MEDIA_KINDS.map((option) => (
                    <option key={option} value={option}>
                      {MEDIA_KIND_LABEL[option]}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block min-w-0 flex-1">
                <span className="block text-[13px] font-semibold text-abc-text">When to show it</span>
                <select
                  className={`${input} mt-2`}
                  value={phase}
                  onChange={(e) => setPhase(e.target.value as EventPhase)}
                >
                  {(['any', 'pre', 'live', 'post'] as EventPhase[]).map((option) => (
                    <option key={option} value={option}>
                      {PHASE_LABEL[option]}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <p className="text-[12px] leading-[1.5] text-abc-muted">{PHASE_HINT[phase]}</p>

            <label className="block">
              <span className="block text-[13px] font-semibold text-abc-text">Web address</span>
              <span className="mt-0.5 block text-[12px] leading-[1.5] text-abc-muted">
                {UPLOAD_SUPPORTED[kind]
                  ? 'An image already in ABC, or any web address.'
                  : `ABC stores images only, so link to the ${MEDIA_KIND_LABEL[kind].toLowerCase()} where it already lives — your site, your drive, wherever it is hosted.`}
              </span>
              <input
                className={`${input} mt-2`}
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://example.com/housings-teaser"
                inputMode="url"
              />
            </label>

            {products.length > 0 ? (
              <label className="block">
                <span className="block text-[13px] font-semibold text-abc-text">
                  About which product
                </span>
                <select
                  className={`${input} mt-2`}
                  value={productId}
                  onChange={(e) => setProductId(e.target.value)}
                >
                  <option value="">Not product-specific</option>
                  {products.map((product) => (
                    <option key={product.id} value={product.id}>
                      {product.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}

            <label className="block">
              <span className="block text-[13px] font-semibold text-abc-text">Description</span>
              <textarea
                className="abc-input w-full px-3 py-2.5 text-[14px] leading-[1.55]"
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What somebody sees in it."
              />
            </label>

            <div>
              <Button
                onClick={() =>
                  send(
                    '/api/event-intelligence/materials',
                    json({
                      eventKey: event.eventKey,
                      title,
                      url,
                      mediaKind: kind,
                      phase,
                      productId: productId || null,
                      description,
                    }),
                    () => {
                      setTitle('')
                      setUrl('')
                      setDescription('')
                      setProductId('')
                      setShowMaterial(false)
                    }
                  )
                }
                disabled={busy || !title.trim() || !url.trim()}
              >
                {busy ? 'Saving…' : 'Add material'}
              </Button>
            </div>
          </div>
        ) : null}

        {materials.length === 0 ? (
          <div className="mt-2">
            <EmptyState
              icon={IconVideo}
              title="No material for this edition yet."
              description="A short video, a brochure, a datasheet, an offer — whatever you would actually show somebody at the stand."
            />
          </div>
        ) : (
          <ul className="mt-4 flex flex-col gap-2">
            {materials.map((material) => {
              const Icon = KIND_ICON[material.mediaKind]
              const product = products.find((entry) => entry.id === material.productId)
              return (
                <li
                  key={material.id}
                  className="flex items-start justify-between gap-3 rounded-btn border border-abc-border p-3"
                >
                  <span className="flex min-w-0 items-start gap-2.5">
                    <Icon
                      size={17}
                      stroke={1.7}
                      aria-hidden="true"
                      className="mt-0.5 shrink-0 text-abc-muted"
                    />
                    <span className="min-w-0">
                      <span className="block truncate text-[14px] font-semibold text-abc-text">
                        {material.title}
                      </span>
                      <span className="mt-0.5 block text-[12px] text-abc-muted">
                        {MEDIA_KIND_LABEL[material.mediaKind]} · {PHASE_LABEL[material.phase]}
                        {product ? ` · ${product.name}` : ''}
                      </span>
                      {material.description ? (
                        <span className="mt-1 block text-[12.5px] leading-[1.5] text-abc-secondary">
                          {material.description}
                        </span>
                      ) : null}
                      <span className="mt-1 block break-all text-[12px] text-abc-muted">
                        {material.url}
                      </span>
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      send(
                        `/api/event-intelligence/materials?id=${encodeURIComponent(material.id)}`,
                        { method: 'DELETE' },
                        () => undefined
                      )
                    }
                    disabled={busy}
                    aria-label={`Remove ${material.title}`}
                    className="touch-target inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-btn border border-abc-border text-abc-muted transition-colors hover:border-abc-border-strong hover:text-abc-text disabled:opacity-45 abc-focus-ring"
                  >
                    <IconTrash size={16} stroke={1.7} aria-hidden="true" />
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {error ? (
        <p className="mt-4 text-[13px] leading-[1.55]" style={{ color: 'var(--abc-overdue)' }} role="alert">
          {error}
        </p>
      ) : null}

      <p className="mt-8 text-[12px] leading-[1.6] text-abc-muted">
        ABC stores a reference, not a copy: material stays wherever you host it. Nothing here is
        published anywhere until you share it with somebody yourself.
      </p>
    </div>
  )
}
