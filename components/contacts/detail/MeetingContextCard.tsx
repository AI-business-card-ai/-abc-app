'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  IconCalendarEvent,
  IconMapPin,
  IconMessage,
  IconPencil,
  IconTargetArrow,
} from '@tabler/icons-react'
import Button from '@/components/ui/abc/Button'
import MeetingContextForm from '@/components/contacts/detail/MeetingContextForm'
import { CardTitle } from '@/components/contacts/detail/parts'
import { dueDateLabel } from '@/lib/format-date'
import { bucketFor } from '@/lib/followups'
import type { ContactDetail } from '@/lib/contact-detail'

const STATUS: Record<string, { label: string; color: string }> = {
  overdue: { label: 'Overdue', color: 'var(--abc-overdue)' },
  today: { label: 'Due today', color: 'var(--abc-today)' },
  upcoming: { label: 'Upcoming', color: 'var(--abc-upcoming)' },
}

function formatMetAt(iso: string | null): string | null {
  if (!iso) return null
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return null
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

/**
 * The latest meeting: where, what was discussed, the next step, when to follow
 * up — the answers a phonebook entry loses.
 *
 * Reads the newest encounter directly, because that is what "latest" means. It
 * used to read the flat contact columns instead, which are a projection of the
 * newest meeting that *had* something to project — and the two stopped agreeing
 * the moment a meeting could be recorded with nothing written down. A repeat
 * scan with no notes left the previous meeting displayed here as though it had
 * just happened, while also appearing below in history, and the meeting that
 * actually just happened appeared nowhere.
 *
 * The flat columns keep their job for everything that has not moved across yet
 * — follow-up buckets, the dashboard, the contact list, CRM scoring — and are
 * no longer consulted by this card. They are the last meeting with details,
 * which is a useful thing for those readers and is not the same claim as this
 * one.
 */
export default function MeetingContextCard({ contact }: { contact: ContactDetail }) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)

  /*
    The newest encounter, and the one this card edits.

    Falling back to the flat columns only when there are no encounters at all,
    which is a contact from before meetings had their own rows and no meeting
    context to have backfilled. Never a blend of the two: taking the date from
    one meeting and the discussion from another would describe an evening that
    never happened.
  */
  const latest = contact.encounters[0]

  const view = latest
    ? {
        event: latest.event,
        discussed: latest.discussed,
        notes: null,
        nextStep: latest.nextAction,
        followUpAt: latest.followUpAt,
        metAt: latest.metAt,
        followUp: bucketFor(latest.followUpAt),
      }
    : {
        event: contact.event,
        discussed: contact.discussed,
        notes: contact.notes,
        nextStep: contact.nextStep,
        followUpAt: contact.followUpAt,
        metAt: contact.metAt,
        followUp: contact.followUp,
      }

  const hasContext = Boolean(view.event || view.discussed || view.nextStep)
  const status = view.followUp ? STATUS[view.followUp] : null
  const metAt = formatMetAt(view.metAt)

  return (
    <section className="abc-surface p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <CardTitle>Meeting context</CardTitle>
          <p className="mt-1.5 text-[13px] leading-[1.55] text-abc-secondary">
            This is what you will have forgotten in three weeks.
          </p>
        </div>
        {!editing ? (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="flex shrink-0 items-center gap-1.5 rounded-inner px-2.5 py-1.5 text-[13px] font-semibold text-abc-gold-accent transition-colors hover:bg-abc-raised abc-focus-ring"
          >
            <IconPencil size={15} stroke={1.9} />
            {hasContext ? 'Edit' : 'Add'}
          </button>
        ) : null}
      </div>

      {editing ? (
        <MeetingContextForm
          contactId={contact.id}
          /*
            The latest meeting, revised — not a new one. Fixing a typo in what
            you discussed must not add a second entry to the history claiming
            you met again. Adding a meeting is a separate, explicit action.
          */
          encounterId={latest?.id}
          initial={{
            event: view.event ?? '',
            discussed: view.discussed ?? '',
            nextStep: view.nextStep ?? '',
            followUpAt: view.followUpAt,
          }}
          submitLabel="Save context"
          onCancel={() => setEditing(false)}
          onSaved={() => {
            setEditing(false)
            // The card now renders the encounter itself, so the server's copy is
            // the one to trust — same refresh the history card below performs.
            router.refresh()
          }}
        />
      ) : (
        <div className="mt-4 flex flex-col gap-3.5">
          {view.event ? (
            <Detail icon={IconMapPin} label="Met at">
              {view.event}
              {metAt ? <span className="text-abc-muted"> · {metAt}</span> : null}
            </Detail>
          ) : metAt && hasContext ? (
            // Without any other context this is just the scan date, which the
            // header already shows — don't repeat it as if it were context.
            <Detail icon={IconMapPin} label="Met on">
              {metAt}
            </Detail>
          ) : null}

          {view.discussed ? (
            <Detail icon={IconMessage} label="Discussed">
              {view.discussed}
            </Detail>
          ) : null}

          {view.notes && view.notes !== view.discussed ? (
            <Detail icon={IconMessage} label="Notes">
              {view.notes}
            </Detail>
          ) : null}

          {view.nextStep ? (
            <Detail icon={IconTargetArrow} label="Next step">
              {view.nextStep}
            </Detail>
          ) : null}

          {view.followUpAt ? (
            <Detail icon={IconCalendarEvent} label="Follow up">
              <span className="inline-flex flex-wrap items-center gap-x-2">
                <span>{dueDateLabel(view.followUpAt)}</span>
                {status ? (
                  <span
                    className="inline-flex items-center gap-1.5 text-[12.5px] font-medium"
                    style={{ color: status.color }}
                  >
                    <span
                      className="h-1.5 w-1.5 rounded-full"
                      style={{ background: status.color }}
                      aria-hidden="true"
                    />
                    {status.label}
                  </span>
                ) : null}
              </span>
            </Detail>
          ) : null}

          {!hasContext && !view.followUpAt ? (
            <div className="rounded-inner border border-dashed border-abc-border px-4 py-5 text-center">
              <p className="text-[13.5px] text-abc-secondary">
                {latest
                  ? 'No notes added for this meeting yet.'
                  : 'No meeting context saved for this contact yet.'}
              </p>
              <Button onClick={() => setEditing(true)} variant="surface" className="mt-3.5">
                {latest ? 'Add notes' : 'Add meeting context'}
              </Button>
            </div>
          ) : null}
        </div>
      )}
    </section>
  )
}

function Detail({
  icon: DetailIcon,
  label,
  children,
}: {
  icon: typeof IconMapPin
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex gap-2.5">
      <DetailIcon
        size={16}
        stroke={1.75}
        className="mt-[3px] shrink-0"
        style={{ color: 'var(--abc-gold-accent)' }}
      />
      <div className="min-w-0">
        <p className="text-[12px] text-abc-muted">{label}</p>
        <p className="mt-0.5 whitespace-pre-wrap text-[14.5px] leading-[1.55] text-abc-text">
          {children}
        </p>
      </div>
    </div>
  )
}
