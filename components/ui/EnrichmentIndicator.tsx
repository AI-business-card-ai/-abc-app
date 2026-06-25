'use client'

import type { ScannedContact } from '@/lib/types'

type Props = {
  contact: Pick<ScannedContact, 'enrichment_status'>
  compact?: boolean
  onRetry?: () => void
  retrying?: boolean
}

export default function EnrichmentIndicator({ contact, compact, onRetry, retrying }: Props) {
  const status = contact.enrichment_status || 'DONE'

  if (status === 'PENDING') {
    return (
      <span className={`inline-flex items-center gap-1.5 ${compact ? 'text-[10px]' : 'text-xs'}`} style={{ color: '#8892b0' }}>
        <span
          className="w-3 h-3 rounded-full border-2 border-transparent animate-spin shrink-0"
          style={{ borderTopColor: '#8892b0', borderRightColor: '#4a5168' }}
        />
        {!compact && 'Waiting…'}
      </span>
    )
  }

  if (status === 'ENRICHING') {
    return (
      <span className={`inline-flex items-center gap-1.5 ${compact ? 'text-[10px]' : 'text-xs'}`} style={{ color: '#00d4d4' }}>
        <span
          className="w-3 h-3 rounded-full border-2 border-transparent animate-spin shrink-0"
          style={{ borderTopColor: '#00d4d4', borderRightColor: '#8b5cf6' }}
        />
        Enriching…
      </span>
    )
  }

  if (status === 'ERROR') {
    return (
      <span className={`inline-flex items-center gap-1.5 ${compact ? 'text-[10px]' : 'text-xs'}`}>
        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: '#ef4444' }} />
        {!compact && <span style={{ color: '#ef4444' }}>Failed</span>}
        {onRetry && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              e.preventDefault()
              onRetry()
            }}
            disabled={retrying}
            className="px-2 py-0.5 rounded-md font-semibold disabled:opacity-50"
            style={{
              border: '1px solid rgba(239,68,68,0.4)',
              color: '#ef4444',
              fontSize: compact ? '10px' : '11px',
            }}
          >
            {retrying ? '…' : 'Retry'}
          </button>
        )}
      </span>
    )
  }

  return (
    <span className={`inline-flex items-center gap-1.5 ${compact ? 'text-[10px]' : 'text-xs'}`}>
      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: '#22c55e', boxShadow: '0 0 6px rgba(34,197,94,0.6)' }} />
      {!compact && <span style={{ color: '#22c55e' }}>Enriched</span>}
    </span>
  )
}
