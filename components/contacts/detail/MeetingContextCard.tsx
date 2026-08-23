'use client'

import { useState } from 'react'
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
 * Still reads the flat contact fields, which now project the newest encounter,
 * so this stays in step with the follow-up card and the contact list rather
 * than computing its own version of "latest". Editing revises that encounter
 * through /api/card/context; earlier meetings live in the history card below.
 */
export default function MeetingContextCard({
  contact,
  onSaved,
}: {
  contact: ContactDetail
  onSaved: (next: Partial<ContactDetail>) => void
}) {
  const [editing, setEditing] = useState(false)

  // The meeting this card is showing: the newest one, which is also what the
  // flat contact fields project. Editing here revises it.
  const latest = contact.encounters[0]

  const hasContext = Boolean(contact.event || contact.discussed || contact.nextStep)
  const status = contact.followUp ? STATUS[contact.followUp] : null
  const metAt = formatMetAt(contact.metAt)

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
            event: contact.event ?? '',
            discussed: contact.discussed ?? '',
            nextStep: contact.nextStep ?? '',
            followUpAt: contact.followUpAt,
          }}
          submitLabel="Save context"
          onCancel={() => setEditing(false)}
          onSaved={(values) => {
            onSaved({
              event: values.event || null,
              discussed: values.discussed || null,
              nextStep: values.nextStep || null,
              followUpAt: values.followUpAt,
            })
            setEditing(false)
          }}
        />
      ) : (
        <div className="mt-4 flex flex-col gap-3.5">
          {contact.event ? (
            <Detail icon={IconMapPin} label="Met at">
              {contact.event}
              {metAt ? <span className="text-abc-muted"> · {metAt}</span> : null}
            </Detail>
          ) : metAt && hasContext ? (
            // Without any other context this is just the scan date, which the
            // header already shows — don't repeat it as if it were context.
            <Detail icon={IconMapPin} label="Met on">
              {metAt}
            </Detail>
          ) : null}

          {contact.discussed ? (
            <Detail icon={IconMessage} label="Discussed">
              {contact.discussed}
            </Detail>
          ) : null}

          {contact.notes && contact.notes !== contact.discussed ? (
            <Detail icon={IconMessage} label="Notes">
              {contact.notes}
            </Detail>
          ) : null}

          {contact.nextStep ? (
            <Detail icon={IconTargetArrow} label="Next step">
              {contact.nextStep}
            </Detail>
          ) : null}

          {contact.followUpAt ? (
            <Detail icon={IconCalendarEvent} label="Follow up">
              <span className="inline-flex flex-wrap items-center gap-x-2">
                <span>{dueDateLabel(contact.followUpAt)}</span>
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

          {!hasContext && !contact.followUpAt ? (
            <div className="rounded-inner border border-dashed border-abc-border px-4 py-5 text-center">
              <p className="text-[13.5px] text-abc-secondary">
                No meeting context saved for this contact yet.
              </p>
              <Button onClick={() => setEditing(true)} variant="surface" className="mt-3.5">
                Add meeting context
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
