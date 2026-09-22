'use client'

import { useRef, useState } from 'react'
import { IconRoute } from '@tabler/icons-react'
import Button from '@/components/ui/abc/Button'
import ExpoMissionInfo from '@/components/expo-mission/ExpoMissionInfo'

/**
 * Expo Mission, on the dashboard, as a promise rather than a feature.
 *
 * ABC today is the handshake onwards: scan, remember, follow up, CRM. Expo
 * Mission is the layer before the handshake, and it is not built for anybody
 * yet — so this is a teaser and says so, in the badge, in the button and in
 * the sheet it opens.
 *
 * ## What this deliberately is not
 *
 * It is **not** the Event Intelligence feature, and it shares nothing with it.
 * It reads no intelligence table, calls no intelligence route, links to no
 * intelligence page, and needs no migration that the release database has not
 * had. It renders from constants. That is what makes it safe to ship while the
 * real thing stays behind `ABC_EVENT_INTELLIGENCE`, which is off.
 *
 * ## Replacing it later
 *
 * When Event Intelligence ships, this component is the seam: the badge and
 * "See how it will work" become "Build my mission" and the real card takes
 * over. The dashboard only knows it renders one section here.
 */
export default function ExpoMissionPreview() {
  const [showInfo, setShowInfo] = useState(false)
  const ctaRef = useRef<HTMLDivElement>(null)

  /*
    Closing puts focus back on the button that opened it. Without this, a
    keyboard or screen-reader user is returned to the top of the document and
    has to find their place on the dashboard again.
  */
  function close() {
    setShowInfo(false)
    ctaRef.current?.querySelector('button')?.focus()
  }

  return (
    <>
      <section
        aria-labelledby="expo-mission-preview-title"
        className="abc-surface p-5 sm:p-6"
        style={{ borderColor: 'var(--abc-gold-border)' }}
      >
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:gap-8">
          <span
            aria-hidden="true"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full"
            style={{ background: 'var(--abc-gold-soft)' }}
          >
            <IconRoute size={22} stroke={1.7} style={{ color: 'var(--abc-gold-accent)' }} />
          </span>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
              <h2
                id="expo-mission-preview-title"
                className="text-[17px] font-bold tracking-tight text-abc-text lg:text-[19px]"
              >
                Expo Mission
              </h2>
              {/* Text, not a colour: it reads as "Coming soon" to a screen reader too. */}
              <span
                className="rounded-full border px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-[0.08em]"
                style={{
                  borderColor: 'var(--abc-gold-border)',
                  background: 'var(--abc-gold-soft)',
                  color: 'var(--abc-gold-accent)',
                }}
              >
                Coming soon
              </span>
            </div>

            <p className="mt-2 text-[13.5px] leading-[1.6] text-abc-secondary lg:text-[14px]">
              Tell ABC where you are going, what you sell and who you are looking for.
            </p>
            <p className="mt-1.5 text-[13.5px] leading-[1.6] text-abc-secondary lg:text-[14px]">
              ABC will help you find the companies worth your time — and guide you from the right
              target to the next business step.
            </p>
          </div>

          <div ref={ctaRef} className="lg:shrink-0">
            <Button
              onClick={() => setShowInfo(true)}
              variant="surface"
              className="w-full lg:w-auto"
            >
              See how it will work
            </Button>
          </div>
        </div>
      </section>

      {showInfo ? <ExpoMissionInfo onClose={close} /> : null}
    </>
  )
}
