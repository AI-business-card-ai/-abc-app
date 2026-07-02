export function formatWhatsAppPhone(phone: string): string {
  const trimmed = phone.trim()
  if (!trimmed) return ''

  let digits = trimmed.replace(/[^\d+]/g, '')
  if (digits.startsWith('+')) digits = digits.slice(1)
  if (digits.startsWith('00')) digits = digits.slice(2)

  if (digits.startsWith('0') && digits.length >= 9) {
    digits = `420${digits.slice(1)}`
  }

  return digits.replace(/\D/g, '')
}

export function openWhatsAppComposer(phone: string, message: string): boolean {
  const formatted = formatWhatsAppPhone(phone)
  if (!formatted) return false

  const url = `https://wa.me/${formatted}?text=${encodeURIComponent(message)}`
  window.open(url, '_blank', 'noopener,noreferrer')
  return true
}

export function openEmailComposer(email: string, subject: string, body: string): boolean {
  const trimmedEmail = email.trim()
  if (!trimmedEmail) return false

  const url = `mailto:${trimmedEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
  window.open(url, '_blank', 'noopener,noreferrer')
  return true
}

export async function openLinkedInComposer(linkedinUrl: string, message: string): Promise<boolean> {
  const trimmedUrl = linkedinUrl.trim()
  if (!trimmedUrl) return false

  const url = trimmedUrl.startsWith('http') ? trimmedUrl : `https://${trimmedUrl}`
  window.open(url, '_blank', 'noopener,noreferrer')

  try {
    await navigator.clipboard.writeText(message)
  } catch {
    // Clipboard may fail; profile still opened
  }

  return true
}
