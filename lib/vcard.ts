import { splitName } from '@/lib/data-model'

export type VCardFields = {
  name: string
  company?: string | null
  role?: string | null
  email?: string | null
  phone?: string | null
  website?: string | null
  linkedin_url?: string | null
}

export function buildVCard(fields: VCardFields): string {
  const name = (fields.name || '').trim()
  const { first_name, last_name } = splitName(name)

  const lines = [
    'BEGIN:VCARD',
    'VERSION:3.0',
    `FN:${name}`,
    `N:${last_name};${first_name};;;`,
  ]

  if (fields.company) lines.push(`ORG:${fields.company}`)
  if (fields.role) lines.push(`TITLE:${fields.role}`)
  if (fields.phone) lines.push(`TEL:${fields.phone}`)
  if (fields.email) lines.push(`EMAIL:${fields.email}`)
  if (fields.website) lines.push(`URL:${fields.website}`)
  if (fields.linkedin_url) lines.push(`URL:${fields.linkedin_url}`)
  lines.push('END:VCARD')

  return lines.join('\r\n')
}

/** Same download pattern as downloadCsv — data URL on iOS, blob elsewhere. */
export function downloadVcard(vcard: string, filename: string) {
  const blob = new Blob([vcard], { type: 'text/vcard;charset=utf-8;' })

  const isIOS =
    typeof navigator !== 'undefined' &&
    /iPad|iPhone|iPod/.test(navigator.userAgent)

  if (isIOS) {
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = reader.result as string
      const link = document.createElement('a')
      link.href = dataUrl
      link.setAttribute('download', filename)
      document.body.appendChild(link)
      link.click()
      setTimeout(() => document.body.removeChild(link), 500)
    }
    reader.readAsDataURL(blob)
    return
  }

  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.setAttribute('download', filename)
  document.body.appendChild(link)
  link.click()
  setTimeout(() => {
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }, 100)
}
