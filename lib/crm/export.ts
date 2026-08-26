import { createServerSupabase } from '@/lib/supabase'
import { getMapping, saveMapping, type MappingKey } from '@/lib/crm/mappings'
import * as hubspot from '@/lib/crm/providers/hubspot'
import {
  companyDomainFrom,
  notStarted,
  step,
  type CrmProvider,
  type ExportContact,
  type ExportEncounter,
  type ExportResult,
  type ExportStep,
} from '@/lib/crm/types'

/**
 * Pushing one meeting, and the person it was with, into a CRM.
 *
 * Five steps in order — contact, company, association, meeting, task — and each
 * one records what it made the moment the provider confirms it. That ordering
 * and that recording are the whole design: if the meeting fails, the contact
 * and company are already remembered, so pressing Push again reuses them and
 * retries only what is left. Nothing here is a transaction, because the far
 * side is somebody else's API and cannot be rolled back; the mapping table is
 * what makes a partial success safe to repeat.
 *
 * Explicit only. Nothing in the scan, save, add-meeting or follow-up paths
 * calls this — sending a customer's contacts into their CRM is an action they
 * take, not one that happens to them.
 */

/** Read from the database at export time, never taken from the request. */
async function loadContactAndEncounter(
  ownerId: string,
  contactId: string,
  encounterId: string
): Promise<{ contact: ExportContact; encounter: ExportEncounter } | null> {
  const supabase = createServerSupabase()

  const [contactRes, encounterRes] = await Promise.all([
    supabase
      .from('scanned_contacts')
      .select('id, name, first_name, last_name, email, phone, mobile_phone, role, company, website')
      .eq('id', contactId)
      .eq('user_id', ownerId)
      .maybeSingle(),
    /*
      All three of meeting, contact and owner must agree. Owner alone is
      satisfied by every contact this person owns, which would let a stale
      client export one contact's meeting under another contact's name.
    */
    supabase
      .from('contact_encounters')
      .select('id, met_at, event, event_normalized, discussed, next_action, follow_up_at')
      .eq('id', encounterId)
      .eq('contact_id', contactId)
      .eq('user_id', ownerId)
      .maybeSingle(),
  ])

  const c = contactRes.data as Record<string, unknown> | null
  const e = encounterRes.data as Record<string, unknown> | null
  if (!c || !e) return null

  const text = (v: unknown): string | null => {
    const s = typeof v === 'string' ? v.trim() : ''
    return s || null
  }

  return {
    contact: {
      id: String(c.id),
      firstName: text(c.first_name),
      lastName: text(c.last_name),
      fullName: text(c.name),
      email: text(c.email),
      phone: text(c.phone) || text(c.mobile_phone),
      jobTitle: text(c.role),
      companyName: text(c.company),
      website: text(c.website),
    },
    encounter: {
      id: String(e.id),
      metAt: String(e.met_at),
      // The sanitized event name when there is one; both went through the
      // Phase 6 sanitizer, so neither can carry model prose.
      event: text(e.event_normalized) || text(e.event),
      discussed: text(e.discussed),
      nextAction: text(e.next_action),
      followUpAt: text(e.follow_up_at),
    },
  }
}

function failureStep(error: hubspot.HubSpotError): ExportStep {
  return step('failed', { message: error.message })
}

/** A failure the owner should be told to wait out rather than investigate. */
function isRetryable(error: hubspot.HubSpotError): boolean {
  return error.kind === 'rate_limited' || error.kind === 'server' || error.status === 0
}

export type ExportArgs = {
  ownerId: string
  provider: CrmProvider
  contactId: string
  encounterId: string
}

export async function pushContactEncounterToCrm(args: ExportArgs): Promise<ExportResult> {
  const base: ExportResult = {
    provider: args.provider,
    ok: false,
    contact: notStarted,
    company: notStarted,
    association: notStarted,
    meeting: notStarted,
    task: notStarted,
  }

  const loaded = await loadContactAndEncounter(args.ownerId, args.contactId, args.encounterId)
  if (!loaded) {
    return { ...base, contact: step('failed', { message: 'Contact or meeting not found.' }) }
  }
  const { contact, encounter } = loaded

  const tokenResult = await hubspot.getToken(args.ownerId)
  if (!tokenResult.ok) {
    return {
      ...base,
      needsReconnect: tokenResult.needsReconnect,
      contact: step('failed', { message: tokenResult.message }),
    }
  }
  const token = tokenResult.token

  const key = (localType: MappingKey['localType'], localId: string, remoteType: MappingKey['remoteType']): MappingKey => ({
    ownerId: args.ownerId,
    provider: args.provider,
    localType,
    localId,
    remoteType,
  })

  const result: ExportResult = { ...base }

  // ---- 1. Contact -------------------------------------------------------
  // Mapping first, then an exact email match, then create. Never a name or a
  // phone: two people at one company share neither an identity nor a desk
  // phone in any way a matcher can tell apart.
  const contactKey = key('contact', contact.id, 'contact')
  let hubspotContactId = await getMapping(contactKey)

  if (hubspotContactId) {
    result.contact = step('reused', { remoteId: hubspotContactId })
  } else {
    if (contact.email) {
      const found = await hubspot.findContactByEmail(token, contact.email)
      if (!found.ok) {
        return { ...result, contact: failureStep(found.error), needsReconnect: found.error.kind === 'unauthorized', retryable: isRetryable(found.error) }
      }
      hubspotContactId = found.data
    }

    if (hubspotContactId) {
      await saveMapping(contactKey, hubspotContactId)
      result.contact = step('reused', { remoteId: hubspotContactId })
    } else {
      const created = await hubspot.createContact(token, contact)
      if (!created.ok) {
        return { ...result, contact: failureStep(created.error), needsReconnect: created.error.kind === 'unauthorized', retryable: isRetryable(created.error) }
      }
      hubspotContactId = created.data
      await saveMapping(contactKey, hubspotContactId)
      result.contact = step('created', { remoteId: hubspotContactId })
    }
  }

  // ---- 2. Company -------------------------------------------------------
  // Skipped entirely without a company name. A domain is only ever taken from
  // the company's website, so a contact reachable at gmail.com does not invent
  // a company called Gmail.
  let hubspotCompanyId: string | null = null

  if (!contact.companyName) {
    result.company = step('skipped', { message: 'No company on this contact.' })
  } else {
    const companyKey = key('company', contact.id, 'company')
    hubspotCompanyId = await getMapping(companyKey)

    if (hubspotCompanyId) {
      result.company = step('reused', { remoteId: hubspotCompanyId })
    } else {
      const domain = companyDomainFrom(contact.website)
      let ambiguous = false

      if (domain) {
        const found = await hubspot.findCompanyByDomain(token, domain)
        if (found.ok) {
          if (found.data.kind === 'one') hubspotCompanyId = found.data.id
          // Several companies already share this domain. Choosing one would be
          // a guess, and creating another would add to the pile — so the step
          // stops here and says so, and the owner decides in HubSpot.
          if (found.data.kind === 'conflict') ambiguous = true
        }
      }

      if (ambiguous) {
        result.company = step('failed', {
          message: `More than one HubSpot company uses ${domain}. Resolve it there, then push again.`,
        })
      } else if (hubspotCompanyId) {
        await saveMapping(companyKey, hubspotCompanyId)
        result.company = step('reused', { remoteId: hubspotCompanyId })
      } else {
        const created = await hubspot.createCompany(token, { name: contact.companyName, domain })
        if (created.ok) {
          hubspotCompanyId = created.data
          await saveMapping(companyKey, hubspotCompanyId)
          // Created, not matched — said plainly, because "reused" would claim
          // we recognised an existing company when we did not.
          result.company = step('created', { remoteId: hubspotCompanyId })
        } else {
          // A company is context, not the point of the export. The meeting is
          // still worth writing, so this records the failure and continues.
          result.company = failureStep(created.error)
        }
      }
    }
  }

  // ---- 3. Contact ↔ Company --------------------------------------------
  if (!hubspotCompanyId) {
    result.association = step('skipped', { message: 'No company to associate.' })
  } else {
    const linked = await hubspot.associate(
      token,
      { type: 'contacts', id: hubspotContactId },
      { type: 'companies', id: hubspotCompanyId }
    )
    result.association = linked.ok ? step('synced') : failureStep(linked.error)
  }

  // ---- 4. Meeting -------------------------------------------------------
  // One encounter, one meeting, for ever. A second push revises the meeting it
  // already made instead of recording that the same conversation happened
  // twice.
  const meetingKey = key('encounter', encounter.id, 'meeting')
  const existingMeeting = await getMapping(meetingKey)

  const meeting = existingMeeting
    ? await hubspot.updateMeeting(token, existingMeeting, contact, encounter)
    : await hubspot.createMeeting(token, contact, encounter)

  if (!meeting.ok) {
    result.meeting = failureStep(meeting.error)
    result.retryable = isRetryable(meeting.error)
  } else {
    if (!existingMeeting) await saveMapping(meetingKey, meeting.data)
    result.meeting = step(existingMeeting ? 'synced' : 'created', { remoteId: meeting.data })

    const links = [
      hubspot.associate(token, { type: 'meetings', id: meeting.data }, { type: 'contacts', id: hubspotContactId }),
      ...(hubspotCompanyId
        ? [hubspot.associate(token, { type: 'meetings', id: meeting.data }, { type: 'companies', id: hubspotCompanyId })]
        : []),
    ]
    await Promise.all(links)
  }

  // ---- 5. Task ----------------------------------------------------------
  // Only when a follow-up date exists. No date means nothing was promised, and
  // a placeholder task would be a reminder about nothing.
  if (!encounter.followUpAt) {
    result.task = step('skipped', { message: 'No follow-up date on this meeting.' })
  } else {
    const taskKey = key('follow_up', encounter.id, 'task')
    const existingTask = await getMapping(taskKey)

    const task = existingTask
      ? await hubspot.updateTask(token, existingTask, contact, encounter)
      : await hubspot.createTask(token, contact, encounter)

    if (!task.ok) {
      result.task = failureStep(task.error)
      result.retryable = result.retryable || isRetryable(task.error)
    } else {
      if (!existingTask) await saveMapping(taskKey, task.data)
      result.task = step(existingTask ? 'synced' : 'created', { remoteId: task.data })

      await hubspot.associate(token, { type: 'tasks', id: task.data }, { type: 'contacts', id: hubspotContactId })
      if (hubspotCompanyId) {
        await hubspot.associate(token, { type: 'tasks', id: task.data }, { type: 'companies', id: hubspotCompanyId })
      }
    }
  }

  // The person and the meeting are what this exists to move; a company that
  // could not be created is a gap, not a failed export.
  const meetingOk = result.meeting.state !== 'failed'
  const contactOk = result.contact.state !== 'failed'
  result.ok = contactOk && meetingOk && result.task.state !== 'failed'

  return result
}
