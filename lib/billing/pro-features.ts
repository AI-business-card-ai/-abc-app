/**
 * What ABC Pro unlocks, in the words a screen shows.
 *
 * Pure — no server imports — so the API that refuses an action and the screen
 * that explains the refusal read the same sentence.
 *
 * Pro is one product in three durations. An Event Pass, a monthly and an annual
 * subscription unlock exactly the same capabilities; only how long they last and
 * how they are billed differ. What they unlock is workflow: Smart Follow-up
 * drafts, scheduled follow-up sequences, sending from Gmail, and CRM sync.
 *
 * Two things Pro is not. It is not a Smart Scan allowance — scanning is paid for
 * in credits by everybody, Pro or not. And it is not permission to see one's own
 * contacts, meetings or events, which every account keeps.
 */

export const PRO_REQUIRED = 'pro_required' as const

export const PRO_FEATURES = ['smart_follow_up', 'follow_up_sequence', 'gmail', 'crm'] as const
export type ProFeature = (typeof PRO_FEATURES)[number]

export const PRO_FEATURE_MESSAGES: Record<ProFeature, string> = {
  smart_follow_up: 'Smart Follow-up drafts are part of ABC Pro.',
  follow_up_sequence: 'Scheduled follow-up sequences are part of ABC Pro.',
  gmail: 'Sending follow-ups from your Gmail is part of ABC Pro.',
  crm: 'Syncing contacts to your CRM is part of ABC Pro.',
}

/** Where current Pro access comes from. `none` means the account is not Pro. */
export type ProSource = 'founder' | 'event_pass' | 'monthly' | 'annual' | 'none'

export const PRO_SOURCE_LABELS: Record<ProSource, string> = {
  founder: 'Founder access',
  event_pass: 'Event Pass',
  monthly: 'Monthly',
  annual: 'Annual',
  none: 'Free',
}

/** The body of every refusal: a sentence to show, and a code to recognise it by. */
export type ProRequiredBody = {
  error: string
  code: typeof PRO_REQUIRED
  feature: ProFeature
}

export function isProFeature(value: unknown): value is ProFeature {
  return typeof value === 'string' && (PRO_FEATURES as readonly string[]).includes(value)
}

export function proRequiredBody(feature: ProFeature): ProRequiredBody {
  return { error: PRO_FEATURE_MESSAGES[feature], code: PRO_REQUIRED, feature }
}

export function isProRequired(body: unknown): body is ProRequiredBody {
  return typeof body === 'object' && body !== null && (body as { code?: unknown }).code === PRO_REQUIRED
}

/**
 * Where a navigation that needs Pro lands: the plan page, which says what Pro is
 * and — honestly — whether it can be bought yet.
 */
export function proRequiredPath(feature: ProFeature): string {
  return `/settings/billing?pro=required&feature=${feature}`
}
