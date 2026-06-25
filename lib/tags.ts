export type ContactTag = {
  label: string
  color: string
}

export const CONTACT_TAGS: ContactTag[] = [
  { label: 'VIP', color: '#f59e0b' },
  { label: 'Hot Lead', color: '#ef4444' },
  { label: 'Follow-up', color: '#3b82f6' },
  { label: 'Partner', color: '#8b5cf6' },
  { label: 'Investor', color: '#10b981' },
  { label: 'Cold', color: '#6b7280' },
  { label: 'Decision Maker', color: '#f0197d' },
  { label: 'Technical', color: '#00d4d4' },
]

export function getTagMeta(label: string): ContactTag {
  return CONTACT_TAGS.find((t) => t.label === label) ?? { label, color: '#8892b0' }
}

export function formatDealValue(value: number | null | undefined, currency = 'USD'): string {
  const num = Number(value) || 0
  if (num <= 0) return ''
  const symbol = currency === 'EUR' ? '€' : currency === 'GBP' ? '£' : currency === 'CZK' ? 'Kč ' : '$'
  const formatted = num >= 1000 ? num.toLocaleString('en-US', { maximumFractionDigits: 0 }) : String(num)
  return currency === 'CZK' ? `${formatted} ${symbol.trim()}` : `${symbol}${formatted}`
}
