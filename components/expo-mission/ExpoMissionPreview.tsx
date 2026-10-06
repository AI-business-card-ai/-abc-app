'use client'

import { useRef, useState } from 'react'
import { IconRoute } from '@tabler/icons-react'
import Button from '@/components/ui/abc/Button'
import ExpoMissionInfo from '@/components/expo-mission/ExpoMissionInfo'

/**
 * Expo Mission, on the dashboard, as a promise rather than a feature.
 *
 * It lives inside the Event & Expo Intelligence panel, which carries the
 * family name. This card names the one feature in that family that is not
 * built yet, so it reads as part of the area rather than as a second product
 * to buy — and it says coming soon, in the badge, in the button and in the
 * sheet it opens.
 *
 * ABC today is the handshake onwards: scan, remember, follow up, CRM. Expo
 * Mission is the layer before the handshake, and it is not built for anybody
 * yet — so this is a teaser and says so.
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
        className="abc-eei-glass rounded-[18px] p-4 sm:p-5 lg:px-4 lg:py-3.5"
      >
        <div className="flex flex-wrap items-center gap-x-3 gap-y-3">
          <span
            aria-hidden="true"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
            style={{ background: 'var(--abc-gold-soft)', boxShadow: 'inset 0 0 0 1px var(--abc-gold-border)' }}
          >
            <IconRoute size={20} stroke={1.7} style={{ color: 'var(--abc-gold-accent)' }} />
          </span>

          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2.5 gap-y-1">
            <h2
              id="expo-mission-preview-title"
              className="text-[17px] font-bold tracking-tight text-[#161412]"
            >
              Expo Mission
            </h2>
            {/* Text, not a colour: it reads as "Coming soon" to a screen reader too. */}
            <span
              className="rounded-full border px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-[0.08em]"
              style={{
                borderColor: 'var(--abc-gold-border)',
                background: 'var(--abc-gold-soft)',
                color: '#7a5810',
              }}
            >
              Coming soon
            </span>
          </div>

          <div ref={ctaRef} className="w-full sm:w-auto">
            <Button
              onClick={() => setShowInfo(true)}
              variant="surface"
              className="w-full !rounded-full !border-[rgba(169,125,28,0.5)] !bg-[rgba(255,253,248,0.85)] !font-semibold !text-[#8f6812] sm:w-auto"
            >
              See how it will work
            </Button>
          </div>
        </div>

        <p className="mt-2.5 text-[13px] leading-[1.55] text-[#5d574f] lg:mt-2 lg:text-[12.5px] lg:leading-[1.42]">
          Tell ABC where you are going, what you sell and who you are looking for.{' '}
          ABC will help you find the companies worth your time — and guide you from the right
          target to the next business step.
        </p>
      </section>

      {showInfo ? <ExpoMissionInfo onClose={close} /> : null}
    </>
  )
}
