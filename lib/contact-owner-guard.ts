import { createServiceClient } from '@/lib/supabase/service'

type ContactLike = {
  id?: string
  name?: string | null
  email?: string | null
  company?: string | null
  role?: string | null
}

type OwnerProfile = {
  full_name?: string | null
  email?: string | null
  company?: string | null
  role?: string | null
}

function normalize(value: string | null | undefined) {
  return (value ?? '').trim().toLowerCase()
}

function emailsMatch(a: string | null | undefined, b: string | null | undefined) {
  const left = normalize(a)
  const right = normalize(b)
  return Boolean(left && right && left === right)
}

export function contactMatchesOwnerProfile(
  contact: ContactLike,
  profile: OwnerProfile
): { matches: boolean; reasons: string[] } {
  const reasons: string[] = []

  if (emailsMatch(contact.email, profile.email)) {
    reasons.push('email')
  }

  const contactName = normalize(contact.name)
  const profileName = normalize(profile.full_name)
  if (contactName && profileName && contactName === profileName) {
    reasons.push('name')
  }

  const contactCompany = normalize(contact.company)
  const profileCompany = normalize(profile.company)
  if (contactCompany && profileCompany && contactCompany === profileCompany) {
    reasons.push('company')
  }

  const contactRole = normalize(contact.role)
  const profileRole = normalize(profile.role)
  if (contactRole && profileRole && contactRole === profileRole) {
    reasons.push('role')
  }

  const matches =
    reasons.includes('email')
    || (reasons.includes('name') && (reasons.includes('company') || reasons.includes('role')))
    || reasons.length >= 3

  return { matches, reasons }
}

export async function warnIfContactMatchesOwnerProfile(
  userId: string,
  contact: ContactLike,
  source: string
) {
  const supabase = createServiceClient()
  const { data: profile } = await supabase
    .from('abc_profiles')
    .select('full_name, email, company, role')
    .eq('id', userId)
    .maybeSingle()

  if (!profile) return

  const { matches, reasons } = contactMatchesOwnerProfile(contact, profile)
  if (!matches) return

  console.warn('[contact-owner-guard] scanned_contacts record matches owner abc_profiles — likely self-profile bug or accidental self-scan', {
    source,
    userId,
    contactId: contact.id ?? null,
    contactName: contact.name ?? null,
    contactEmail: contact.email ?? null,
    contactCompany: contact.company ?? null,
    profileName: profile.full_name ?? null,
    profileEmail: profile.email ?? null,
    profileCompany: profile.company ?? null,
    matchedFields: reasons,
  })
}
