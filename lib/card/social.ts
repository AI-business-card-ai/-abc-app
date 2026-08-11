import type { SocialNetwork } from '@/lib/card/types'

const SOCIAL_BASE: Record<SocialNetwork, string> = {
  linkedin: 'https://www.linkedin.com/in/',
  instagram: 'https://www.instagram.com/',
  x: 'https://x.com/',
  facebook: 'https://www.facebook.com/',
  youtube: 'https://www.youtube.com/@',
  tiktok: 'https://www.tiktok.com/@',
  github: 'https://github.com/',
  threads: 'https://www.threads.net/@',
}

const SOCIAL_HOST_HINT: Record<SocialNetwork, RegExp> = {
  linkedin: /linkedin\.com/i,
  instagram: /instagram\.com/i,
  x: /(^|\.)x\.com|twitter\.com/i,
  facebook: /facebook\.com|fb\.com/i,
  youtube: /youtube\.com|youtu\.be/i,
  tiktok: /tiktok\.com/i,
  github: /github\.com/i,
  threads: /threads\.net/i,
}

export function normalizeWebsiteUrl(raw: string | null | undefined): string | null {
  const value = (raw ?? '').trim()
  if (!value) return null
  if (/^https?:\/\//i.test(value)) return value
  return `https://${value}`
}

/** Accept full URL or bare username; return canonical URL or null. */
export function normalizeSocialUrl(
  network: SocialNetwork,
  raw: string | null | undefined
): string | null {
  const value = (raw ?? '').trim()
  if (!value) return null

  if (/^https?:\/\//i.test(value)) {
    try {
      const u = new URL(value)
      if (!SOCIAL_HOST_HINT[network].test(u.hostname) && network !== 'linkedin') {
        // Allow any https URL if user pastes a custom path; still valid
      }
      return u.toString()
    } catch {
      return null
    }
  }

  const username = value.replace(/^@/, '').replace(/^\/+/, '')
  if (!username || /\s/.test(username)) return null
  return `${SOCIAL_BASE[network]}${username}`
}

export function isLikelyValidSocial(
  network: SocialNetwork,
  raw: string | null | undefined
): boolean {
  const normalized = normalizeSocialUrl(network, raw)
  if (!normalized) return !(raw ?? '').trim()
  try {
    const u = new URL(normalized)
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}

/** International phone / WhatsApp: + followed by digits (spaces/dashes ok). */
export function isValidIntlPhone(raw: string | null | undefined): boolean {
  const value = (raw ?? '').trim()
  if (!value) return true
  return /^\+[1-9][\d\s\-()]{6,20}$/.test(value)
}

export function whatsappMeUrl(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  return `https://wa.me/${digits}`
}

export const SOCIAL_META: {
  key: SocialNetwork
  label: string
  brandColor: string
  profileField: string
}[] = [
  { key: 'linkedin', label: 'LinkedIn', brandColor: '#0A66C2', profileField: 'linkedin_url' },
  { key: 'instagram', label: 'Instagram', brandColor: '#E1306C', profileField: 'instagram_url' },
  { key: 'x', label: 'X / Twitter', brandColor: '#ffffff', profileField: 'x_url' },
  { key: 'facebook', label: 'Facebook', brandColor: '#1877F2', profileField: 'facebook_url' },
  { key: 'youtube', label: 'YouTube', brandColor: '#FF0000', profileField: 'youtube_url' },
  { key: 'tiktok', label: 'TikTok', brandColor: '#ffffff', profileField: 'tiktok_url' },
  { key: 'github', label: 'GitHub', brandColor: '#ffffff', profileField: 'github_url' },
  { key: 'threads', label: 'Threads', brandColor: '#ffffff', profileField: 'threads_url' },
]
