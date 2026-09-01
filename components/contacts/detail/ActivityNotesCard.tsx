'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  IconArrowsExchange,
  IconCheck,
  IconClockPause,
  IconDatabaseExport,
  IconDeviceFloppy,
  IconMail,
  IconMessage,
  IconNote,
  IconScan,
  IconSparkles,
} from '@tabler/icons-react'
import type { TablerIcon } from '@tabler/icons-react'
import Button from '@/components/ui/abc/Button'
import { CardTitle, ErrorNote, INPUT_CLASS } from '@/components/contacts/detail/parts'
import { Skeleton } from '@/components/ui/abc/Bits'
import {
  condenseActivity,
  hiddenActivityCount,
  repeatLabel,
  DEFAULT_ACTIVITY_PREVIEW,
  type ActivityRow,
} from '@/lib/contacts/activity-digest'

type Activity = ActivityRow

const ICONS: Record<string, { icon: TablerIcon; label: string }> = {
  CARD_SCANNED: { icon: IconScan, label: 'Card scanned' },
  NOTE_ADDED: { icon: IconNote, label: 'Note added' },
  EMAIL_SENT: { icon: IconMail, label: 'Email sent' },
  LINKEDIN_SENT: { icon: IconMessage, label: 'LinkedIn message sent' },
  WHATSAPP_SENT: { icon: IconMessage, label: 'WhatsApp message sent' },
  MESSAGE_GENERATED: { icon: IconSparkles, label: 'Message generated' },
  RESPONSE_RECEIVED: { icon: IconMessage, label: 'Reply received' },
  STAGE_CHANGED: { icon: IconArrowsExchange, label: 'Status changed' },
  VCARD_SAVED: { icon: IconDeviceFloppy, label: 'Saved to phone' },
  EXPORTED_CSV: { icon: IconDatabaseExport, label: 'Exported' },
  FOLLOWUP_COMPLETED: { icon: IconCheck, label: 'Follow-up completed' },
  FOLLOWUP_SNOOZED: { icon: IconClockPause, label: 'Follow-up moved' },
}

function describe(item: Activity) {
  return ICONS[item.activity_type] ?? { icon: IconMessage, label: item.activity_type.replace(/_/g, ' ').toLowerCase() }
}

function when(iso: string) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/**
 * Activity and notes, both backed by the existing crm_activities table.
 * There is no Files tab — nothing stores files against a contact yet, and an
 * empty tab that cannot ever fill is worse than no tab.
 */
export default function ActivityNotesCard({ contactId }: { contactId: string }) {
  const [tab, setTab] = useState<'activity' | 'notes'>('activity')
  const [expanded, setExpanded] = useState(false)
  const [items, setItems] = useState<Activity[]>([])
  const [loading, setLoading] = useState(true)
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/crm/activities?contactId=${encodeURIComponent(contactId)}`)
      const data = await res.json()
      setItems(res.ok ? ((data.activities as Activity[]) ?? []) : [])
    } catch {
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [contactId])

  useEffect(() => {
    void load()
  }, [load])

  async function addNote() {
    const text = note.trim()
    if (!text) return

    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/crm/activity', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contactId,
          activityType: 'NOTE_ADDED',
          activityDetail: text,
        }),
      })
      if (!res.ok) throw new Error('failed')
      setNote('')
      await load()
    } catch {
      setError('Could not save that note.')
    } finally {
      setSaving(false)
    }
  }

  const notes = items.filter((item) => item.activity_type === 'NOTE_ADDED')

  /*
    Notes are written by a person and are few; activity is written by the app
    and is not. So only activity gets condensed and capped, and expanding shows
    every stored row exactly as recorded — the preview is a view, not a filter
    on what exists.
  */
  const showingNotes = tab === 'notes'
  const groups = condenseActivity(showingNotes ? notes : items)
  const capped = !showingNotes && !expanded
  const visible = capped ? groups.slice(0, DEFAULT_ACTIVITY_PREVIEW) : groups
  const hidden = capped ? hiddenActivityCount(groups) : 0

  return (
    <section className="abc-surface p-5">
      <CardTitle>History</CardTitle>

      <div className="mt-3 flex gap-1 border-b border-abc-border">
        {(['activity', 'notes'] as const).map((id) => {
          const isActive = tab === id
          return (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              aria-pressed={isActive}
              className={`-mb-px border-b-2 px-3 py-2.5 text-[13.5px] font-medium capitalize transition-colors duration-200 ease-abc abc-focus-ring ${
                isActive
                  ? 'border-abc-gold-accent text-abc-text'
                  : 'border-transparent text-abc-secondary hover:text-abc-text'
              }`}
            >
              {id}
              {id === 'notes' && notes.length > 0 ? (
                <span className="ml-1.5 text-abc-muted">{notes.length}</span>
              ) : null}
            </button>
          )
        })}
      </div>

      {tab === 'notes' ? (
        <div className="mt-4">
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            placeholder="Add a note about this person…"
            className={`resize-y py-2.5 leading-[1.5] ${INPUT_CLASS}`}
          />
          {error ? <div className="mt-2"><ErrorNote>{error}</ErrorNote></div> : null}
          <Button
            onClick={() => void addNote()}
            disabled={saving || note.trim().length === 0}
            variant="surface"
            className="mt-2.5"
          >
            {saving ? 'Saving…' : 'Add note'}
          </Button>
        </div>
      ) : null}

      {loading ? (
        <div className="mt-4 flex flex-col gap-3">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      ) : visible.length === 0 ? (
        <p className="mt-4 text-[13.5px] text-abc-secondary">
          {tab === 'notes' ? 'No notes yet.' : 'Nothing recorded yet.'}
        </p>
      ) : (
        <>
          <ul className="mt-4 flex flex-col gap-3">
            {visible.map((item) => {
              const { icon: ItemIcon, label } = describe(item)
              const repeat = repeatLabel(item.count)
              return (
                <li key={item.id} className="flex gap-2.5">
                  <ItemIcon size={16} stroke={1.75} className="mt-[3px] shrink-0 text-abc-muted" />
                  <div className="min-w-0">
                    <p className="whitespace-pre-wrap text-[13.5px] leading-[1.5] text-abc-text">
                      {item.activity_detail || label}
                    </p>
                    <p className="mt-0.5 text-[11.5px] text-abc-muted">
                      {when(item.created_at)}
                      {repeat ? <span className="text-abc-muted"> · {repeat}</span> : null}
                    </p>
                  </div>
                </li>
              )
            })}
          </ul>

          {tab === 'activity' && (hidden > 0 || expanded) ? (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              aria-expanded={expanded}
              className="mt-3.5 text-[13px] font-medium text-abc-secondary transition-colors hover:text-abc-text abc-focus-ring"
            >
              {expanded ? 'Show less' : `View full history (${hidden} more)`}
            </button>
          ) : null}
        </>
      )}
    </section>
  )
}
