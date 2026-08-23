import { splitName } from '@/lib/data-model'

/**
 * A person the scanner has read, before anyone has agreed to keep them.
 *
 * This is deliberately not a contact. A contact is a row someone owns, with an
 * id, a status and a history; a candidate is what the camera or a QR code
 * thinks it saw, held in memory while the owner checks it. Keeping the two
 * types apart is what lets Discard mean discard: there is nothing to delete,
 * because nothing was ever written.
 *
 * The three sources — vision extraction, a scanned vCard, another ABC card —
 * all arrive shaped differently and all converge here, so the review screen and
 * the save call each have exactly one shape to understand.
 *
 * Everything is a string rather than `string | null`. The raw parse types keep
 * their nulls, which is honest about what a model or a QR payload did not find;
 * by the time a human is editing fields, empty is the only sensible absence and
 * a form input cannot hold null anyway.
 */
export type ContactCandidate = {
  first_name: string
  last_name: string
  company: string
  role: string
  email: string
  phone: string
  website: string
  linkedin_url: string
}

/**
 * Anything the parsers produce.
 *
 * `name` and `first_name`/`last_name` are both accepted because the sources
 * genuinely differ: vision extraction and vCard return one name string, while
 * an ABC card resolves to a name already split. Taking both here is what keeps
 * the splitting rule in one place instead of at each call site.
 */
export type CandidateInput = {
  name?: string | null
  first_name?: string | null
  last_name?: string | null
  company?: string | null
  role?: string | null
  email?: string | null
  phone?: string | null
  website?: string | null
  linkedin_url?: string | null
}

const text = (value: string | null | undefined): string => (value || '').trim()

export function emptyCandidate(): ContactCandidate {
  return {
    first_name: '',
    last_name: '',
    company: '',
    role: '',
    email: '',
    phone: '',
    website: '',
    linkedin_url: '',
  }
}

/**
 * One normalization for every capture source.
 *
 * An explicit first/last pair wins over a combined name, because a source that
 * already knows the split knows it better than any splitter can guess.
 */
export function toCandidate(input: CandidateInput): ContactCandidate {
  const first = text(input.first_name)
  const last = text(input.last_name)
  const derived = first || last ? { first_name: first, last_name: last } : splitName(text(input.name))

  return {
    first_name: text(derived.first_name),
    last_name: text(derived.last_name),
    company: text(input.company),
    role: text(input.role),
    email: text(input.email),
    phone: text(input.phone),
    website: text(input.website),
    linkedin_url: text(input.linkedin_url),
  }
}

/** Whether there is enough here to be worth saving at all. */
export function candidateHasIdentity(candidate: ContactCandidate): boolean {
  return Boolean(
    candidate.first_name || candidate.last_name || candidate.company || candidate.email
  )
}

/**
 * The candidate as the save endpoint expects it.
 *
 * `name` is sent alongside the split parts because the contact row stores both,
 * and rebuilding it here means the client and the server cannot disagree about
 * how a full name is assembled.
 */
export function candidateToFields(candidate: ContactCandidate) {
  return {
    name: [candidate.first_name, candidate.last_name].filter(Boolean).join(' '),
    first_name: candidate.first_name,
    last_name: candidate.last_name,
    company: candidate.company,
    role: candidate.role,
    email: candidate.email,
    phone: candidate.phone,
    website: candidate.website,
    linkedin_url: candidate.linkedin_url,
  }
}
