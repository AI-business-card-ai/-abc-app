'use client'

import Link from 'next/link'
import Button from '@/components/ui/abc/Button'
import MissionSetupForm from '@/components/event-intelligence/MissionSetupForm'
import type { HomeMission } from '@/lib/event-intelligence/mission-data'

/**
 * Expo Mission on Home.
 *
 * One card, one question, one button. With no mission it asks where the owner
 * is going and builds the mission right here. With a mission it says, in a
 * sentence, where that mission stands — and offers exactly one thing to do. It
 * never lists the architecture underneath: no matches, targets, phases or tabs.
 *
 * Rendered only when the server passes it a mission, which it does only when
 * Event Intelligence is switched on. Home without it is unchanged.
 */
export default function ExpoMissionCard({ mission }: { mission: HomeMission }) {
  return (
    <section aria-labelledby="expo-mission-title" className="abc-surface p-4 sm:p-5 lg:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 id="expo-mission-title" className="text-[12px] font-semibold uppercase tracking-[0.14em] text-abc-gold-accent">
          Expo Mission
        </h2>
        <p className="text-[11.5px] text-abc-muted">Powered by ABC Event Intelligence</p>
      </div>

      {mission.kind === 'mission' ? (
        <div className="mt-3">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-[20px] font-bold leading-tight tracking-tight text-abc-text lg:text-[24px]">
              {mission.summary.eventName}
            </span>
            {mission.summary.timing ? (
              <span
                className={[
                  'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[12px] font-medium',
                  mission.summary.live
                    ? 'border-abc-gold-border bg-abc-gold-soft text-abc-text'
                    : 'border-abc-border text-abc-secondary',
                ].join(' ')}
              >
                {mission.summary.live ? <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-abc-gold" /> : null}
                {mission.summary.timing}
              </span>
            ) : null}
          </p>

          <p className="mt-2 text-[16px] font-semibold text-abc-text">{mission.summary.headline}</p>
          {mission.summary.next ? (
            <p className="mt-1 text-[13.5px] leading-[1.5] text-abc-secondary">{mission.summary.next}</p>
          ) : null}

          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
            <Button href={mission.summary.cta.href} size="lg" fullWidth className="sm:w-auto">
              {mission.summary.cta.label}
            </Button>
            {mission.missionCount > 1 ? (
              <Link
                href="/events/intelligence"
                className="inline-flex min-h-[44px] items-center justify-center px-2 text-[13px] font-medium text-abc-secondary hover:text-abc-text abc-focus-ring"
              >
                View all missions
              </Link>
            ) : null}
          </div>
        </div>
      ) : mission.setup.events.filter((event) => !event.hasMission).length === 0 ? (
        <div className="mt-3">
          <p className="text-[18px] font-bold leading-tight text-abc-text">Where are you going next?</p>
          <p className="mt-1.5 max-w-[56ch] text-[13.5px] leading-[1.55] text-abc-secondary">
            ABC builds your mission from the fair’s exhibitor list. Import the organiser’s list and it
            will tell you who is worth your time — and what to do next.
          </p>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
            <Button href="/events/intelligence/import" size="lg" fullWidth className="sm:w-auto">
              Import an exhibitor list
            </Button>
            {mission.missionCount > 0 ? (
              <Link
                href="/events/intelligence"
                className="inline-flex min-h-[44px] items-center justify-center px-2 text-[13px] font-medium text-abc-secondary hover:text-abc-text abc-focus-ring"
              >
                View all missions
              </Link>
            ) : null}
          </div>
        </div>
      ) : (
        <MissionSetupForm
          compact
          events={mission.setup.events}
          defaults={mission.setup.defaults}
          profile={mission.setup.profile}
          objective={null}
          companyName={mission.setup.companyName}
        />
      )}
    </section>
  )
}
