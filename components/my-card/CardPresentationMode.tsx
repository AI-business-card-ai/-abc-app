'use client'

import { useEffect, useRef } from 'react'
import { IconQrcode, IconX } from '@tabler/icons-react'
import CompactCardPreview from '@/components/card/CompactCardPreview'
import type { DigitalCardData } from '@/lib/card/types'
import { SAFE_TOP } from '@/lib/ui/layout'

/**
 * Hold-it-up mode for the finished card.
 *
 * The My Card screen is a page about a card: a heading, the card, buttons,
 * a link, some numbers. Across a table at a fair, all of that is noise — the
 * other person needs to see the card, and then the QR. This drops the chrome
 * and leaves the two.
 *
 * Deliberately thin. The card is the same `CompactCardPreview` the page and the
 * editor render, and the QR is the same `CardQrModal` the page already owns —
 * this component does not draw either, it only clears the space around them.
 * There is no new data here and no second copy of anything.
 */
export default function CardPresentationMode({
  card,
  open,
  onClose,
  onShowQr,
}: {
  card: DigitalCardData
  open: boolean
  onClose: () => void
  onShowQr: () => void
}) {
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return

    closeRef.current?.focus()

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)

    // The page behind must not scroll while a fullscreen surface is up.
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = previousOverflow
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Your card, full screen"
      className="fixed inset-0 z-[200] flex flex-col bg-abc-bg"
    >
      <div
        className="flex items-center justify-end px-4 pb-2"
        style={{ paddingTop: `calc(0.75rem + ${SAFE_TOP})` }}
      >
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          aria-label="Close presentation"
          className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-abc-border bg-abc-raised text-abc-secondary transition-colors hover:text-abc-text abc-focus-ring"
        >
          <IconX size={20} stroke={1.9} />
        </button>
      </div>

      <div className="flex min-h-0 flex-1 items-center justify-center px-5">
        <div className="w-full max-w-[420px]">
          <CompactCardPreview card={card} size="large" />
        </div>
      </div>

      <div
        className="px-5 pt-3"
        style={{ paddingBottom: 'calc(1.25rem + env(safe-area-inset-bottom))' }}
      >
        <button
          type="button"
          onClick={onShowQr}
          className="inline-flex h-[52px] w-full items-center justify-center gap-2 rounded-btn bg-abc-gold px-5 text-[15px] font-semibold text-[#1a1205] transition-[filter] duration-200 ease-abc hover:brightness-[1.06] abc-focus-ring"
        >
          <IconQrcode size={20} stroke={1.8} />
          Show QR code
        </button>
      </div>
    </div>
  )
}
