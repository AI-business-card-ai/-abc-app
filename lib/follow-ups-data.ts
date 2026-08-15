import { bucketFor, type FollowUpBucket } from '@/lib/followups'
import { createServerComponentClient } from '@/lib/supabase-server'

/**
 * The follow-up inbox reads the same field the scanner writes and the
 * dashboard counts: scanned_contacts.next_action_date. A row with a date set
 * is a pending follow-up; completing one clears the date, so "pending" and
 * "has a date" are the same thing and cannot drift apart.
 */

export type FollowUpItem = {
  id: string
  name: string
  role: string | null
  company: string | null
  photoUrl: string | null

  email: string | null
  phone: string | null
  linkedinUrl: string | null

  event: string | null
  discussed: string | null
  nextStep: string | null

  dueAt: string
  bucket: FollowUpBucket
}

export type CompletedFollowUp = {
  id: string
  contactId: string | null
  name: string | null
  photoUrl: string | null
  event: string | null
  detail: string | null
  completedAt: string
}

export type FollowUpsData = {
  overdue: FollowUpItem[]
  today: FollowUpItem[]
  upcoming: FollowUpItem[]
  completed: CompletedFollowUp[]
}

function clean(value: unknown): string | null {
  const text = typeof value === 'string' ? value.trim() : ''
  return text.length > 0 ? text : null
}

function firstOf(...values: unknown[]): string | null {
  for (const value of values) {
    const text = clean(value)
    if (text) return text
  }
  return null
}

export async function getFollowUps(): Promise<FollowUpsData | null> {
  const supabase = createServerComponentClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const [dueRes, doneRes] = await Promise.all([
    supabase
      .from('scanned_contacts')
      .select(
        'id, name, first_name, last_name, role, company, photo_url, email, phone, mobile_phone, linkedin_url, event_name, meeting_event_name, meeting_location, raw_event_text, meeting_topic, notes, next_action, next_step, next_action_date'
      )
      .eq('user_id', user.id)
      .not('next_action_date', 'is', null)
      .order('next_action_date', { ascending: true }),

    supabase
      .from('crm_activities')
      .select('id, contact_id, activity_detail, created_at')
      .eq('user_id', user.id)
      .eq('activity_type', 'FOLLOWUP_COMPLETED')
      .order('created_at', { ascending: false })
      .limit(20),
  ])

  const now = new Date()
  const data: FollowUpsData = { overdue: [], today: [], upcoming: [], completed: [] }

  for (const row of dueRes.data ?? []) {
    const bucket = bucketFor(row.next_action_date, now)
    // Anything scheduled beyond the upcoming horizon stays out of the inbox
    // until it comes into range — this is an action list, not a calendar.
    if (!bucket) continue

    const name =
      firstOf(row.name, [clean(row.first_name), clean(row.last_name)].filter(Boolean).join(' ')) ??
      'Unnamed contact'

    data[bucket].push({
      id: String(row.id),
      name,
      role: clean(row.role),
      company: clean(row.company),
      photoUrl: clean(row.photo_url),
      email: clean(row.email),
      phone: firstOf(row.phone, row.mobile_phone),
      linkedinUrl: clean(row.linkedin_url),
      event: firstOf(
        row.meeting_event_name,
        row.event_name,
        row.raw_event_text,
        row.meeting_location
      ),
      discussed: firstOf(row.meeting_topic, row.notes),
      nextStep: firstOf(row.next_action, row.next_step),
      dueAt: String(row.next_action_date),
      bucket,
    })
  }

  // Resolve the contacts behind completed follow-ups in one round trip.
  const doneRows = doneRes.data ?? []
  const contactIds = Array.from(
    new Set(doneRows.map((row) => row.contact_id).filter(Boolean))
  ) as string[]

  let lookup: Record<string, { name: string | null; photo: string | null; event: string | null }> =
    {}

  if (contactIds.length > 0) {
    const { data: linked } = await supabase
      .from('scanned_contacts')
      .select('id, name, photo_url, event_name, meeting_event_name')
      .in('id', contactIds)
      .eq('user_id', user.id)

    lookup = Object.fromEntries(
      (linked ?? []).map((row) => [
        String(row.id),
        {
          name: clean(row.name),
          photo: clean(row.photo_url),
          event: firstOf(row.meeting_event_name, row.event_name),
        },
      ])
    )
  }

  data.completed = doneRows.map((row) => {
    const linked = row.contact_id ? lookup[String(row.contact_id)] : undefined
    return {
      id: String(row.id),
      contactId: row.contact_id ? String(row.contact_id) : null,
      name: linked?.name ?? null,
      photoUrl: linked?.photo ?? null,
      event: linked?.event ?? null,
      detail: clean(row.activity_detail),
      completedAt: String(row.created_at),
    }
  })

  return data
}
