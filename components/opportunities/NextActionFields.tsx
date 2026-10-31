'use client'

import { INPUT_CLASS, FIELD_LABEL_CLASS } from '@/components/contacts/detail/parts'
import { ACTION_ICON, PILL_CLASS, pillState } from '@/components/opportunities/parts'
import { LIMITS, NEXT_ACTION_TYPES, type NextActionType } from '@/lib/opportunities/model'

export type NextActionDraft = { type: NextActionType; text: string; dueDate: string }

export const EMPTY_DRAFT: NextActionDraft = { type: 'follow_up', text: '', dueDate: '' }

/**
 * One next step: what kind, what exactly, and when. Picking a kind offers a
 * starting phrase ("Call Martin") only while the owner has not written their
 * own words — it never overwrites them.
 */
export default function NextActionFields({
  value,
  onChange,
  firstName,
  idPrefix,
}: {
  value: NextActionDraft
  onChange: (next: NextActionDraft) => void
  firstName: string
  idPrefix: string
}) {
  const starters = new Set(
    NEXT_ACTION_TYPES.filter((t) => t.starter).flatMap((t) => [t.starter, `${t.starter} ${firstName}`])
  )

  function pick(type: NextActionType) {
    const starter = NEXT_ACTION_TYPES.find((t) => t.id === type)?.starter ?? ''
    const untouched = value.text.trim() === '' || starters.has(value.text.trim())
    const phrase = starter && type !== 'quote' && type !== 'reminder' ? `${starter} ${firstName}` : starter
    onChange({ ...value, type, text: untouched ? phrase : value.text })
  }

  return (
    <div>
      <div className="abc-scroll-x -mx-1 px-1">
        <div className="flex gap-2" role="radiogroup" aria-label="Kind of next step">
          {NEXT_ACTION_TYPES.map((t) => {
            const active = value.type === t.id
            const pill = pillState(active)
            const Icon = ACTION_ICON[t.id]
            return (
              <button
                key={t.id}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => pick(t.id)}
                className={`${PILL_CLASS} ${pill.className} inline-flex items-center gap-1.5`}
                style={pill.style}
              >
                <Icon size={15} stroke={1.8} aria-hidden="true" />
                {t.label}
              </button>
            )
          })}
        </div>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_170px]">
        <label htmlFor={`${idPrefix}-text`} className="block min-w-0">
          <span className={FIELD_LABEL_CLASS}>Next step</span>
          <input
            id={`${idPrefix}-text`}
            type="text"
            value={value.text}
            maxLength={LIMITS.action}
            onChange={(e) => onChange({ ...value, text: e.target.value })}
            placeholder={`e.g. Send quote to ${firstName}`}
            className={`${INPUT_CLASS} h-11 min-h-[44px]`}
          />
        </label>
        <label htmlFor={`${idPrefix}-due`} className="block min-w-0">
          <span className={FIELD_LABEL_CLASS}>Due (optional)</span>
          <input
            id={`${idPrefix}-due`}
            type="date"
            value={value.dueDate}
            onChange={(e) => onChange({ ...value, dueDate: e.target.value })}
            className={`${INPUT_CLASS} h-11 min-h-[44px] min-w-0`}
          />
        </label>
      </div>
    </div>
  )
}
