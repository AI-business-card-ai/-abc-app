'use client'

import { useEffect, useRef } from 'react'
import { IconX } from '@tabler/icons-react'
import CardQrImage from '@/components/card/CardQrImage'
import DigitalCardView from '@/components/card/DigitalCardView'
import InertContent from '@/components/ui/InertContent'
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
 * Deliberately thin. The card is the same `DigitalCardView` the public URL and
 * the editor preview render, and the QR is the same server-drawn image the
 * fullscreen modal shows — this component draws neither, it only clears the
 * space around them. There is no new data here and no second copy of anything.
 *
 * Its insets are in pixels rather than rems. The root font-size drops to 14px
 * on phones, and a phone is the one device where clearing the Dynamic Island
 * and the home indicator actually matters.
 */
export default function CardPresentationMode({
  card,
  open,
  covered = false,
  onClose,
  onShowQr,
}: {
  card: DigitalCardData
  open: boolean
  /** The QR is on top of this. It owns Escape while it is. */
  covered?: boolean
  onClose: () => void
  onShowQr: () => void
}) {
  const closeRef = useRef<HTMLButtonElement>(null)

  /*
    Scroll lock, for as long as this is open — including while the QR sits on
    top of it, because the page behind both still must not move. Deliberately
    keyed on `open` alone: tying it to `covered` would tear the lock down and
    rebuild it every time the QR opened, for no gain.
  */
  useEffect(() => {
    if (!open) return

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [open])

  /*
    Escape belongs to whatever is on top.

    Both this and the QR modal listen on `document`, so a single Escape used to
    reach both and collapse the whole stack at once — one keypress took you from
    the QR all the way back to the page, skipping the card you were presenting.
    While the QR is up it owns the key; this only listens once it is topmost
    again, which is also the moment to take focus back.
  */
  useEffect(() => {
    if (!open || covered) return

    closeRef.current?.focus()

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)

    return () => {
      document.removeEventListener('keydown', onKey)
    }
  }, [open, covered, onClose])

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
        style={{ paddingTop: `calc(12px + ${SAFE_TOP})` }}
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

      {/*
        The real card, scrolling.

        This used to render CompactCardPreview, which is documented as "a small,
        honest stand-in" — it line-clamps the tagline, draws a dead "Save
        contact" rectangle, and reduces a showcase to the sentence "Portfolio ·
        8 images". Fine on a dashboard that is only being glanced at; wrong on
        the screen you hand to somebody, where the whole point is that they see
        the finished card. DigitalCardView is what the public URL and the
        editor's preview both render, so this shows exactly what the other
        person would get.

        A real card can be taller than a phone, so the surface scrolls rather
        than centring a fixed block and cropping the rest.
      */}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5">
        <div className="mx-auto w-full max-w-[420px] pb-2">
          {/*
            The QR comes first.

            It used to sit under the card, which was fine for a sparse profile
            and wrong for a full one: an owner with socials, events, a showcase
            and an About section had to scroll their whole card before the other
            person could scan anything. This screen has two jobs and they are
            not equal in urgency — somebody scans in seconds, and reads the
            profile only if they choose to. So the scan comes first and the card
            continues below it.

            Outside InertContent deliberately: this is the one thing here that
            is meant to be tapped.
          */}
          {card.slug ? (
            <section className="flex flex-col items-center pb-2">
              <p className="text-[13px] font-medium text-abc-secondary">Scan to connect</p>

              <button
                type="button"
                onClick={onShowQr}
                aria-label="Enlarge QR code"
                className="mt-3 rounded-[20px] abc-focus-ring"
              >
                <CardQrImage slug={card.slug} width="min(62vw, 260px)" size={512} />
              </button>

              <p className="mt-3 text-[12px] text-abc-muted">Tap QR to enlarge</p>
            </section>
          ) : null}

          {/*
            Display-only, and below the QR. The card is the real one, with the
            real controls, and on this screen none of them should fire: the
            phone is being held out to somebody else, and a stray thumb landing
            on "Save contact" or a social link would download the owner's own
            vCard or navigate away mid-conversation. The wrapper makes the
            subtree inert rather than the renderer — the public card at
            /d/<slug> keeps every one of these behaviours, which is what the
            person scanning the QR above actually receives.
          */}
          <div className={card.slug ? 'mt-7' : ''}>
            <InertContent>
              <DigitalCardView card={card} preview />
            </InertContent>
          </div>

          <div style={{ height: 'calc(20px + env(safe-area-inset-bottom))' }} aria-hidden />
        </div>
      </div>
    </div>
  )
}