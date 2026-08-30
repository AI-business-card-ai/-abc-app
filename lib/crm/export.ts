import { createServerSupabase } from '@/lib/supabase'
import { getMapping, saveMapping, type MappingKey } from '@/lib/crm/mappings'
import * as hubspot from '@/lib/crm/providers/hubspot'
import * as pipedrive from '@/lib/crm/providers/pipedrive'
import * as salesforce from '@/lib/crm/providers/salesforce'
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

/**
 * Record what the provider just made, and stop the export if that failed.
 *
 * Returns null when the mapping is safely stored, or the failure step to report
 * when it is not. Callers return immediately on a failure step, which leaves
 * every later step `not_started` rather than `skipped` — nothing was decided
 * about them, and saying otherwise would be a claim we cannot support.
 *
 * Failing closed here is the whole point. The remote object exists by the time
 * this runs; without its mapping, ABC has lost deterministic identity for it,
 * and the next push would create a second one. A meeting or a follow-up cannot
 * be rediscovered from ABC data at all, and a Pipedrive organization created
 * without a domain usually cannot either. "We can probably find it again" is
 * not a recovery plan.
 */
async function persistMapping(key: MappingKey, remoteId: string): Promise<ExportStep | null> {
  const saved = await saveMapping(key, remoteId)
  if (saved.ok) return null

  return step('failed', {
    remoteId,
    reason: saved.reason,
    message:
      saved.reason === 'mapping_conflict'
        ? 'This is already linked to a different record in your CRM. Resolve it there, then push again.'
        : 'Created in your CRM, but ABC could not save the link to it. Pushing again is paused so it cannot be duplicated.',
  })
}

export type ExportArgs = {
  ownerId: string
  provider: CrmProvider
  contactId: string
  encounterId: string
}

/**
 * Push one meeting into whichever CRM the owner asked for.
 *
 * Reading the canonical contact and encounter happens once, here, because it is
 * the same work whoever the provider is and it is the part that must not vary:
 * the same person and the same meeting are exported no matter where they are
 * going. Choosing the destination is the only branch.
 */
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

  if (args.provider === 'pipedrive') return pushToPipedrive(args, base, loaded)
  if (args.provider === 'salesforce') return pushToSalesforce(args, base, loaded)
  return pushToHubSpot(args, base, loaded)
}

type Loaded = { contact: ExportContact; encounter: ExportEncounter }

async function pushToHubSpot(
  args: ExportArgs,
  base: ExportResult,
  loaded: Loaded
): Promise<ExportResult> {
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
      const contactSaved = await persistMapping(contactKey, hubspotContactId)
      if (contactSaved) return { ...result, contact: contactSaved }
      result.contact = step('reused', { remoteId: hubspotContactId })
    } else {
      const created = await hubspot.createContact(token, contact)
      if (!created.ok) {
        return { ...result, contact: failureStep(created.error), needsReconnect: created.error.kind === 'unauthorized', retryable: isRetryable(created.error) }
      }
      hubspotContactId = created.data
      const contactStored = await persistMapping(contactKey, hubspotContactId)
      if (contactStored) return { ...result, contact: contactStored }
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
        const companySaved = await persistMapping(companyKey, hubspotCompanyId)
        if (companySaved) return { ...result, company: companySaved }
        result.company = step('reused', { remoteId: hubspotCompanyId })
      } else {
        const created = await hubspot.createCompany(token, { name: contact.companyName, domain })
        if (created.ok) {
          hubspotCompanyId = created.data
          const companyStored = await persistMapping(companyKey, hubspotCompanyId)
          if (companyStored) return { ...result, company: companyStored }
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
    if (!existingMeeting) {
      const meetingStored = await persistMapping(meetingKey, meeting.data)
      if (meetingStored) return { ...result, meeting: meetingStored }
    }
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
      if (!existingTask) {
        const taskStored = await persistMapping(taskKey, task.data)
        if (taskStored) return { ...result, task: taskStored }
      }
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

/**
 * The same five steps, against Pipedrive's object model.
 *
 * The order differs from HubSpot's in one place, and Pipedrive's data model is
 * the reason. There is no association object here: a person carries an `org_id`
 * field naming its employer. So the organization is resolved *before* the
 * person, and a new person is created already attached — one call instead of
 * two, and no association that could half-exist.
 *
 * Everything else is the proven shape: resolve, record the mapping the moment
 * the provider confirms it, and let a retry reuse what already exists.
 */
async function pushToPipedrive(
  args: ExportArgs,
  base: ExportResult,
  loaded: Loaded
): Promise<ExportResult> {
  const { contact, encounter } = loaded

  const accessResult = await pipedrive.getAccess(args.ownerId)
  if (!accessResult.ok) {
    return {
      ...base,
      needsReconnect: accessResult.needsReconnect,
      contact: step('failed', { message: accessResult.message }),
    }
  }
  const access = accessResult.access

  const key = (
    localType: MappingKey['localType'],
    localId: string,
    remoteType: MappingKey['remoteType']
  ): MappingKey => ({
    ownerId: args.ownerId,
    provider: args.provider,
    localType,
    localId,
    remoteType,
  })

  // Pipedrive ids are numbers; mappings store strings, as they must to hold
  // HubSpot's too. Anything unparseable is treated as no mapping at all.
  const asId = (value: string | null): number | null => {
    const id = value === null ? NaN : Number(value)
    return Number.isFinite(id) && id > 0 ? id : null
  }

  const failureStep = (error: pipedrive.PipedriveError): ExportStep =>
    step('failed', { message: error.message })
  const isRetryablePd = (error: pipedrive.PipedriveError): boolean =>
    error.kind === 'rate_limited' || error.kind === 'server' || error.status === 0

  const result: ExportResult = { ...base }

  // ---- 1. Organization --------------------------------------------------
  // First, because a person is created already holding its org_id. Skipped
  // without a company name: Pipedrive has nothing else to identify one by.
  let orgId: number | null = null

  if (!contact.companyName) {
    result.company = step('skipped', { message: 'No company on this contact.' })
  } else {
    const companyKey = key('company', contact.id, 'organization')
    orgId = asId(await getMapping(companyKey))

    if (orgId) {
      result.company = step('reused', { remoteId: String(orgId) })
    } else {
      /*
        A name is not an identity.

        Pipedrive will not let you search an organization's website — name,
        address and notes are the searchable set — so a name search is the only
        way to find anything at all. But "Apex Solutions" is a dozen unrelated
        companies, and quietly merging this customer's meeting into the wrong
        one is a mistake nobody notices and no later push undoes. A duplicate
        organization, by contrast, is visible and mergeable in an afternoon.

        So the name search is candidate discovery only. Identity is confirmed
        by domain, against the company's own website, and a candidate that
        cannot be confirmed is never used — not one that has a different
        domain, and not one that has no website at all.
      */
      const abcDomain = companyDomainFrom(contact.website)

      if (!abcDomain) {
        // Nothing to confirm against. Creating is the honest outcome: it may
        // duplicate an organization that already exists, and that is the
        // failure we are choosing over merging two different companies.
        const created = await pipedrive.createOrganization(access, {
          name: contact.companyName,
          website: contact.website,
        })
        if (created.ok) {
          orgId = created.data
          const orgStored = await persistMapping(companyKey, String(orgId))
          if (orgStored) return { ...result, company: orgStored }
          result.company = step('created', {
            remoteId: String(orgId),
            message: 'Created without matching: no company website to confirm identity against.',
          })
        } else {
          result.company = failureStep(created.error)
        }
      } else {
        const candidates = await pipedrive.findOrganizationCandidatesByName(access, contact.companyName)

        // Confirm each candidate by its own website, normalised exactly the way
        // ABC's was, so the comparison is between like and like.
        const confirmed: number[] = []
        if (candidates.ok) {
          for (const candidateId of candidates.data) {
            const website = await pipedrive.getOrganizationWebsite(access, candidateId)
            if (!website.ok) continue
            if (companyDomainFrom(website.data) === abcDomain) confirmed.push(candidateId)
          }
        }

        if (confirmed.length > 1) {
          // Several organizations genuinely claim this domain. Choosing one
          // would be a guess and creating another would add to the pile.
          result.company = step('failed', {
            message: `More than one Pipedrive organization uses ${abcDomain}. Resolve it there, then push again.`,
          })
        } else if (confirmed.length === 1) {
          orgId = confirmed[0]
          const orgSaved = await persistMapping(companyKey, String(orgId))
          if (orgSaved) return { ...result, company: orgSaved }
          result.company = step('reused', { remoteId: String(orgId) })
        } else {
          const created = await pipedrive.createOrganization(access, {
            name: contact.companyName,
            website: contact.website,
          })
          if (created.ok) {
            orgId = created.data
            const orgCreatedStored = await persistMapping(companyKey, String(orgId))
            if (orgCreatedStored) return { ...result, company: orgCreatedStored }
            result.company = step('created', { remoteId: String(orgId) })
          } else {
            // Context, not the point of the export. The meeting is still worth
            // writing, so this records the failure and carries on.
            result.company = failureStep(created.error)
          }
        }
      }
    }
  }

  // ---- 2. Person --------------------------------------------------------
  // Mapping, then an exact email match, then create. Never a name and never a
  // phone: two people at one company share neither in any way a matcher can
  // tell apart.
  const personKey = key('contact', contact.id, 'person')
  let personId = asId(await getMapping(personKey))

  if (personId) {
    result.contact = step('reused', { remoteId: String(personId) })
  } else {
    if (contact.email) {
      const found = await pipedrive.findPersonByEmail(access, contact.email)
      if (!found.ok) {
        return {
          ...result,
          contact: failureStep(found.error),
          needsReconnect: found.error.kind === 'unauthorized',
          retryable: isRetryablePd(found.error),
        }
      }
      // Two people sharing one address is ambiguous, and picking either would
      // attach this meeting to a coin toss.
      if (found.data.kind === 'conflict') {
        return {
          ...result,
          contact: step('failed', {
            message: `More than one Pipedrive person uses ${contact.email}. Resolve it there, then push again.`,
          }),
        }
      }
      if (found.data.kind === 'one') personId = found.data.id
    }

    if (personId) {
      const personSaved = await persistMapping(personKey, String(personId))
      if (personSaved) return { ...result, contact: personSaved }
      result.contact = step('reused', { remoteId: String(personId) })
    } else {
      const created = await pipedrive.createPerson(access, contact, orgId)
      if (!created.ok) {
        return {
          ...result,
          contact: failureStep(created.error),
          needsReconnect: created.error.kind === 'unauthorized',
          retryable: isRetryablePd(created.error),
        }
      }
      personId = created.data
      const personStored = await persistMapping(personKey, String(personId))
      if (personStored) return { ...result, contact: personStored }
      result.contact = step('created', { remoteId: String(personId) })
    }
  }

  // ---- 3. Person to Organization ----------------------------------------
  // A field on the person, so a newly created one already carries it and only a
  // reused person can still need it. Writing the same org_id twice is the same
  // person with the same employer, so repeating it cannot duplicate anything.
  if (!orgId) {
    result.association = step('skipped', { message: 'No organization to link.' })
  } else if (result.contact.state === 'created') {
    result.association = step('synced')
  } else {
    const linked = await pipedrive.setPersonOrganization(access, personId, orgId)
    result.association = linked.ok ? step('synced') : failureStep(linked.error)
  }

  // ---- 4. Meeting activity ----------------------------------------------
  // One encounter, one activity, for ever. A second push revises the activity
  // it already made instead of recording the same conversation twice.
  const meetingType = await pipedrive.findActivityTypeKey(access, 'meeting')
  const meetingKey = key('encounter', encounter.id, 'activity')
  const existingMeeting = asId(await getMapping(meetingKey))

  const meeting = existingMeeting
    ? await pipedrive.updateMeetingActivity(
        access, existingMeeting, contact, encounter, meetingType, personId, orgId
      )
    : await pipedrive.createMeetingActivity(
        access, contact, encounter, meetingType, personId, orgId
      )

  if (!meeting.ok) {
    result.meeting = failureStep(meeting.error)
    result.retryable = isRetryablePd(meeting.error)
  } else {
    if (!existingMeeting) {
      const meetingStored = await persistMapping(meetingKey, String(meeting.data))
      if (meetingStored) return { ...result, meeting: meetingStored }
    }
    result.meeting = step(existingMeeting ? 'synced' : 'created', { remoteId: String(meeting.data) })
  }

  // ---- 5. Follow-up activity --------------------------------------------
  // Only when a follow-up date exists. No date means nothing was promised, and
  // a placeholder task would be a reminder about nothing.
  if (!encounter.followUpAt) {
    result.task = step('skipped', { message: 'No follow-up date on this meeting.' })
  } else {
    const followUpKey = key('follow_up', encounter.id, 'activity')
    const existingFollowUp = asId(await getMapping(followUpKey))
    const followUpType = await pipedrive.findActivityTypeKey(access, 'task')

    const task = existingFollowUp
      ? await pipedrive.updateFollowUpActivity(
          access, existingFollowUp, contact, encounter, followUpType, personId, orgId
        )
      : await pipedrive.createFollowUpActivity(
          access, contact, encounter, followUpType, personId, orgId
        )

    if (!task.ok) {
      result.task = failureStep(task.error)
      result.retryable = result.retryable || isRetryablePd(task.error)
    } else {
      if (!existingFollowUp) {
        const followUpStored = await persistMapping(followUpKey, String(task.data))
        if (followUpStored) return { ...result, task: followUpStored }
      }
      result.task = step(existingFollowUp ? 'synced' : 'created', { remoteId: String(task.data) })
    }
  }

  // The person and the meeting are what this exists to move; an organization
  // that could not be created is a gap, not a failed export.
  result.ok =
    result.contact.state !== 'failed' &&
    result.meeting.state !== 'failed' &&
    result.task.state !== 'failed'

  return result
}

/**
 * The same five steps, against Salesforce's object model.
 *
 * The order follows Pipedrive's rather than HubSpot's, and for the same reason:
 * Salesforce has no association object between a person and their employer. A
 * Contact carries `AccountId`, so the Account is resolved first and a new
 * Contact is created already attached.
 *
 * Everything else is the proven shape: resolve, record the mapping the moment
 * the provider confirms it, stop if that mapping cannot be stored, and let a
 * retry reuse what already exists.
 */
async function pushToSalesforce(
  args: ExportArgs,
  base: ExportResult,
  loaded: Loaded
): Promise<ExportResult> {
  const { contact, encounter } = loaded

  const accessResult = await salesforce.getAccess(args.ownerId)
  if (!accessResult.ok) {
    return {
      ...base,
      needsReconnect: accessResult.needsReconnect,
      contact: step('failed', { message: accessResult.message }),
    }
  }
  const access = accessResult.access

  const key = (
    localType: MappingKey['localType'],
    localId: string,
    remoteType: MappingKey['remoteType']
  ): MappingKey => ({
    ownerId: args.ownerId,
    provider: args.provider,
    localType,
    localId,
    remoteType,
  })

  const failureStep = (error: salesforce.SalesforceError): ExportStep =>
    step('failed', { message: error.message })
  const isRetryableSf = (error: salesforce.SalesforceError): boolean =>
    error.kind === 'rate_limited' || error.kind === 'server' || error.status === 0

  const result: ExportResult = { ...base }

  // ---- 1. Account -------------------------------------------------------
  // First, because a Contact is created already holding its AccountId.
  let accountId: string | null = null

  if (!contact.companyName) {
    result.company = step('skipped', { message: 'No company on this contact.' })
  } else {
    const companyKey = key('company', contact.id, 'account')
    accountId = await getMapping(companyKey)

    if (accountId) {
      result.company = step('reused', { remoteId: accountId })
    } else {
      /*
        A name is not an identity, here as anywhere. Salesforce does let a
        query reach the website field, so discovery is a little wider than
        Pipedrive's — anything whose Website mentions the domain, plus anything
        whose Name matches exactly. But `LIKE` finds candidates and never
        accepts one: acme.com and notacme.com both match that pattern, so every
        candidate is confirmed by normalised domain before it is used.
      */
      const abcDomain = companyDomainFrom(contact.website)

      if (!abcDomain) {
        // Nothing to confirm against. Creating may duplicate an Account that
        // already exists, and that is the failure we choose over merging two
        // different companies.
        const created = await salesforce.createAccount(access, {
          name: contact.companyName,
          website: contact.website,
        })
        if (created.ok) {
          accountId = created.data
          const stored = await persistMapping(companyKey, accountId)
          if (stored) return { ...result, company: stored }
          result.company = step('created', {
            remoteId: accountId,
            message: 'Created without matching: no company website to confirm identity against.',
          })
        } else {
          result.company = failureStep(created.error)
        }
      } else {
        const candidates = await salesforce.findAccountCandidates(access, contact.companyName, abcDomain)

        const confirmed = candidates.ok
          ? candidates.data.filter((c) => companyDomainFrom(c.website) === abcDomain).map((c) => c.id)
          : []

        if (confirmed.length > 1) {
          result.company = step('failed', {
            message: `More than one Salesforce account uses ${abcDomain}. Resolve it there, then push again.`,
          })
        } else if (confirmed.length === 1) {
          accountId = confirmed[0]
          const stored = await persistMapping(companyKey, accountId)
          if (stored) return { ...result, company: stored }
          result.company = step('reused', { remoteId: accountId })
        } else {
          const created = await salesforce.createAccount(access, {
            name: contact.companyName,
            website: contact.website,
          })
          if (created.ok) {
            accountId = created.data
            const stored = await persistMapping(companyKey, accountId)
            if (stored) return { ...result, company: stored }
            result.company = step('created', { remoteId: accountId })
          } else {
            // Context, not the point of the export. The meeting is still worth
            // writing, so this records the failure and carries on.
            result.company = failureStep(created.error)
          }
        }
      }
    }
  }

  // ---- 2. Contact -------------------------------------------------------
  // Mapping, then an exact email match, then create. Never a name and never a
  // phone.
  const contactKey = key('contact', contact.id, 'contact')
  let sfContactId = await getMapping(contactKey)

  if (sfContactId) {
    result.contact = step('reused', { remoteId: sfContactId })
  } else {
    if (contact.email) {
      const found = await salesforce.findContactByEmail(access, contact.email)
      if (!found.ok) {
        return {
          ...result,
          contact: failureStep(found.error),
          needsReconnect: found.error.kind === 'unauthorized',
          retryable: isRetryableSf(found.error),
        }
      }
      if (found.data.kind === 'conflict') {
        return {
          ...result,
          contact: step('failed', {
            message: `More than one Salesforce contact uses ${contact.email}. Resolve it there, then push again.`,
          }),
        }
      }
      if (found.data.kind === 'one') sfContactId = found.data.id
    }

    if (sfContactId) {
      const stored = await persistMapping(contactKey, sfContactId)
      if (stored) return { ...result, contact: stored }
      result.contact = step('reused', { remoteId: sfContactId })
    } else {
      /*
        Salesforce will not accept a Contact without a last name, and inventing
        one — the previous integration used "Unknown" — puts a fiction in the
        customer's CRM under a real person's record. Refusing says what is
        actually wrong and leaves the contact fixable in ABC.
      */
      if (!salesforce.contactHasRequiredName(contact)) {
        return {
          ...result,
          contact: step('failed', {
            message: 'Salesforce needs a last name for this person. Add a name in ABC, then push again.',
          }),
        }
      }

      const created = await salesforce.createContact(access, contact, accountId)
      if (!created.ok) {
        return {
          ...result,
          contact: failureStep(created.error),
          needsReconnect: created.error.kind === 'unauthorized',
          retryable: isRetryableSf(created.error),
        }
      }
      sfContactId = created.data
      const stored = await persistMapping(contactKey, sfContactId)
      if (stored) return { ...result, contact: stored }
      result.contact = step('created', { remoteId: sfContactId })
    }
  }

  // ---- 3. Contact to Account -------------------------------------------
  // A field on the Contact, so a newly created one already carries it and only
  // a reused Contact can still need it. Writing the same AccountId twice is the
  // same person with the same employer.
  if (!accountId) {
    result.association = step('skipped', { message: 'No account to link.' })
  } else if (result.contact.state === 'created') {
    result.association = step('synced')
  } else {
    const linked = await salesforce.setContactAccount(access, sfContactId, accountId)
    result.association = linked.ok ? step('synced') : failureStep(linked.error)
  }

  /*
    The org's own Task statuses, asked for once and shared by both activities.

    Not an Event. Salesforce will not accept a timed Event without a duration or
    an end time, and ABC knows neither — only when the meeting started. A
    completed Task has no duration field to fill in, so nothing is invented, and
    it lands in Activity History where a thing that already happened belongs.
  */
  const statuses = await salesforce.findTaskStatuses(access)
  const closedStatus = statuses.ok ? statuses.data.closed : null

  // ---- 4. Meeting, as a completed Task ----------------------------------
  // One encounter, one Task, for ever. A second push revises the Task it
  // already made instead of logging the same conversation twice.
  const meetingKey = key('encounter', encounter.id, 'task')
  const existingMeeting = await getMapping(meetingKey)

  if (!closedStatus) {
    /*
      Without a closed status there is no honest way to record a meeting that
      already happened. Creating an open Task instead would put a past
      conversation in somebody's to-do list and call it outstanding work.
    */
    result.meeting = step('failed', {
      message: 'Salesforce has no completed task status ABC can use. Ask your admin, then push again.',
    })
  } else {
    const meeting = existingMeeting
      ? await salesforce.updateMeetingTask(access, existingMeeting, contact, encounter, sfContactId, accountId, closedStatus)
      : await salesforce.createMeetingTask(access, contact, encounter, sfContactId, accountId, closedStatus)

    if (!meeting.ok) {
      result.meeting = failureStep(meeting.error)
      result.retryable = isRetryableSf(meeting.error)
    } else {
      if (!existingMeeting) {
        const stored = await persistMapping(meetingKey, meeting.data)
        if (stored) return { ...result, meeting: stored }
      }
      result.meeting = step(existingMeeting ? 'synced' : 'created', { remoteId: meeting.data })
    }
  }

  // ---- 5. Task ----------------------------------------------------------
  // Only when a follow-up date exists. No date means nothing was promised.
  if (!encounter.followUpAt) {
    result.task = step('skipped', { message: 'No follow-up date on this meeting.' })
  } else {
    /*
      A different mapping row from the meeting's, even though both point at a
      Task: `local_object_type` separates 'encounter' from 'follow_up' and is
      part of the unique key, so the two can never read or overwrite each other.
    */
    const followUpKey = key('follow_up', encounter.id, 'task')
    const existingTask = await getMapping(followUpKey)
    const openStatus = statuses.ok ? statuses.data.open : null

    if (!openStatus) {
      result.task = step('failed', {
        message: 'Salesforce has no open task status ABC can use. Ask your admin, then push again.',
      })
    } else {
      const task = existingTask
        ? await salesforce.updateFollowUpTask(access, existingTask, contact, encounter, sfContactId, accountId, openStatus)
        : await salesforce.createFollowUpTask(access, contact, encounter, sfContactId, accountId, openStatus)

      if (!task.ok) {
        result.task = failureStep(task.error)
        result.retryable = result.retryable || isRetryableSf(task.error)
      } else {
        if (!existingTask) {
          const stored = await persistMapping(followUpKey, task.data)
          if (stored) return { ...result, task: stored }
        }
        result.task = step(existingTask ? 'synced' : 'created', { remoteId: task.data })
      }
    }
  }

  // The person and the meeting are what this exists to move; an account that
  // could not be created is a gap, not a failed export.
  result.ok =
    result.contact.state !== 'failed' &&
    result.meeting.state !== 'failed' &&
    result.task.state !== 'failed'

  return result
}
