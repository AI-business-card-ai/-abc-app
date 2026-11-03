'use client'

import { useState, type FormEvent } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { IconArrowLeft } from '@tabler/icons-react'
import { ErrorNote, FIELD_LABEL_CLASS, INPUT_CLASS } from '@/components/contacts/detail/parts'
import Button from '@/components/ui/abc/Button'
import { SectionLabel } from '@/components/ui/abc/Bits'
import { PLANNED_LIMITS, type PlannedEvent } from '@/lib/events/planned'
import { userFacingRequestError } from '@/lib/network-error'

const NOTES: { key: NoteKey; label: string; placeholder: string }[] = [
  { key: 'objectives', label: 'Business objectives', placeholder: 'What should this event achieve?' },
  { key: 'companiesToVisit', label: 'Companies to visit', placeholder: 'One per line, with the hall or stand if you know it' },
  { key: 'targetContacts', label: 'People to meet', placeholder: 'Who you want to talk to, and why' },
  { key: 'meetingsToArrange', label: 'Meetings to arrange', placeholder: 'Who to book before you travel' },
  { key: 'followUpPlan', label: 'Follow-up preparation', placeholder: 'What you will send afterwards' },
]

type NoteKey = 'objectives' | 'companiesToVisit' | 'targetContacts' | 'meetingsToArrange' | 'followUpPlan'

/**
 * Plan an event, or edit one: the same form, because both ask the same questions.
 *
 * Only a name is required, so an event can be noted down the moment the owner
 * decides to go and prepared later. The date fields start empty and nothing fills
 * them in on the owner's behalf.
 */
export default function PlannedEventForm({ event }: { event?: PlannedEvent }) {
  const router = useRouter()
  const [name, setName] = useState(event?.name ?? '')
  const [startsOn, setStartsOn] = useState(event?.startsOn ?? '')
  const [endsOn, setEndsOn] = useState(event?.endsOn ?? '')
  const [location, setLocation] = useState(event?.location ?? '')
  const [notes, setNotes] = useState<Record<NoteKey, string>>({
    objectives: event?.objectives ?? '',
    companiesToVisit: event?.companiesToVisit ?? '',
    targetContacts: event?.targetContacts ?? '',
    meetingsToArrange: event?.meetingsToArrange ?? '',
    followUpPlan: event?.followUpPlan ?? '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const back = event ? `/events/planned/${event.id}` : '/events'

  async function submit(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(event ? `/api/events/planned/${event.id}` : '/api/events/planned', {
        method: event ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, startsOn, endsOn, location, ...notes }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.event) throw new Error(data.error || 'Could not save this event. Try again.')

      router.push(`/events/planned/${data.event.id}`)
      router.refresh()
    } catch (err) {
      setError(userFacingRequestError(err, 'Could not save this event. Try again.'))
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto w-full max-w-[720px] abc-page-top px-4 pb-10 sm:px-6 lg:px-8">
      <Link
        href={back}
        className="inline-flex min-h-[44px] items-center gap-1.5 rounded-inner text-[13px] font-medium text-abc-secondary transition-colors duration-200 ease-abc hover:text-abc-text abc-focus-ring"
      >
        <IconArrowLeft size={16} stroke={1.9} aria-hidden="true" />
        {event ? event.name : 'Events'}
      </Link>

      <header className="mt-1">
        <SectionLabel>Event &amp; Expo Intelligence</SectionLabel>
        <h1 className="mt-2 text-[26px] font-bold leading-tight tracking-tight text-abc-text lg:text-[34px]">
          {event ? 'Edit event' : 'Plan an event'}
        </h1>
      </header>

      <form onSubmit={submit} className="mt-5 flex flex-col gap-4">
        <section className="abc-surface flex flex-col gap-3.5 p-4 sm:p-5">
          <label className="block">
            <span className={FIELD_LABEL_CLASS}>Event name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={PLANNED_LIMITS.name}
              placeholder="The trade fair or conference"
              className={`h-11 ${INPUT_CLASS}`}
            />
          </label>

          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
            <label className="block">
              <span className={FIELD_LABEL_CLASS}>Starts</span>
              <input type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} className={`h-11 ${INPUT_CLASS}`} />
            </label>
            <label className="block">
              <span className={FIELD_LABEL_CLASS}>Ends</span>
              <input
                type="date"
                value={endsOn}
                min={startsOn || undefined}
                onChange={(e) => setEndsOn(e.target.value)}
                className={`h-11 ${INPUT_CLASS}`}
              />
            </label>
          </div>

          <label className="block">
            <span className={FIELD_LABEL_CLASS}>Location</span>
            <input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              maxLength={PLANNED_LIMITS.location}
              placeholder="City and venue"
              className={`h-11 ${INPUT_CLASS}`}
            />
          </label>
        </section>

        <section className="abc-surface flex flex-col gap-3.5 p-4 sm:p-5">
          <SectionLabel>Before the event</SectionLabel>
          {NOTES.map((note) => (
            <label key={note.key} className="block">
              <span className={FIELD_LABEL_CLASS}>{note.label}</span>
              <textarea
                value={notes[note.key]}
                onChange={(e) => setNotes((current) => ({ ...current, [note.key]: e.target.value }))}
                rows={3}
                maxLength={PLANNED_LIMITS.notes}
                placeholder={note.placeholder}
                className={`resize-y py-2.5 leading-[1.5] ${INPUT_CLASS}`}
              />
            </label>
          ))}
        </section>

        {error ? <ErrorNote>{error}</ErrorNote> : null}

        <div className="flex flex-col gap-2 sm:flex-row">
          <Button type="submit" disabled={saving}>
            {saving ? 'Saving…' : event ? 'Save changes' : 'Plan this event'}
          </Button>
          <Button href={back} variant="ghost">
            Cancel
          </Button>
        </div>
      </form>
    </div>
  )
}
