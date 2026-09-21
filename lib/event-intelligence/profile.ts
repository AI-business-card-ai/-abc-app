import { parseList, type ParseResult } from '@/lib/event-intelligence/intent'

/**
 * The Smart Event Profile: what the owner will show, and the meeting they are
 * asking for.
 *
 * Event Intelligence already answers *who* is worth meeting and *why*. This is
 * the next two questions — what should I show them, and how do I ask — and it
 * is built as a contextual layer on ABC rather than a second card product.
 * Identity, the card slug, the public URL and the image bucket stay exactly
 * where they are.
 *
 * ## Three kinds of claim, kept apart
 *
 * The feature now holds three things that all look like statements about a
 * company, and confusing them would be the worst thing it could do:
 *
 *   **Source facts** — what an event listing says about *them*. Sourced,
 *   provenanced, quoted.
 *   **ABC analysis** — what ABC inferred by comparing the two. Labelled as
 *   inference, and carrying the evidence it rests on.
 *   **Your material** — what the owner says about *their own* company. It is
 *   first-party marketing content: ABC stores it, shows it and never checks
 *   it, and must never present it as though a source verified it.
 *
 * Everything in this file is the third kind. `firstPartyNotice` exists so the
 * screens have one place to say so.
 *
 * Everything here is pure — no database, no clock except where passed in — so
 * the rules can be argued with in a test.
 */

// ── Media ────────────────────────────────────────────────────────

export type MediaKind = 'video' | 'document' | 'image' | 'link' | 'offer'

export const MEDIA_KINDS: MediaKind[] = ['video', 'document', 'image', 'link', 'offer']

export const MEDIA_KIND_LABEL: Record<MediaKind, string> = {
  video: 'Video',
  document: 'Document or brochure',
  image: 'Image',
  link: 'Link',
  offer: 'Event offer',
}

/**
 * Whether ABC can hold the bytes, or only a link to them.
 *
 * ABC's `card-media` bucket accepts images only — `image/jpeg`, `image/png`,
 * `image/webp`, up to 10 MB — because it was built for card photos. A video or
 * a PDF therefore lives wherever the company already hosts it and ABC keeps
 * the address.
 *
 * This is a storage configuration, not a limitation of the model: `url` holds
 * the answer either way, and the day the bucket accepts more, only this map
 * changes. It is stated in code rather than assumed so the screens can say the
 * true thing instead of showing an upload control that would fail.
 */
export const UPLOAD_SUPPORTED: Record<MediaKind, boolean> = {
  image: true,
  video: false,
  document: false,
  link: false,
  offer: false,
}

export const firstPartyNotice =
  'Your own material, shown as you wrote it. ABC does not check it and does not present it as a source fact.'

// ── Content phases ───────────────────────────────────────────────

export type EventPhase = 'any' | 'pre' | 'live' | 'post'

export const PHASE_LABEL: Record<EventPhase, string> = {
  any: 'Any time',
  pre: 'Before the event',
  live: 'During the event',
  post: 'After the event',
}

export const PHASE_HINT: Record<EventPhase, string> = {
  any: 'Shown throughout.',
  pre: 'A teaser, a short introduction, a reason to meet.',
  live: 'What you show at the stand.',
  post: 'A recap, and whatever should follow the meeting.',
}

/**
 * Which phase a fair is in on a given day.
 *
 * Dates the event itself carries, so this is a fact about the fair rather than
 * a guess. An event with no dates has no phase — `null` — and material pinned
 * to a phase is simply shown, because hiding somebody's material on the basis
 * of a date nobody gave would be worse than showing it early.
 */
export function eventPhaseOn(
  event: { startsOn: string | null; endsOn: string | null },
  now: Date
): Exclude<EventPhase, 'any'> | null {
  if (!event.startsOn && !event.endsOn) return null
  const start = event.startsOn ? new Date(`${event.startsOn}T00:00:00Z`) : null
  const end = event.endsOn ? new Date(`${event.endsOn}T23:59:59Z`) : start
  if (!start || Number.isNaN(start.getTime())) return null
  if (end && !Number.isNaN(end.getTime()) && now > end) return 'post'
  if (now < start) return 'pre'
  return 'live'
}

export type EventMaterial = {
  id: string
  userId: string
  eventId: string
  productId: string | null
  title: string
  description: string | null
  mediaKind: MediaKind
  url: string
  phase: EventPhase
  visibleFrom: string | null
  visibleUntil: string | null
  priority: 1 | 2 | 3
  productTags: string[]
  industryTags: string[]
}

/**
 * Whether a piece of material is showable right now.
 *
 * Two independent gates, and both are the owner's own instruction: the phase
 * they pinned it to, and the window they gave it. A material with neither is
 * always showable, which is the right default for somebody who just wants to
 * attach a brochure.
 */
export function materialVisible(
  material: Pick<EventMaterial, 'phase' | 'visibleFrom' | 'visibleUntil'>,
  now: Date,
  eventPhase: Exclude<EventPhase, 'any'> | null
): boolean {
  if (material.visibleFrom && now < new Date(material.visibleFrom)) return false
  if (material.visibleUntil && now > new Date(material.visibleUntil)) return false
  if (material.phase === 'any') return true
  // Without dates the fair has no phase, so a phase cannot rule anything out.
  if (eventPhase === null) return true
  return material.phase === eventPhase
}

/** Material to show, strongest first, then by title so the order never wobbles. */
export function orderMaterial(materials: EventMaterial[]): EventMaterial[] {
  return [...materials].sort((a, b) => a.priority - b.priority || a.title.localeCompare(b.title))
}

// ── Products ─────────────────────────────────────────────────────

export type EventProduct = {
  id: string
  userId: string
  name: string
  description: string | null
  productTags: string[]
  industryTags: string[]
  useCaseTags: string[]
  sortOrder: number
}

export type ProductWrite = {
  name: string
  description: string | null
  productTags: string[]
  industryTags: string[]
  useCaseTags: string[]
}

const MAX_NAME = 120
const MAX_TEXT = 2000
const MAX_TAGS = 20

export function parseProduct(input: Record<string, unknown>): ParseResult<ProductWrite> {
  const name = typeof input.name === 'string' ? input.name.trim().replace(/\s+/g, ' ') : ''
  if (!name) return { ok: false, error: 'What is the product or solution called?' }
  if (name.length > MAX_NAME) return { ok: false, error: `That name is too long. Keep it under ${MAX_NAME} characters.` }

  const description = typeof input.description === 'string' ? input.description.trim() : ''
  if (description.length > MAX_TEXT) {
    return { ok: false, error: `That description is too long. Keep it under ${MAX_TEXT} characters.` }
  }

  const tags = {
    productTags: parseList(input.productTags),
    industryTags: parseList(input.industryTags),
    useCaseTags: parseList(input.useCaseTags),
  }
  for (const [field, list] of Object.entries(tags)) {
    if (list.length > MAX_TAGS) {
      return { ok: false, error: `Too many ${field === 'useCaseTags' ? 'use cases' : 'tags'}. Keep it to ${MAX_TAGS}.` }
    }
  }

  return { ok: true, value: { name, description: description || null, ...tags } }
}

// ── Material ─────────────────────────────────────────────────────

export type MaterialWrite = {
  productId: string | null
  title: string
  description: string | null
  mediaKind: MediaKind
  url: string
  phase: EventPhase
  visibleFrom: string | null
  visibleUntil: string | null
  priority: 1 | 2 | 3
  productTags: string[]
  industryTags: string[]
}

/**
 * A URL ABC is willing to point somebody at.
 *
 * http and https only. A `javascript:` or `data:` URL in a field that becomes
 * a link on a page somebody else opens is the oldest trick there is, and the
 * check belongs here rather than in whichever component renders it next.
 */
export function safeMaterialUrl(raw: unknown): string | null {
  const text = typeof raw === 'string' ? raw.trim() : ''
  if (!text) return null
  let parsed: URL
  try {
    parsed = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `https://${text}`)
  } catch {
    return null
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null
  if (!parsed.hostname.includes('.')) return null
  return parsed.toString()
}

export function parseMaterial(input: Record<string, unknown>): ParseResult<MaterialWrite> {
  const title = typeof input.title === 'string' ? input.title.trim().replace(/\s+/g, ' ') : ''
  if (!title) return { ok: false, error: 'Give this material a title.' }
  if (title.length > MAX_NAME) return { ok: false, error: `That title is too long. Keep it under ${MAX_NAME} characters.` }

  const mediaKind = MEDIA_KINDS.includes(input.mediaKind as MediaKind)
    ? (input.mediaKind as MediaKind)
    : null
  if (!mediaKind) return { ok: false, error: 'What kind of material is this?' }

  const url = safeMaterialUrl(input.url)
  if (!url) {
    return {
      ok: false,
      error: 'A web address is needed, starting with http or https.',
    }
  }

  const phase = (['any', 'pre', 'live', 'post'] as const).includes(input.phase as EventPhase)
    ? (input.phase as EventPhase)
    : 'any'

  const description = typeof input.description === 'string' ? input.description.trim() : ''
  if (description.length > MAX_TEXT) {
    return { ok: false, error: `That description is too long. Keep it under ${MAX_TEXT} characters.` }
  }

  const when = (value: unknown): string | null => {
    const text = typeof value === 'string' ? value.trim() : ''
    if (!text) return null
    const date = new Date(text)
    return Number.isNaN(date.getTime()) ? null : date.toISOString()
  }
  const visibleFrom = when(input.visibleFrom)
  const visibleUntil = when(input.visibleUntil)
  if (visibleFrom && visibleUntil && new Date(visibleUntil) <= new Date(visibleFrom)) {
    return { ok: false, error: 'The end of the window has to come after its start.' }
  }

  const priorityValue = Number(input.priority)
  const priority = priorityValue === 1 || priorityValue === 3 ? (priorityValue as 1 | 3) : 2

  const productId = typeof input.productId === 'string' && input.productId.trim() ? input.productId.trim() : null

  return {
    ok: true,
    value: {
      productId,
      title,
      description: description || null,
      mediaKind,
      url,
      phase,
      visibleFrom,
      visibleUntil,
      priority,
      productTags: parseList(input.productTags),
      industryTags: parseList(input.industryTags),
    },
  }
}

// ── The meeting brief ────────────────────────────────────────────

/**
 * What a brief can be, and what it deliberately cannot.
 *
 * There is no 'accepted', 'confirmed' or 'scheduled'. ABC has no source of
 * truth for any of them — nobody replies to anything inside ABC — and a status
 * that implied a meeting was agreed would be the product asserting a
 * relationship that may not exist.
 *
 * `shared` means the owner sent or copied something. It is a record of their
 * action, not of anybody's answer.
 */
export type BriefStatus = 'draft' | 'ready' | 'shared'

export const BRIEF_STATUS_LABEL: Record<BriefStatus, string> = {
  draft: 'Draft',
  ready: 'Ready to send',
  shared: 'Shared by you',
}

export const BRIEF_STATUS_HINT: Record<BriefStatus, string> = {
  draft: 'Only you can see this.',
  ready: 'Prepared. Nothing has been sent.',
  shared: 'You shared this. It does not mean they replied, or that you have met.',
}

export type MeetingBrief = {
  id: string
  userId: string
  targetId: string
  productId: string | null
  topic: string | null
  message: string | null
  status: BriefStatus
  sharedAt: string | null
  materialIds: string[]
}

export type BriefWrite = {
  productId: string | null
  topic: string | null
  message: string | null
}

export function parseBrief(input: Record<string, unknown>): ParseResult<BriefWrite> {
  const topic = typeof input.topic === 'string' ? input.topic.trim().replace(/\s+/g, ' ') : ''
  if (topic.length > 200) return { ok: false, error: 'That topic is too long. Keep it under 200 characters.' }

  const message = typeof input.message === 'string' ? input.message.trim() : ''
  if (message.length > MAX_TEXT) {
    return { ok: false, error: `That message is too long. Keep it under ${MAX_TEXT} characters.` }
  }

  const productId = typeof input.productId === 'string' && input.productId.trim() ? input.productId.trim() : null

  return { ok: true, value: { productId, topic: topic || null, message: message || null } }
}

/**
 * Whether there is enough here to be worth sending.
 *
 * A topic, and something to show or talk about. Not a validation rule so much
 * as the product refusing to call an empty form "ready" — the owner can still
 * leave it a draft for as long as they like.
 */
export function canMarkReady(brief: Pick<MeetingBrief, 'topic' | 'productId' | 'materialIds'>): boolean {
  const hasTopic = Boolean(brief.topic && brief.topic.trim())
  const hasSubstance = Boolean(brief.productId) || brief.materialIds.length > 0
  return hasTopic && hasSubstance
}

export function briefStatusFor(
  requested: unknown,
  brief: Pick<MeetingBrief, 'topic' | 'productId' | 'materialIds'>
): ParseResult<BriefStatus> {
  const value = typeof requested === 'string' ? requested : ''
  if (!['draft', 'ready', 'shared'].includes(value)) {
    return { ok: false, error: 'That is not a state a meeting request can be in.' }
  }
  if ((value === 'ready' || value === 'shared') && !canMarkReady(brief)) {
    return {
      ok: false,
      error: 'Add a topic and either a product or some material first.',
    }
  }
  return { ok: true, value: value as BriefStatus }
}

// ── What leaves ABC when the owner shares ────────────────────────

/**
 * The note the owner would send, assembled from what they chose to put in it.
 *
 * This is the public/private boundary, and it is drawn by construction: the
 * function is handed only the things that are meant to leave. There is no
 * parameter for the private note on the target, the priority, the target's
 * status, the match score, ABC's reasoning, or the listing's evidence — so none
 * of them can end up in the text, whatever a caller passes, because nothing
 * here has a way to receive them.
 *
 * Everything that *is* included is either the owner's own words (topic,
 * message), their own first-party content (product, material), the name of
 * the fair, or their own published card. The other side's listing — their
 * stand, their categories, their description — is not quoted back at them.
 */
export type ShareInput = {
  topic: string | null
  message: string | null
  product: { name: string } | null
  material: { title: string; url: string }[]
  event: { name: string }
  /** `cardUrl` only when the card is published; the caller decides that, not this. */
  me: { name: string | null; company: string | null; cardUrl: string | null }
}

export function buildShareText(input: ShareInput): string {
  const lines: string[] = []
  const topic = input.topic?.trim()
  const message = input.message?.trim()

  if (topic) lines.push(topic)
  if (message) lines.push('', message)
  if (input.product) lines.push('', `About: ${input.product.name}`)
  if (input.material.length > 0) {
    lines.push('', ...input.material.map((entry) => `${entry.title} — ${entry.url}`))
  }

  lines.push('', input.event.name)

  const signature = [input.me.name, input.me.company].filter(Boolean).join(', ')
  if (signature) lines.push(signature)
  if (input.me.cardUrl) lines.push(input.me.cardUrl)

  return lines.join('\n').trim()
}

/**
 * Hand the note to the owner's own mail app. Opens a composer; sends nothing.
 *
 * The same `mailto:` shape `openEmailComposer` uses for Smart Follow-up, with
 * one deliberate difference: no recipient. An Event Intelligence target is a
 * company from a listing, and ABC holds no person or address for it — by
 * design, because no personal data is ingested. The owner fills in whoever
 * they are writing to, in their own client.
 */
export function emailHandoffUrl(subject: string, body: string): string {
  return `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
}

/**
 * Hand the note to WhatsApp. Opens a chat picker; sends nothing.
 *
 * `wa.me/?text=` without a number, for the same reason as above: ABC has no
 * number to put there, and the owner picks the chat themselves.
 */
export function whatsappHandoffUrl(body: string): string {
  return `https://wa.me/?text=${encodeURIComponent(body)}`
}
