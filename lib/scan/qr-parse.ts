/**
 * Parsing for QR payloads the scanner actually encounters at events.
 *
 * Deliberately narrow: ABC Card links, vCard, MECARD, plain URLs, plain text.
 * Anything else is reported as unknown rather than guessed at.
 */

export type QrContactFields = {
  name: string | null
  company: string | null
  role: string | null
  email: string | null
  phone: string | null
  website: string | null
  linkedin_url: string | null
}

/** Which ABC card URL shape was scanned — the identifier means a different column in each. */
export type AbcCardRef = 'd' | 'u' | 'card'

export type QrResult =
  | { kind: 'abc_card'; url: string; slug: string; ref: AbcCardRef }
  | { kind: 'contact'; fields: QrContactFields; format: 'vcard' | 'mecard' }
  | { kind: 'url'; url: string; host: string }
  | { kind: 'text'; text: string }

const ABC_HOSTS = ['abccard.io', 'www.abccard.io']
const ABC_CARD_PATH = /^\/(d|u|card)\/([^/?#]+)/

function emptyFields(): QrContactFields {
  return {
    name: null,
    company: null,
    role: null,
    email: null,
    phone: null,
    website: null,
    linkedin_url: null,
  }
}

function clean(value: string | undefined | null): string | null {
  const trimmed = (value || '').trim()
  return trimmed.length > 0 ? trimmed : null
}

/** vCard 2.1/3.0/4.0 — only the fields ABC Card stores. */
function parseVCard(raw: string): QrContactFields | null {
  if (!/^BEGIN:VCARD/im.test(raw)) return null

  const fields = emptyFields()
  // Unfold RFC 6350 line continuations before parsing.
  const lines = raw.replace(/\r\n[ \t]/g, '').split(/\r?\n/)

  for (const line of lines) {
    const sep = line.indexOf(':')
    if (sep < 0) continue

    const rawKey = line.slice(0, sep).toUpperCase()
    const value = line.slice(sep + 1).trim()
    if (!value) continue

    const key = rawKey.split(';')[0]

    if (key === 'FN' && !fields.name) {
      fields.name = value
    } else if (key === 'N' && !fields.name) {
      // N:Last;First;Middle;Prefix;Suffix
      const [last, first] = value.split(';')
      const joined = [clean(first), clean(last)].filter(Boolean).join(' ')
      if (joined) fields.name = joined
    } else if (key === 'ORG' && !fields.company) {
      fields.company = value.split(';')[0].trim() || null
    } else if (key === 'TITLE' && !fields.role) {
      fields.role = value
    } else if (key === 'EMAIL' && !fields.email) {
      fields.email = value
    } else if (key === 'TEL' && !fields.phone) {
      fields.phone = value
    } else if (key === 'URL') {
      if (/linkedin\.com/i.test(value)) {
        if (!fields.linkedin_url) fields.linkedin_url = value
      } else if (!fields.website) {
        fields.website = value
      }
    }
  }

  const hasAny = Object.values(fields).some(Boolean)
  return hasAny ? fields : null
}

/** MECARD:N:Name;ORG:Company;TEL:123;EMAIL:a@b.c;URL:https://…;; */
function parseMeCard(raw: string): QrContactFields | null {
  if (!/^MECARD:/i.test(raw.trim())) return null

  const body = raw.trim().replace(/^MECARD:/i, '').replace(/;;\s*$/, '')
  const fields = emptyFields()

  for (const part of body.split(';')) {
    const sep = part.indexOf(':')
    if (sep < 0) continue
    const key = part.slice(0, sep).toUpperCase()
    const value = part.slice(sep + 1).trim()
    if (!value) continue

    if (key === 'N' && !fields.name) {
      // MECARD N is "Last,First"
      const [last, first] = value.split(',')
      fields.name = [clean(first), clean(last)].filter(Boolean).join(' ') || value
    } else if (key === 'ORG' && !fields.company) {
      fields.company = value
    } else if (key === 'TEL' && !fields.phone) {
      fields.phone = value
    } else if (key === 'EMAIL' && !fields.email) {
      fields.email = value
    } else if (key === 'URL' && !fields.website) {
      fields.website = value
    }
  }

  const hasAny = Object.values(fields).some(Boolean)
  return hasAny ? fields : null
}

export function parseQrPayload(raw: string): QrResult {
  const value = raw.trim()

  const vcard = parseVCard(value)
  if (vcard) return { kind: 'contact', fields: vcard, format: 'vcard' }

  const mecard = parseMeCard(value)
  if (mecard) return { kind: 'contact', fields: mecard, format: 'mecard' }

  if (/^https?:\/\//i.test(value)) {
    try {
      const url = new URL(value)
      if (ABC_HOSTS.includes(url.hostname.toLowerCase())) {
        const match = url.pathname.match(ABC_CARD_PATH)
        if (match) {
          return {
            kind: 'abc_card',
            url: url.toString(),
            ref: match[1] as AbcCardRef,
            slug: decodeURIComponent(match[2]),
          }
        }
      }
      return { kind: 'url', url: url.toString(), host: url.hostname }
    } catch {
      return { kind: 'text', text: value }
    }
  }

  if (/^mailto:/i.test(value)) {
    const email = value.replace(/^mailto:/i, '').split('?')[0]
    return { kind: 'contact', fields: { ...emptyFields(), email: clean(email) }, format: 'vcard' }
  }

  if (/^tel:/i.test(value)) {
    const phone = value.replace(/^tel:/i, '')
    return { kind: 'contact', fields: { ...emptyFields(), phone: clean(phone) }, format: 'vcard' }
  }

  return { kind: 'text', text: value }
}
