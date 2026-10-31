'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { IconCheck, IconChevronRight, IconListCheck } from '@tabler/icons-react'
import { ACTION_ICON, DueLabel, InlineError, MISSING_ICON, Notice, StageChip } from '@/components/opportunities/parts'
import Button from '@/components/ui/abc/Button'
import { EmptyState } from '@/components/ui/abc/Bits'
import {
  NEXT_GROUP_LABEL,
  NEXT_GROUP_ORDER,
  STAGE_LABEL,
  type NextGroup,
  type NextItem,
} from '@/lib/opportunities/model'

type Suggestion = { opportunityId: string; name: string }

/**
 * The Next tab: what to do next, and nothing that is not real.
 *
 * Deal steps are completed here; meeting follow-ups are completed through the
 * follow-up inbox's own route, so both screens finish the same follow-up the
 * same way. Finishing a step on a NEW deal offers — only offers — to move it
 * to In progress.
 */
export default function NextView({ initialItems, failed }: { initialItems: NextItem[]; failed: boolean }) {
  const router = useRouter()
  const [items, setItems] = useState(initialItems)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null)
  const [moving, setMoving] = useState(false)

  useEffect(() => setItems(initialItems), [initialItems])

  const groups = useMemo(() => {
    const map = new Map<NextGroup, NextItem[]>()
    for (const item of items) map.set(item.group, [...(map.get(item.group) ?? []), item])
    return NEXT_GROUP_ORDER.filter((g) => map.has(g)).map((g) => ({ group: g, items: map.get(g) as NextItem[] }))
  }, [items])

  function flash(message: string) {
    setNotice(message)
    window.setTimeout(() => setNotice(null), 2600)
  }

  async function complete(item: NextItem) {
    setBusy(item.key)
    setError(null)
    try {
      const res =
        item.source === 'deal'
          ? await fetch(`/api/crm/opportunities/${item.opportunityId}/next-action`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ action: 'complete' }),
            })
          : await fetch('/api/follow-ups', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ contactId: item.contactId, action: 'complete' }),
            })
      if (!res.ok) throw new Error('failed')
      setItems((prev) => prev.filter((i) => i.key !== item.key))
      if (item.opportunityId && item.stage === 'new') {
        setSuggestion({ opportunityId: item.opportunityId, name: item.person.name })
      } else {
        flash('Marked done')
      }
      router.refresh()
    } catch {
      setError('Could not mark that done. Try again.')
    } finally {
      setBusy(null)
    }
  }

  async function acceptSuggestion() {
    if (!suggestion) return
    setMoving(true)
    try {
      const res = await fetch(`/api/crm/opportunities/${suggestion.opportunityId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage: 'in_progress' }),
      })
      if (!res.ok) throw new Error('failed')
      flash(`${suggestion.name} moved to ${STAGE_LABEL.in_progress}`)
      setSuggestion(null)
      router.refresh()
    } catch {
      setError('Could not move that opportunity. Try again.')
    } finally {
      setMoving(false)
    }
  }

  if (failed) {
    return (
      <div className="abc-surface">
        <EmptyState
          icon={IconListCheck}
          title="We couldn't load what is next."
          description="Something went wrong on our side. Your data is safe."
          action={<Button onClick={() => router.refresh()}>Try again</Button>}
        />
      </div>
    )
  }

  return (
    <div>
      {error ? <div className="mb-3"><InlineError>{error}</InlineError></div> : null}

      {suggestion ? (
        <div className="abc-surface mb-4 flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
          <p className="min-w-0 flex-1 text-[13.5px] text-abc-text">
            Done. Move <span className="font-semibold">{suggestion.name}</span> to {STAGE_LABEL.in_progress}?
          </p>
          <div className="flex shrink-0 gap-2">
            <Button variant="ghost" onClick={() => setSuggestion(null)} disabled={moving}>
              Not now
            </Button>
            <Button onClick={() => void acceptSuggestion()} disabled={moving}>
              {moving ? 'Moving…' : `Move to ${STAGE_LABEL.in_progress}`}
            </Button>
          </div>
        </div>
      ) : null}

      {items.length === 0 ? (
        <div className="abc-surface">
          <EmptyState
            icon={IconListCheck}
            title="Nothing waiting on you."
            description="Next steps on your opportunities and follow-ups from your meetings appear here."
            action={
              <Button href="/crm" variant="surface">
                Open pipeline
              </Button>
            }
          />
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {groups.map(({ group, items: groupItems }) => (
            <section key={group} aria-label={NEXT_GROUP_LABEL[group]}>
              <h2
                className="mb-2.5 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.08em]"
                style={{ color: group === 'overdue' ? 'var(--abc-overdue)' : 'var(--abc-text-muted)' }}
              >
                {NEXT_GROUP_LABEL[group]}
                <span className="tabular-nums">{groupItems.length}</span>
              </h2>
              <ul className="abc-surface divide-y divide-abc-border overflow-hidden">
                {groupItems.map((item) => (
                  <NextRow key={item.key} item={item} busy={busy === item.key} onComplete={() => void complete(item)} />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      {notice ? <Notice>{notice}</Notice> : null}
    </div>
  )
}

function NextRow({ item, busy, onComplete }: { item: NextItem; busy: boolean; onComplete: () => void }) {
  const Icon = item.type ? ACTION_ICON[item.type] : MISSING_ICON
  const href = item.opportunityId ? `/crm/opportunities/${item.opportunityId}` : `/contacts/${item.contactId}`
  const who = [item.person.name, item.person.company].filter(Boolean).join(' · ')

  return (
    <li className="flex items-center gap-2 pr-3 sm:pr-4">
      <Link
        href={href}
        className="flex min-w-0 flex-1 items-start gap-3 py-3.5 pl-4 transition-colors duration-200 ease-abc abc-focus-ring sm:pl-5"
      >
        <span
          className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border"
          style={{ background: 'var(--abc-gold-soft)', borderColor: 'var(--abc-gold-border)' }}
          aria-hidden="true"
        >
          <Icon size={17} stroke={1.8} style={{ color: 'var(--abc-gold-accent)' }} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[14.5px] font-semibold leading-snug text-abc-text">{item.text}</span>
          <span className="mt-0.5 block truncate text-[12.5px] text-abc-secondary">{who}</span>
          <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
            {item.stage ? <StageChip stage={item.stage} /> : null}
            <span className="text-[12px] text-abc-muted">{item.context}</span>
            <DueLabel dueAt={item.dueAt} />
          </span>
        </span>
      </Link>
      {item.source === 'missing' ? (
        <Link
          href={href}
          className="inline-flex min-h-[44px] shrink-0 items-center gap-1 rounded-btn px-2 text-[13px] font-medium text-abc-secondary transition-colors hover:text-abc-text abc-focus-ring"
        >
          Set
          <IconChevronRight size={15} stroke={2} aria-hidden="true" />
        </Link>
      ) : (
        <button
          type="button"
          onClick={onComplete}
          disabled={busy}
          className="inline-flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-btn border border-abc-border bg-abc-raised px-3 text-[13px] font-medium text-abc-text transition-colors hover:border-abc-border-strong disabled:opacity-50 abc-focus-ring"
          aria-label={`Mark done: ${item.text}`}
        >
          <IconCheck size={16} stroke={2} style={{ color: 'var(--abc-green)' }} aria-hidden="true" />
          {busy ? '…' : 'Done'}
        </button>
      )}
    </li>
  )
}
