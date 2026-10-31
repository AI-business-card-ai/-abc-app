'use client'

import Link from 'next/link'
import { IconChevronDown } from '@tabler/icons-react'
import Avatar from '@/components/ui/abc/Avatar'
import { ACTION_ICON, DueLabel, InteractionLine, MISSING_ICON } from '@/components/opportunities/parts'
import {
  ALL_STAGES,
  STAGE_LABEL,
  formatMoney,
  type BoardEntry,
  type OpportunityStage,
} from '@/lib/opportunities/model'

/**
 * One deal on the board: who, why, when you last spoke, what is next, and —
 * when the owner gave one — what it is worth. Opening it is the main action;
 * moving it is the second, and sits outside the link so the two never collide.
 */
export default function OpportunityCard({
  entry,
  onMove,
  moving,
}: {
  entry: BoardEntry
  onMove: (id: string, stage: OpportunityStage) => void
  moving: boolean
}) {
  const { opportunity, person } = entry
  const value = formatMoney(opportunity.value, opportunity.currency)
  const why = person.discussed
  const deal = opportunity.nextAction
  const NextIcon = deal ? ACTION_ICON[deal.type] : person.followUp ? ACTION_ICON.follow_up : MISSING_ICON
  const closed = opportunity.stage === 'won' || opportunity.stage === 'lost'

  return (
    <article className="abc-surface overflow-hidden transition-colors duration-200 ease-abc hover:border-abc-border-strong">
      <Link
        href={`/crm/opportunities/${opportunity.id}`}
        className="block px-3.5 pb-2.5 pt-3.5 abc-focus-ring"
        aria-label={`Open opportunity with ${person.name}`}
      >
        <div className="flex items-start gap-2.5">
          <Avatar src={person.photoUrl} name={person.name} size={36} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[14.5px] font-semibold leading-tight text-abc-text">{person.name}</p>
            {person.company ? (
              <p className="mt-0.5 truncate text-[12.5px] text-abc-secondary">{person.company}</p>
            ) : null}
          </div>
          {value ? (
            <span className="shrink-0 text-[13px] font-bold tabular-nums" style={{ color: 'var(--abc-gold-accent)' }}>
              {value}
            </span>
          ) : null}
        </div>

        {why ? (
          <p className="mt-2.5 line-clamp-2 text-[12.5px] leading-[1.45] text-abc-secondary">{why}</p>
        ) : null}

        <div className="mt-2.5">
          <InteractionLine interaction={person.lastInteraction} />
        </div>

        {closed ? null : (
          <div className="mt-1.5 flex min-w-0 items-center gap-1.5 text-[12.5px]">
            <NextIcon size={14} stroke={1.8} className="shrink-0" style={{ color: 'var(--abc-gold-accent)' }} aria-hidden="true" />
            {deal ? (
              <>
                <span className="min-w-0 truncate font-medium text-abc-text">{deal.text}</span>
                <DueLabel dueAt={deal.dueAt} className="ml-auto pl-1" />
              </>
            ) : person.followUp ? (
              <>
                <span className="min-w-0 truncate text-abc-text">{person.followUp.text ?? 'Follow up'}</span>
                <DueLabel dueAt={person.followUp.dueAt} className="ml-auto pl-1" />
              </>
            ) : (
              <span className="text-abc-muted">No next step</span>
            )}
          </div>
        )}
      </Link>

      <div className="flex items-center justify-end border-t border-abc-border px-2.5 py-1.5">
        <label className="relative inline-flex items-center">
          <span className="sr-only">Move {person.name} to another stage</span>
          <select
            value={opportunity.stage}
            disabled={moving}
            onChange={(e) => onMove(opportunity.id, e.target.value as OpportunityStage)}
            className="min-h-[44px] cursor-pointer appearance-none rounded-full bg-transparent py-1 pl-3 pr-7 text-[12.5px] font-medium text-abc-secondary outline-none transition-colors hover:text-abc-text focus-visible:ring-2 focus-visible:ring-abc-gold-accent disabled:opacity-50 lg:min-h-[36px]"
          >
            {ALL_STAGES.map((stage) => (
              <option key={stage} value={stage}>
                {stage === opportunity.stage ? `${STAGE_LABEL[stage]}` : `Move to ${STAGE_LABEL[stage]}`}
              </option>
            ))}
          </select>
          <IconChevronDown size={14} stroke={2} className="pointer-events-none absolute right-2.5 text-abc-muted" aria-hidden="true" />
        </label>
      </div>
    </article>
  )
}
