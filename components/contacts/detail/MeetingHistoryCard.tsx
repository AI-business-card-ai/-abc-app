'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { IconCalendarEvent, IconMapPin, IconPlus, IconTargetArrow } from '@tabler/icons-react'
import Button from '@/components/ui/abc/Button'
import MeetingContextForm from '@/components/contacts/detail/MeetingContextForm'
import { CardTitle } from '@/components/contacts/detail/parts'
import type { ContactDetail, ContactEncounterView } from '@/lib/contact-detail'

/**
 * Every earlier time you met this person.
 *
 * The card above shows the latest meeting, so this one starts at the second —
 * the same meeting rendered twice reads like a bug, not like history. Its real
 * job is the button: before duplicate detection exists, this is how meeting
 * someone again produces a second meeting instead of a second contact.
 */

function formatMetAt(iso: string | null): string | null {
  if (!iso) return null
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return null
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function MeetingHistoryCard({ contact }: { contact: ContactDetail }) {
  const router = useRouter()
  const [adding, setAdding] = useState(false)

  const previous = contact.encounters.slice(1)

  return (
    <section className="abc-surface p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <CardTitle>Meeting history</CardTitle>
          <p className="mt-1.5 text-[13px] leading-[1.55] text-abc-secondary">
            Met them again? Add the meeting instead of a second contact.
          </p>
        </div>
        {!adding ? (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="flex shrink-0 items-center gap-1.5 rounded-inner px-2.5 py-1.5 text-[13px] font-semibold text-abc-gold-accent transition-colors hover:bg-abc-raised abc-focus-ring"
          >
            <IconPlus size={15} stroke={1.9} />
            Add meeting
          </button>
        ) : null}
      </div>

      {adding ? (
        <MeetingContextForm
          contactId={contact.id}
          // No encounterId: this is a new meeting, not a correction to the last.
          submitLabel="Save meeting"
          onCancel={() => setAdding(false)}
          onSaved={() => {
            setAdding(false)
            // The new meeting becomes the latest, which changes the card above
            // and the follow-up too. Refetching the server data is simpler than
            // three components each patching their own copy of the truth.
            router.refresh()
          }}
        />
      ) : previous.length > 0 ? (
        <ul className="mt-4 flex flex-col gap-3">
          {previous.map((encounter) => (
            <PreviousMeeting key={encounter.id} encounter={encounter} />
          ))}
        </ul>
      ) : (
        <p className="mt-4 rounded-inner border border-dashed border-abc-border px-4 py-4 text-center text-[13.5px] text-abc-secondary">
          {contact.encounters.length > 0
            ? 'This is the only meeting so far.'
            : 'No meetings recorded for this contact yet.'}
        </p>
      )}

      {!adding && previous.length > 0 ? (
        <Button onClick={() => setAdding(true)} variant="surface" fullWidth className="mt-4 sm:w-auto">
          Add meeting
        </Button>
      ) : null}
    </section>
  )
}

function PreviousMeeting({ encounter }: { encounter: ContactEncounterView }) {
  const metAt = formatMetAt(encounter.metAt)

  return (
    <li className="rounded-inner border border-abc-border bg-abc-raised px-4 py-3.5">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="text-[13.5px] font-semibold text-abc-text">{metAt ?? 'Undated meeting'}</span>
        {encounter.event ? (
          <span className="inline-flex min-w-0 items-center gap-1.5 text-[12.5px] text-abc-secondary">
            <IconMapPin size={14} stroke={1.75} className="shrink-0" aria-hidden="true" />
            <span className="truncate">{encounter.event}</span>
          </span>
        ) : null}
      </div>

      {encounter.discussed ? (
        <p className="mt-1.5 whitespace-pre-wrap text-[13.5px] leading-[1.55] text-abc-text">
          {encounter.discussed}
        </p>
      ) : null}

      {encounter.nextAction ? (
        <p className="mt-1.5 flex gap-1.5 text-[12.5px] text-abc-secondary">
          <IconTargetArrow size={14} stroke={1.75} className="mt-[3px] shrink-0" aria-hidden="true" />
          <span>{encounter.nextAction}</span>
        </p>
      ) : null}

      {encounter.followUpAt ? (
        <p className="mt-1.5 flex gap-1.5 text-[12.5px] text-abc-muted">
          <IconCalendarEvent size={14} stroke={1.75} className="mt-[3px] shrink-0" aria-hidden="true" />
          <span>Followed up {formatMetAt(encounter.followUpAt)}</span>
        </p>
      ) : null}
    </li>
  )
}
