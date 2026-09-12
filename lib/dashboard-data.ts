import { createServerComponentClient } from '@/lib/supabase-server'
import { bucketFollowUps, type FollowUpBuckets } from '@/lib/followups'
import { groupEncountersIntoEvents, type EventSummary } from '@/lib/events/workspace'

export type DashboardContact = {
  id: string
  name: string
  role: string | null
  company: string | null
  photoUrl: string | null
  eventName: string | null
  scannedAt: string | null
}

export type DashboardActivity = {
  id: string
  contactId: string | null
  contactName: string | null
  contactPhoto: string | null
  eventName: string | null
  type: string
  detail: string | null
  createdAt: string
}

export type DashboardCard = {
  fullName: string
  jobTitle: string | null
  companyName: string | null
  photoUrl: string | null
  logoUrl: string | null
  phone: string | null
  email: string | null
  website: string | null
  location: string | null
  accent: string
  slug: string | null
  published: boolean
}

export type DashboardData = {
  firstName: string
  contacts: DashboardContact[]
  contactsTotal: number
  followUps: FollowUpBuckets
  activity: DashboardActivity[]
  card: DashboardCard
  /** The most recent events, for the way in to the event workspaces. */
  events: EventSummary[]
}

function firstNameOf(fullName: string | null, email: string | null): string {
  const name = (fullName || '').trim()
  if (name) return name.split(/\s+/)[0]
  return (email || '').split('@')[0] || 'there'
}

/**
 * Everything the dashboard renders, from real rows only.
 * Nothing here falls back to sample data — an empty account renders
 * empty states, not invented contacts.
 */
export async function getDashboardData(): Promise<DashboardData | null> {
  const supabase = createServerComponentClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const [profileRes, contactsRes, dueRes, countRes, activityRes, encounterRes] = await Promise.all([
    supabase
      .from('abc_profiles')
      .select(
        'full_name, email, public_email, phone, website, location, avatar_url, card_photo_url, company_logo_url, job_title, role, company_name, company, card_slug, card_published, card_accent'
      )
      .eq('id', user.id)
      .maybeSingle(),

    supabase
      .from('scanned_contacts')
      .select('id, name, role, company, photo_url, event_name, meeting_event_name, scanned_at')
      .eq('user_id', user.id)
      .order('scanned_at', { ascending: false })
      .limit(3),

    supabase
      .from('scanned_contacts')
      .select('next_action_date')
      .eq('user_id', user.id)
      .not('next_action_date', 'is', null),

    supabase
      .from('scanned_contacts')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id),

    supabase
      .from('crm_activities')
      .select('id, contact_id, activity_type, activity_detail, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(4),

    /*
      One query for the event workspaces card. Grouping happens in memory, so
      the dashboard pays a single round trip for it rather than one per event.
    */
    supabase
      .from('contact_encounters')
      .select('id, contact_id, met_at, event, event_normalized, follow_up_at')
      .eq('user_id', user.id)
      .order('met_at', { ascending: false })
      .limit(1000),
  ])

  const profile = profileRes.data
  const contacts: DashboardContact[] = (contactsRes.data ?? []).map((row) => ({
    id: String(row.id),
    name: row.name || 'Unnamed contact',
    role: row.role,
    company: row.company,
    photoUrl: row.photo_url,
    eventName: row.meeting_event_name || row.event_name,
    scannedAt: row.scanned_at,
  }))

  // Resolve activity → contact identity in one extra round trip.
  const activityRows = activityRes.data ?? []
  const activityContactIds = Array.from(
    new Set(activityRows.map((row) => row.contact_id).filter(Boolean))
  ) as string[]

  let contactLookup: Record<
    string,
    { name: string | null; photo: string | null; event: string | null }
  > = {}

  if (activityContactIds.length > 0) {
    const { data: linked } = await supabase
      .from('scanned_contacts')
      .select('id, name, photo_url, event_name, meeting_event_name')
      .in('id', activityContactIds)

    contactLookup = Object.fromEntries(
      (linked ?? []).map((row) => [
        String(row.id),
        {
          name: row.name,
          photo: row.photo_url,
          event: row.meeting_event_name || row.event_name,
        },
      ])
    )
  }

  const activity: DashboardActivity[] = activityRows.map((row) => {
    const linked = row.contact_id ? contactLookup[String(row.contact_id)] : undefined
    return {
      id: String(row.id),
      contactId: row.contact_id ? String(row.contact_id) : null,
      contactName: linked?.name ?? null,
      contactPhoto: linked?.photo ?? null,
      eventName: linked?.event ?? null,
      type: row.activity_type,
      detail: row.activity_detail,
      createdAt: row.created_at,
    }
  })

  /*
    The event workspaces, from the encounters just fetched. No CRM mapping is
    read here, so the card shows people and follow-ups only — the numbers it
    can state truthfully from one query.
  */
  const events = groupEncountersIntoEvents({
    encounters: (encounterRes.data ?? []).map((row) => ({
      id: String(row.id),
      contactId: String(row.contact_id),
      metAt: row.met_at ?? null,
      event: row.event ?? null,
      eventNormalized: row.event_normalized ?? null,
      discussed: null,
      nextAction: null,
      followUpAt: row.follow_up_at ?? null,
    })),
    people: new Map(),
    crmByEncounter: new Map(),
  })

  return {
    firstName: firstNameOf(profile?.full_name ?? null, profile?.email ?? user.email ?? null),
    events: events.slice(0, 3),
    contacts,
    contactsTotal: countRes.count ?? contacts.length,
    followUps: bucketFollowUps(dueRes.data ?? []),
    activity,
    card: {
      fullName: profile?.full_name || 'Your name',
      jobTitle: profile?.job_title || profile?.role || null,
      companyName: profile?.company_name || profile?.company || null,
      photoUrl: profile?.card_photo_url || profile?.avatar_url || null,
      logoUrl: profile?.company_logo_url || null,
      phone: profile?.phone || null,
      email: profile?.public_email || profile?.email || null,
      website: profile?.website || null,
      location: profile?.location || null,
      accent: profile?.card_accent || '#d9a441',
      slug: profile?.card_slug || null,
      published: Boolean(profile?.card_published),
    },
  }
}
