'use client'

import type { ScannedContact } from '@/lib/types'
import EnrichingPulse from '@/components/ui/EnrichingPulse'
import { isContactEnriching } from '@/lib/contact-enrichment-ui'

type Props = {
  contact: Pick<ScannedContact, 'enrichment_status'>
  compact?: boolean
  onRetry?: () => void
  retrying?: boolean
}

export default function EnrichmentIndicator({ contact, compact, onRetry, retrying }: Props) {
  const status = contact.enrichment_status || 'DONE'

  if (isContactEnriching(contact)) {
    return <EnrichingPulse compact={compact} />
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
