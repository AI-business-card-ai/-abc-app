import { bucketFor, type FollowUpBucket } from '@/lib/followups'
import { sourceLabel } from '@/lib/contacts-view'
import { createServerComponentClient } from '@/lib/supabase-server'
import { getCrmConnectionStatus, type CrmProvider } from '@/lib/crm/connections'
import { CRM_PROVIDERS } from '@/lib/crm/providers'

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

/**
 * Connection state for every provider ABC ships, as the sidebar renders it.
 *
 * Keyed by provider rather than a field per CRM, because a field per CRM is
 * what let Pipedrive be forgotten here for an entire release while it worked
 * everywhere else. Adding a provider to `CRM_PROVIDERS` now makes this a type
 * error until it is populated, instead of silently omitting it.
 *
 * Carries `needsReconnect` alongside `connected` so this agrees with the push
 * card rather than approximating it: a connection whose refresh has failed is
 * not the same thing as a live one, and calling both "Connected" is how a
 * summary starts lying about the thing it summarises.
 */
export type CrmConnectionSummary = {
  connected: boolean
  needsReconnect: boolean
}

export type CrmConnections = Record<CrmProvider, CrmConnectionSummary>

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

  const [contactRes, encounterRes, connectionStatuses] = await Promise.all([
    supabase
      .from('scanned_contacts')
      .select(CONTACT_COLUMNS)
      .eq('id', id)
      .eq('user_id', user.id)
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
    /*
      Connection state for every provider, from the one place that knows it.

      HubSpot was moved to `crm_connections` when the secure store arrived;
      Salesforce and Pipedrive were not, and the sidebar kept asking
      `abc_profiles` for a `salesforce_access_token` that the Salesforce
      migration had already dropped. PostgREST answered that with
      `42703: column does not exist`, the code read only `.data` and never
      `.error`, so the failure arrived as `null` and rendered as
      "Not connected" — permanently, and for a CRM that was connected and
      pushing records from the same screen.

      Asking per provider from `CRM_PROVIDERS` means a fourth CRM cannot be
      forgotten here the way the third one was.
    */
    Promise.all(CRM_PROVIDERS.map((p) => getCrmConnectionStatus(user.id, p.id))),
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
    crm: Object.fromEntries(
      connectionStatuses.map((s) => [
        s.provider,
        { connected: s.connected, needsReconnect: s.needsReconnect },
      ])
    ) as CrmConnections,
  }
}
