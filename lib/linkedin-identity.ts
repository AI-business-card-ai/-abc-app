import type { EnrichedLinkedInProfile } from '@/lib/enrichlayer'
import type { ScannedContact } from '@/lib/types'

export type LinkedInMatchConfidence = 'high' | 'low'
export type LinkedInMatchStatus = 'verified' | 'possible_mismatch' | 'rejected'

export type LinkedInIdentitySignals = {
  name: number
  company: number
  role: number
  location: number
}

export type LinkedInIdentityCheck = {
  status: LinkedInMatchStatus
  confidence: LinkedInMatchConfidence | null
  profileName: string
  profileCompany: string
  reason: string
  signals: LinkedInIdentitySignals
}

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()
}

function normalizeCompanyName(name: string): string {
  return normalizeText(name)
    .replace(/\b(ltd|limited|inc|incorporated|corp|corporation|co|company|group|gmbh|engineering|international|global)\b/g, '')
    .replace(/\s+/g, '')
}

function tokenOverlap(a: string, b: string): number {
  const tokensA = new Set(normalizeText(a).split(' ').filter((t) => t.length > 1))
  const tokensB = new Set(normalizeText(b).split(' ').filter((t) => t.length > 1))
  if (tokensA.size === 0 || tokensB.size === 0) return 0
  let overlap = 0
  for (const t of tokensA) {
    if (tokensB.has(t)) overlap++
  }
  return overlap / Math.max(tokensA.size, tokensB.size)
}

function compareCompanies(cardCompany: string, profileCompany: string): number {
  const a = normalizeCompanyName(cardCompany)
  const b = normalizeCompanyName(profileCompany)
  if (!a || !b) return 0
  if (a === b) return 1
  if (a.includes(b) || b.includes(a)) return 0.9
  return Math.max(tokenOverlap(cardCompany, profileCompany), tokenOverlap(a, b))
}

function compareRoles(
  cardRole: string | null | undefined,
  headline: string | null | undefined,
  experienceTitle: string | null | undefined
): number {
  if (!cardRole?.trim()) return 0.5
  const role = normalizeText(cardRole)
  const headlineNorm = normalizeText(headline || '')
  const titleNorm = normalizeText(experienceTitle || '')
  const roleTokens = role.split(' ').filter((t) => t.length > 2)
  if (roleTokens.length === 0) return 0.5

  let hits = 0
  for (const token of roleTokens) {
    if (headlineNorm.includes(token) || titleNorm.includes(token)) hits++
  }
  return hits / roleTokens.length
}

function compareLocation(
  contact: Pick<ScannedContact, 'billing_city' | 'billing_country' | 'meeting_location'>,
  profile: EnrichedLinkedInProfile
): number {
  const cardLocation = [contact.billing_city, contact.billing_country, contact.meeting_location]
    .filter(Boolean)
    .join(' ')
  if (!cardLocation.trim()) return 0.5

  const profileLocation = [profile.headline, profile.summary, ...profile.experiences.map((e) => e.company)]
    .join(' ')
  const cardTokens = normalizeText(cardLocation).split(' ').filter((t) => t.length > 2)
  if (cardTokens.length === 0) return 0.5

  let hits = 0
  for (const token of cardTokens) {
    if (normalizeText(profileLocation).includes(token)) hits++
  }
  return hits / cardTokens.length
}

export function extractLinkedInCurrentCompany(profile: EnrichedLinkedInProfile): string {
  const headline = profile.headline || ''
  const atMatch = headline.match(/\bat\s+([^|,\n]+)/i)
  if (atMatch?.[1]?.trim()) return atMatch[1].trim()

  const currentExp =
    profile.experiences.find((e) => /present/i.test(e.duration) || !e.duration.includes('–')) ||
    profile.experiences[0]

  return currentExp?.company?.trim() || ''
}

export function getCardDisplayName(
  contact: Pick<ScannedContact, 'name' | 'first_name' | 'last_name'>
): string {
  if (contact.name?.trim()) return contact.name.trim()
  return [contact.first_name, contact.last_name].filter(Boolean).join(' ').trim()
}

export function checkLinkedInIdentity(
  contact: Pick<
    ScannedContact,
    'name' | 'first_name' | 'last_name' | 'company' | 'role' | 'billing_city' | 'billing_country' | 'meeting_location'
  >,
  profile: EnrichedLinkedInProfile
): LinkedInIdentityCheck {
  const cardName = getCardDisplayName(contact)
  const profileName = profile.fullName?.trim() || ''
  const profileCompany = extractLinkedInCurrentCompany(profile)
  const cardCompany = contact.company?.trim() || ''

  const signals: LinkedInIdentitySignals = {
    name: tokenOverlap(cardName, profileName),
    company: cardCompany && profileCompany ? compareCompanies(cardCompany, profileCompany) : 0.5,
    role: compareRoles(contact.role, profile.headline, profile.experiences[0]?.title),
    location: compareLocation(contact, profile),
  }

  const companyMismatch = Boolean(cardCompany && profileCompany && signals.company < 0.35)
  const nameWeak = signals.name < 0.45
  const weightedScore =
    signals.name * 0.35 +
    signals.company * 0.35 +
    signals.role * 0.15 +
    signals.location * 0.15

  if (companyMismatch) {
    return {
      status: 'possible_mismatch',
      confidence: 'low',
      profileName,
      profileCompany,
      reason: `LinkedIn shows "${profileCompany}" but the business card says "${cardCompany}"`,
      signals,
    }
  }

  if (nameWeak && cardCompany && signals.company < 0.5) {
    return {
      status: 'possible_mismatch',
      confidence: 'low',
      profileName,
      profileCompany,
      reason: `Name and company signals do not match the card (${cardName} @ ${cardCompany})`,
      signals,
    }
  }

  if (weightedScore >= 0.65 && signals.name >= 0.55 && (!cardCompany || signals.company >= 0.5)) {
    return {
      status: 'verified',
      confidence: 'high',
      profileName,
      profileCompany,
      reason: 'LinkedIn profile matches card name, company, and role signals',
      signals,
    }
  }

  if (weightedScore < 0.5 || signals.name < 0.55) {
    return {
      status: 'possible_mismatch',
      confidence: 'low',
      profileName,
      profileCompany,
      reason: 'LinkedIn profile may belong to a different person with a similar name',
      signals,
    }
  }

  return {
    status: 'verified',
    confidence: 'low',
    profileName,
    profileCompany,
    reason: 'Partial match — please verify this is the correct LinkedIn profile',
    signals,
  }
}

export function buildLinkedInProfileFromContact(
  contact: Pick<
    ScannedContact,
    'name' | 'linkedin_headline' | 'linkedin_summary' | 'linkedin_experience' | 'linkedin_skills' | 'linkedin_posts' | 'linkedin_education' | 'linkedin_profile_name'
  >
): EnrichedLinkedInProfile | null {
  const hasData =
    contact.linkedin_headline?.trim() ||
    (Array.isArray(contact.linkedin_experience) && contact.linkedin_experience.length > 0) ||
    contact.linkedin_summary?.trim()

  if (!hasData) return null

  return {
    fullName: contact.linkedin_profile_name?.trim() || contact.name?.trim() || '',
    headline: contact.linkedin_headline || '',
    summary: contact.linkedin_summary || '',
    experiences: contact.linkedin_experience || [],
    education: contact.linkedin_education || [],
    skills: contact.linkedin_skills || [],
    recentPosts: contact.linkedin_posts || [],
    languages: [],
  }
}

/** Compare card vs stored LinkedIn fields — no external API calls. */
export function reconcileStoredLinkedInIdentity(
  contact: ScannedContact
): ReturnType<typeof identityCheckToDbFields> | null {
  if (contact.linkedin_match_status) return null
  if (!contact.company?.trim()) return null
  if (!contact.linkedin_url && !contact.linkedin_headline?.trim()) return null

  const profile = buildLinkedInProfileFromContact(contact)
  if (!profile) return null

  return identityCheckToDbFields(checkLinkedInIdentity(contact, profile))
}

export function identityCheckToDbFields(check: LinkedInIdentityCheck) {
  return {
    linkedin_match_status: check.status,
    linkedin_match_confidence: check.confidence,
    linkedin_profile_name: check.profileName || null,
    linkedin_profile_company: check.profileCompany || null,
    linkedin_mismatch_reason: check.status === 'verified' && check.confidence === 'high' ? null : check.reason,
  }
}

export function isLinkedInDataTrusted(
  contact: Pick<ScannedContact, 'linkedin_match_status' | 'linkedin_match_confidence'>
): boolean {
  if (contact.linkedin_match_status === 'rejected') return false
  if (contact.linkedin_match_status === 'possible_mismatch') return false
  if (contact.linkedin_match_status === 'verified' && contact.linkedin_match_confidence === 'high') return true
  if (!contact.linkedin_match_status && !contact.linkedin_match_confidence) return true
  return false
}

export function shouldShowLinkedInMismatchWarning(
  contact: Pick<ScannedContact, 'linkedin_match_status' | 'linkedin_match_confidence' | 'linkedin_mismatch_reason'>
): boolean {
  if (contact.linkedin_match_status === 'possible_mismatch') return true
  if (contact.linkedin_match_status === 'verified' && contact.linkedin_match_confidence === 'low') return true
  return Boolean(contact.linkedin_mismatch_reason)
}

export function stripUntrustedLinkedInFields<T extends ScannedContact>(contact: T): T {
  if (isLinkedInDataTrusted(contact)) return contact
  return {
    ...contact,
    linkedin_headline: null,
    linkedin_summary: null,
    linkedin_posts: null,
    linkedin_skills: null,
    linkedin_experience: null,
    linkedin_education: null,
  }
}

export const LINKEDIN_FIELDS_TO_CLEAR = [
  'linkedin_url',
  'linkedin_headline',
  'linkedin_summary',
  'linkedin_experience',
  'linkedin_skills',
  'linkedin_posts',
  'linkedin_education',
  'linkedin_profile_name',
  'linkedin_profile_company',
  'linkedin_mismatch_reason',
] as const
