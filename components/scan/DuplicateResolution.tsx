'use client'

import { IconBuilding, IconCalendarEvent, IconUserCheck } from '@tabler/icons-react'
import Button from '@/components/ui/abc/Button'
import type { ContactMatchSummary, MatchReason } from '@/lib/contacts/duplicate-match'

/**
 * "You already know this person."
 *
 * Shown when the save found someone the owner already has, on an identifier
 * that means one person. Nothing has been written at this point and nothing
 * will be until a button here is pressed — including the button that walks
 * away.
 *
 * The recommendation is strong and the decision is not automatic. Two people
 * genuinely do share a switchboard number, and a card can carry an address that
 * has since moved on to someone else, so "create separate contact" is always
 * available and never buried.
 */

const REASON_LABEL: Record<MatchReason, string> = {
  abc_identity: 'Matched by ABC Card',
  email: 'Matched by same email',
  phone: 'Matched by same phone',
}

function formatMetAt(iso: string | null): string | null {
  if (!iso) return null
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return null
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function DuplicateResolution({
  reason,
  contacts,
  busy,
  onAddMeeting,
  onCreateSeparate,
  onBack,
}: {
  reason: MatchReason
  contacts: ContactMatchSummary[]
  busy: boolean
  onAddMeeting: (contactId: string) => void
  onCreateSeparate: () => void
  onBack: () => void
}) {
  const single = contacts.length === 1

  return (
    <section className="abc-surface p-5">
      <div className="flex gap-2.5">
        <IconUserCheck
          size={20}
          stroke={1.75}
          className="mt-[2px] shrink-0"
          style={{ color: 'var(--abc-gold-accent)' }}
          aria-hidden="true"
        />
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-abc-text">
            {single ? 'You already know this person' : 'We found existing contacts'}
          </h2>
          <p className="mt-1 text-[13px] leading-[1.55] text-abc-secondary">
            {single
              ? 'Add this meeting to them instead of saving a second contact.'
              : 'Choose the person you met again.'}
          </p>
        </div>
      </div>

      <ul className="mt-4 flex flex-col gap-2.5">
        {contacts.map((contact) => {
          const metAt = formatMetAt(contact.lastMetAt)
          return (
            <li
              key={contact.contactId}
              className="rounded-inner border border-abc-border bg-abc-raised px-4 py-3.5"
            >
              <p className="text-[14.5px] font-semibold leading-[1.4] text-abc-text">
                {contact.name || 'Unnamed contact'}
              </p>

              {contact.company || contact.role ? (
                <p className="mt-1 flex gap-1.5 text-[13px] text-abc-secondary">
                  <IconBuilding size={14} stroke={1.75} className="mt-[3px] shrink-0" aria-hidden="true" />
                  <span className="min-w-0">
                    {[contact.role, contact.company].filter(Boolean).join(' · ')}
                  </span>
                </p>
              ) : null}

              {metAt || contact.lastEvent ? (
                <p className="mt-1 flex gap-1.5 text-[12.5px] text-abc-muted">
                  <IconCalendarEvent size={14} stroke={1.75} className="mt-[3px] shrink-0" aria-hidden="true" />
                  <span className="min-w-0">
                    Last met {[metAt, contact.lastEvent].filter(Boolean).join(' · ')}
                  </span>
                </p>
              ) : null}

              <p className="mt-2 text-[12px] text-abc-muted">{REASON_LABEL[reason]}</p>

              <Button
                onClick={() => onAddMeeting(contact.contactId)}
                disabled={busy}
                fullWidth
                className="mt-3"
              >
                {busy ? 'Saving…' : 'Add new meeting'}
              </Button>
            </li>
          )
        })}
      </ul>

      <div className="mt-4 flex flex-col gap-2">
        <Button onClick={onCreateSeparate} variant="surface" disabled={busy} fullWidth>
          Create separate contact
        </Button>
        <button
          type="button"
          onClick={onBack}
          disabled={busy}
          className="rounded-inner px-3 py-2.5 text-[13px] font-medium text-abc-secondary transition-colors hover:text-abc-text disabled:opacity-60 abc-focus-ring"
        >
          Back to review
        </button>
      </div>
    </section>
  )
}
