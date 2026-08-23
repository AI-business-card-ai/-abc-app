import { bucketFor, type FollowUpBucket } from '@/lib/followups'
import { sourceLabel } from '@/lib/contacts-view'
import { createServerComponentClient } from '@/lib/supabase-server'

/**
 * Everything the rebuilt contact detail renders.
 *
 * The column list is explicit and deliberately excludes the enrichment surface
 * (company size, revenue, funding, technologies, lead score, pipeline stage).
 * Those columns still exist for the legacy screens; this page never reads them.
 */
const CONTACT_COLUMNS = [
  'id',
  'name',
  'first_name',
  'last_name',
  'role',
  'company',
  'email',
  'phone',
  'mobile_phone',
  'website',
  'linkedin_url',
  'photo_url',
  'billing_city',
  'billing_country',
  'event_name',
  'meeting_event_name',
  'meeting_event_date',
  'meeting_location',
  'meeting_date',
  'raw_event_text',
  'meeting_topic',
  'notes',
  'next_action',
  'next_step',
  'next_action_date',
  'source',
  'scanned_at',
].join(', ')

export type ContactDetail = {
  id: string
  name: string
  firstName: string | null
  role: string | null
  company: string | null
  email: string | null
  phone: string | null
  website: string | null
  linkedinUrl: string | null
  photoUrl: string | null
  location: string | null

  /** Meeting context — the part a phonebook loses. */
  event: string | null
  metAt: string | null
  discussed: string | null
  notes: string | null
  nextStep: string | null
  followUpAt: string | null
  followUp: FollowUpBucket | null

  sourceLabel: string | null
  scannedAt: string | null

  /**
   * Every meeting with this person, newest first.
   *
   * The meeting-context fields above are the newest of these projected onto the
   * contact. They are read here rather than recomputed so the screen and the
   * rest of the app — follow-ups, the dashboard, the list — cannot disagree.
   */
  encounters: ContactEncounterView[]
}

/** One meeting, as the detail screen renders it. */
export type ContactEncounterView = {
  id: string
  metAt: string | null
  event: string | null
  discussed: string | null
  nextAction: string | null
  followUpAt: string | null
}

export type CrmConnections = {
  hubspot: boolean
  salesforce: boolean
}

export type ContactDetailData = {
  contact: ContactDetail
  crm: CrmConnections
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

export async function getContactDetail(id: string): Promise<ContactDetailData | null> {
  const supabase = createServerComponentClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const [contactRes, profileRes, encounterRes] = await Promise.all([
    supabase
      .from('scanned_contacts')
      .select(CONTACT_COLUMNS)
      .eq('id', id)
      .eq('user_id', user.id)
      .maybeSingle(),
    supabase
      .from('abc_profiles')
      .select('hubspot_access_token, salesforce_access_token')
      .eq('id', user.id)
      .maybeSingle(),
    // Owner-scoped as well as contact-scoped: RLS already restricts this, and
    // the explicit filter means a mistake returns nothing rather than trusting
    // the policy to be the only thing standing there.
    supabase
      .from('contact_encounters')
      .select('id, met_at, event, discussed, next_action, follow_up_at')
      .eq('contact_id', id)
      .eq('user_id', user.id)
      // Same ordering the context route uses to decide which encounter counts
      // as the latest. If the two disagreed, the card at the top of the screen
      // could offer to edit one meeting while the server projected another.
      .order('met_at', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(50),
  ])

  const row = contactRes.data as Record<string, unknown> | null
  if (!row) return null

  const name =
    firstOf(row.name, [clean(row.first_name), clean(row.last_name)].filter(Boolean).join(' ')) ??
    'Unnamed contact'

  return {
    contact: {
      id: String(row.id),
      name,
      firstName: firstOf(row.first_name, name.split(/\s+/)[0]),
      role: clean(row.role),
      company: clean(row.company),
      email: clean(row.email),
      phone: firstOf(row.phone, row.mobile_phone),
      website: clean(row.website),
      linkedinUrl: clean(row.linkedin_url),
      photoUrl: clean(row.photo_url),
      location: firstOf(
        [clean(row.billing_city), clean(row.billing_country)].filter(Boolean).join(', ')
      ),

      event: firstOf(
        row.meeting_event_name,
        row.event_name,
        row.raw_event_text,
        row.meeting_location
      ),
      metAt: firstOf(row.meeting_date, row.meeting_event_date, row.scanned_at),
      discussed: clean(row.meeting_topic),
      notes: clean(row.notes),
      nextStep: firstOf(row.next_action, row.next_step),
      followUpAt: clean(row.next_action_date),
      followUp: bucketFor(clean(row.next_action_date)),

      sourceLabel: sourceLabel(clean(row.source)),
      scannedAt: clean(row.scanned_at),

      encounters: ((encounterRes.data || []) as Record<string, unknown>[]).map((e) => ({
        id: String(e.id),
        metAt: clean(e.met_at),
        event: clean(e.event),
        discussed: clean(e.discussed),
        nextAction: clean(e.next_action),
        followUpAt: clean(e.follow_up_at),
      })),
    },
    crm: {
      hubspot: Boolean(profileRes.data?.hubspot_access_token),
      salesforce: Boolean(profileRes.data?.salesforce_access_token),
    },
  }
}
