'use client'

import Link from 'next/link'
import { IconCalendarEvent, IconChevronRight, IconMapPin, IconUsers } from '@tabler/icons-react'
import BatchExportPanel from '@/components/scan/BatchExportPanel'
import { SectionLabel } from '@/components/ui/abc/Bits'
import type { ScanBatch } from '@/lib/scan/batch'

export type BatchContact = {
  id: string
  name: string
  company: string | null
  role: string | null
  email: string | null
  phone: string | null
}

/**
 * What one scanning session produced.
 *
 * Read-only on purpose. Once a card has become a contact, the contact screen is
 * where it is edited — a second editable copy here would let the batch and the
 * person disagree about who they are, and the batch would lose.
 */
export default function BatchDetailView({
  batch,
  contacts,
}: {
  batch: ScanBatch
  contacts: BatchContact[]
}) {
  const context = batch.sharedContext
  const where = [context.event, context.location].filter(Boolean).join(' · ')
  const met = batch.savedAt || batch.createdAt

  return (
    <div className="mx-auto flex w-full max-w-[720px] flex-col abc-page-top px-4 pb-10 sm:px-6">
      <header>
        <h1 className="text-[22px] font-bold tracking-tight text-abc-text lg:text-[26px]">
          {where || 'Scan batch'}
        </h1>
        <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-abc-secondary">
          <span className="inline-flex items-center gap-1.5">
            <IconUsers size={14} stroke={1.8} />
            {contacts.length} contact{contacts.length === 1 ? '' : 's'}
          </span>
          {met ? (
            <span className="inline-flex items-center gap-1.5">
              <IconCalendarEvent size={14} stroke={1.8} />
              {new Date(met).toLocaleDateString('en-GB', {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
              })}
            </span>
          ) : null}
        </p>
      </header>

      {context.discussed || context.nextAction ? (
        <section className="abc-surface mt-4 p-4 sm:p-5">
          <SectionLabel>Shared meeting context</SectionLabel>
          {context.discussed ? (
            <p className="mt-2 text-[13.5px] leading-[1.55] text-abc-secondary">
              {context.discussed}
            </p>
          ) : null}
          {context.nextAction ? (
            <p className="mt-2 text-[13.5px] leading-[1.55] text-abc-text">
              <span className="text-abc-muted">Next step — </span>
              {context.nextAction}
            </p>
          ) : null}
          {context.location ? (
            <p className="mt-2 inline-flex items-center gap-1.5 text-[12.5px] text-abc-muted">
              <IconMapPin size={13} stroke={1.8} />
              {context.location}
            </p>
          ) : null}
          <p className="mt-3 text-[12px] leading-[1.5] text-abc-muted">
            Every contact below carries this meeting. Open one to add details that apply only to
            them.
          </p>
        </section>
      ) : null}

      <section className="abc-surface mt-3 p-4 sm:p-5">
        <SectionLabel>Contacts</SectionLabel>

        {contacts.length === 0 ? (
          <p className="mt-2 text-[13.5px] text-abc-secondary">
            This batch has no saved contacts.
          </p>
        ) : (
          <ul className="mt-3 flex flex-col gap-1.5">
            {contacts.map((contact) => (
              <li key={contact.id}>
                <Link
                  href={`/contacts/${contact.id}`}
                  className="flex items-center gap-3 rounded-inner border border-abc-border bg-abc-raised px-3 py-2.5 transition-colors duration-200 ease-abc hover:border-abc-border-strong abc-focus-ring"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-semibold text-abc-text">
                      {contact.name || 'Unnamed contact'}
                    </span>
                    {contact.company || contact.role ? (
                      <span className="block truncate text-[12.5px] text-abc-secondary">
                        {[contact.role, contact.company].filter(Boolean).join(' · ')}
                      </span>
                    ) : null}
                    {contact.email || contact.phone ? (
                      <span className="block truncate text-[12px] text-abc-muted">
                        {[contact.email, contact.phone].filter(Boolean).join(' · ')}
                      </span>
                    ) : null}
                  </span>
                  <IconChevronRight size={16} stroke={1.8} className="shrink-0 text-abc-muted" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="mt-3">
        <BatchExportPanel batchId={batch.id} contactCount={contacts.length} />
      </div>
    </div>
  )
}
