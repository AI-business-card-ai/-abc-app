'use client'

import { useEffect, useRef } from 'react'
import { IconX } from '@tabler/icons-react'
import Button from '@/components/ui/abc/Button'
import { useNativeBackHandler } from '@/lib/native/back-handlers'

/**
 * What Expo Mission will do — information only.
 *
 * A sheet rather than a page, for the same reason the follow-up composer is
 * one: it is a short read that belongs beside the dashboard, and sending
 * somebody to a route for it would mean a back button, a title bar and a
 * second place for the navigation to grow. It closes, and they are where they
 * were.
 *
 * Nothing here starts anything. There is no "build my mission", no import, no
 * link into Event Intelligence — that feature is unreleased and stays behind
 * its server-side flag. Every verb about it is in the future tense, because
 * none of it is available yet.
 */

/** One future step. The example event is invented on purpose — see the note below. */
const STEPS: { title: string; body: string }[] = [
  {
    title: 'Tell ABC where you are going',
    /*
      A made-up fair, not a real one. Naming a real trade fair beside "ABC
      will find the companies worth your time" reads as an integration that
      does not exist, and no organiser has agreed to anything.
    */
    body: 'For example: Example Expo 2027.',
  },
  {
    title: 'Tell ABC what you sell and what you are looking for',
    body: 'Customers, suppliers, distributors or partners.',
  },
  {
    title: 'ABC will find the companies worth your time',
    body: 'See who may matter, where to find them and why they may be relevant.',
  },
  {
    title: 'Prepare the right conversation',
    body: 'Know what to discuss, which product to show and which material to use.',
  },
  {
    title: 'Meet. Scan. Remember. Follow up.',
    body: 'Your mission continues into the ABC you already use — and into your CRM.',
  },
]

export default function ExpoMissionInfo({ onClose }: { onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null)

  useNativeBackHandler(true, onClose)

  useEffect(() => {
    closeRef.current?.focus()

    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)

    return () => {
      document.body.style.overflow = previous
      document.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-[120] flex items-end justify-center sm:items-center sm:p-6"
      style={{ background: 'rgba(4,4,5,0.72)' }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="expo-mission-info-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className="flex max-h-[92vh] w-full max-w-[560px] flex-col overflow-hidden rounded-t-card border border-abc-border bg-abc-card sm:max-h-[86vh] sm:rounded-card"
        style={{ boxShadow: 'var(--abc-shadow-raised)' }}
      >
        <div className="flex items-start gap-3 border-b border-abc-border p-4 sm:p-5">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-abc-muted">
              Expo Mission — coming soon
            </p>
            <h2
              id="expo-mission-info-title"
              className="mt-1.5 text-[20px] font-bold leading-tight tracking-tight text-abc-text sm:text-[23px]"
            >
              Your event. Your mission.
              <br />
              ABC guides the next step.
            </h2>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-abc-muted transition-colors hover:bg-abc-raised hover:text-abc-text abc-focus-ring"
          >
            <IconX size={19} stroke={1.9} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
          <p className="text-[13.5px] leading-[1.6] text-abc-secondary">
            Expo Mission is not available yet. Here is what it will do.
          </p>

          <ol className="mt-4 flex flex-col gap-4">
            {STEPS.map((step, index) => (
              <li key={step.title} className="flex gap-3">
                <span
                  aria-hidden="true"
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[12.5px] font-bold"
                  style={{ background: 'var(--abc-gold-soft)', color: 'var(--abc-gold-accent)' }}
                >
                  {index + 1}
                </span>
                <span className="min-w-0">
                  <span className="block text-[14.5px] font-semibold leading-snug text-abc-text">
                    {step.title}
                  </span>
                  <span className="mt-1 block text-[13.5px] leading-[1.6] text-abc-secondary">
                    {step.body}
                  </span>
                </span>
              </li>
            ))}
          </ol>

          <p className="mt-5 border-t border-abc-border pt-4 text-[14px] font-semibold leading-[1.6] text-abc-text">
            Find the right company. Show the right product. Start the right conversation.
          </p>
          <p className="mt-2 text-[12.5px] leading-[1.55] text-abc-muted">
            ABC Expo Mission — coming soon. Today ABC covers the handshake onwards: scan, remember,
            follow up and send it to your CRM.
          </p>
        </div>

        <div
          className="border-t border-abc-border p-4 sm:p-5"
          style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))' }}
        >
          <Button onClick={onClose} variant="surface" size="lg" fullWidth>
            Got it
          </Button>
        </div>
      </div>
    </div>
  )
}
