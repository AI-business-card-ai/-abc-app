import type { ScanResult } from '@/lib/types'

export const SCAN_CARD_UNREADABLE_ERROR =
  "We couldn't read a business card in this photo. Please try again with better lighting and make sure the card fills the frame."

export type CardExtract = Pick<
  ScanResult,
  'name' | 'company' | 'role' | 'email' | 'phone' | 'website' | 'linkedin_url'
>

function trimOrNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed || null
}

function sanitizeEmail(email: string | null | undefined): string | null {
  const trimmed = trimOrNull(email)
  if (!trimmed) return null
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return null
  return trimmed
}

function sanitizeUrl(url: string | null | undefined): string | null {
  const trimmed = trimOrNull(url)
  if (!trimmed) return null
  try {
    const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
    new URL(withProtocol)
    return withProtocol
  } catch {
    return null
  }
}

function sanitizePhone(phone: string | null | undefined): string | null {
  const trimmed = trimOrNull(phone)
  if (!trimmed) return null
  const digits = trimmed.replace(/\D/g, '')
  if (digits.length < 6) return null
  return trimmed
}

export function sanitizeCardExtract(extracted: CardExtract): CardExtract {
  return {
    name: trimOrNull(extracted.name),
    company: trimOrNull(extracted.company),
    role: trimOrNull(extracted.role),
    email: sanitizeEmail(extracted.email),
    phone: sanitizePhone(extracted.phone),
    website: sanitizeUrl(extracted.website),
    linkedin_url: sanitizeUrl(extracted.linkedin_url),
  }
}

export function hasUsableCardData(extracted: CardExtract): boolean {
  return Boolean(extracted.name || extracted.company || extracted.email)
}

export function isTechnicalScanReadError(message: string): boolean {
  const lower = message.toLowerCase()
  return (
    lower.includes('did not match') ||
    lower.includes('expected pattern') ||
    lower.includes('invalid url') ||
    lower.includes('failed to construct') ||
    lower.includes('zod') ||
    lower.includes('validation failed') ||
    lower.includes('could not parse json')
  )
}

export function formatScanErrorForUser(message: string): string {
  if (isTechnicalScanReadError(message)) return SCAN_CARD_UNREADABLE_ERROR
  if (message === 'No contact returned' || message === 'Scan failed') {
    return SCAN_CARD_UNREADABLE_ERROR
  }
  return message
}
