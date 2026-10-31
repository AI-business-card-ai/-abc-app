'use client'

import { useState } from 'react'
import { IconChevronRight, IconLayoutKanban, IconPlus } from '@tabler/icons-react'
import CreateOpportunitySheet from '@/components/opportunities/CreateOpportunitySheet'
import { StageChip } from '@/components/opportunities/parts'
import Button from '@/components/ui/abc/Button'
import { formatMoney, type Opportunity } from '@/lib/opportunities/model'
import type { ContactDetail } from '@/lib/contact-detail'

/**
 * Contact Detail's way into the CRM.
 *
 * A person is not a deal until the owner says so: with no opportunity this
 * offers to create one; with one it opens it — never a second. When
 * opportunities cannot be read at all, it shows nothing rather than a button
 * that cannot work.
 */
export default function ContactOpportunityCard({
  contact,
  opportunity,
  available,
}: {
  contact: ContactDetail
  opportunity: Opportunity | null
  available: boolean
}) {
  const [creating, setCreating] = useState(false)

  if (!available) return null

  if (opportunity) {
    const value = formatMoney(opportunity.value, opportunity.currency)
    return (
      <section className="abc-surface flex flex-wrap items-center gap-3 p-4 sm:p-5" aria-label="Opportunity">
        <IconLayoutKanban size={20} stroke={1.7} className="shrink-0" style={{ color: 'var(--abc-gold-accent)' }} aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[14px] font-semibold text-abc-text">Opportunity</span>
            <StageChip stage={opportunity.stage} />
            {value ? (
              <span className="text-[13px] font-semibold tabular-nums" style={{ color: 'var(--abc-gold-accent)' }}>
                {value}
              </span>
            ) : null}
          </div>
          {opportunity.nextAction ? (
            <p className="mt-1 truncate text-[12.5px] text-abc-secondary">Next: {opportunity.nextAction.text}</p>
          ) : null}
        </div>
        <Button href={`/crm/opportunities/${opportunity.id}`} variant="surface" className="w-full sm:w-auto">
          View opportunity
          <IconChevronRight size={16} stroke={2} />
        </Button>
      </section>
    )
  }

  return (
    <>
      <section className="abc-surface flex flex-wrap items-center gap-3 p-4 sm:p-5" aria-label="Opportunity">
        <IconLayoutKanban size={20} stroke={1.7} className="shrink-0 text-abc-muted" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-semibold text-abc-text">Is there a deal here?</p>
          <p className="mt-0.5 text-[12.5px] text-abc-secondary">Track it in your CRM, starting from this meeting.</p>
        </div>
        <Button onClick={() => setCreating(true)} variant="surface" className="w-full sm:w-auto">
          <IconPlus size={16} stroke={2} style={{ color: 'var(--abc-gold-accent)' }} />
          Create opportunity
        </Button>
      </section>
      {creating ? <CreateOpportunitySheet contact={contact} onClose={() => setCreating(false)} /> : null}
    </>
  )
}
