'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { IconCheck, IconCopy, IconDownload, IconX } from '@tabler/icons-react'
import CardQrImage, { cardPublicUrl, cardQrSrc } from '@/components/card/CardQrImage'

type Props = {
  slug: string
  open: boolean
  onClose: () => void
  /** Shown under the QR so the other person knows whose card this is. */
  name?: string | null
  company?: string | null
}

/**
 * Show-QR mode: the screen you hold up at a fair or across a table.
 *
 * Priorities, in order: the QR is large, the contrast is absolute (pure white
 * quiet zone on black), and nothing competes with it. The screen is kept awake
 * while it is open, because this is held up for minutes at a time.
 */
export default function CardQrModal({ slug, open, onClose, name, company }: Props) {
  const [copied, setCopied] = useState(false)
  const closeRef = useRef<HTMLButtonElement>(null)

  const cardUrl = cardPublicUrl(slug)
  const shareUrl = `${cardUrl}?src=qr`

  const copyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(shareUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('[CardQrModal] copy failed:', err)
    }
  }, [shareUrl])

  useEffect(() => {
    if (!open) {
      setCopied(false)
      return
    }
    closeRef.current?.focus()

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    // Keep the screen on while the QR is being shown. Unsupported browsers
    // simply skip this — there is no fallback worth faking.
    let released = false
    let sentinel: { release: () => Promise<void> } | null = null
    const wakeLock = (
      navigator as Navigator & {
        wakeLock?: { request: (type: 'screen') => Promise<{ release: () => Promise<void> }> }
      }
    ).wakeLock

    if (wakeLock) {
      wakeLock
        .request('screen')
        .then((lock) => {
          if (released) void lock.release()
          else sentinel = lock
        })
        .catch(() => {
          /* denied or unsupported — not an error worth surfacing */
        })
    }

    return () => {
      released = true
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = previousOverflow
      void sentinel?.release().catch(() => {})
    }
  }, [open, onClose])

  if (!open || !slug) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Your card QR code"
      className="fixed inset-0 z-[210] flex flex-col"
      style={{ background: '#000000' }}
    >
      <header
        className="flex shrink-0 items-center justify-between px-4"
        style={{ paddingTop: 'calc(0.75rem + env(safe-area-inset-top))', paddingBottom: '0.75rem' }}
      >
        <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-abc-muted">
          ABC Card
        </span>
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          aria-label="Close QR code"
          className="flex h-11 w-11 items-center justify-center rounded-full text-abc-secondary transition-colors hover:text-abc-text abc-focus-ring"
        >
          <IconX size={22} stroke={1.8} />
        </button>
      </header>

      <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-5">
        <CardQrImage slug={slug} width="min(78vw, 380px)" size={1024} />

        <div className="mt-6 max-w-[340px] text-center">
          {name ? (
            <p className="text-[21px] font-bold leading-tight tracking-tight text-abc-text">{name}</p>
          ) : null}
          {company ? (
            <p className="mt-1 text-[14px] text-abc-secondary">{company}</p>
          ) : null}
          <p className="mt-3 break-all text-[12.5px] text-abc-muted">
            {cardUrl.replace(/^https?:\/\//, '')}
          </p>
        </div>
      </div>

      <div
        className="shrink-0 px-5"
        style={{ paddingBottom: 'calc(1.25rem + env(safe-area-inset-bottom))' }}
      >
        <p className="mb-3 text-center text-[12.5px] text-abc-muted">
          Point any phone camera at the code.
        </p>
        <div className="mx-auto flex max-w-[420px] gap-2.5">
          <button
            type="button"
            onClick={() => void copyLink()}
            className="flex h-12 flex-1 items-center justify-center gap-2 rounded-btn border border-abc-border bg-abc-raised text-[14px] font-medium text-abc-text transition-colors hover:border-abc-border-strong abc-focus-ring"
          >
            {copied ? <IconCheck size={17} stroke={1.9} /> : <IconCopy size={17} stroke={1.8} />}
            {copied ? 'Copied' : 'Copy link'}
          </button>
          <a
            href={cardQrSrc(slug, 2048)}
            download={`${slug}-qr.png`}
            className="flex h-12 flex-1 items-center justify-center gap-2 rounded-btn border border-abc-border bg-abc-raised text-[14px] font-medium text-abc-text transition-colors hover:border-abc-border-strong abc-focus-ring"
          >
            <IconDownload size={17} stroke={1.8} />
            Print PNG
          </a>
        </div>
      </div>
    </div>
  )
}
