'use client'

import { motion } from 'framer-motion'
import EnrichingPulse from '@/components/ui/EnrichingPulse'
import { isContactEnriching } from '@/lib/contact-enrichment-ui'
import type { ScannedContact } from '@/lib/types'

export type BurstQueueItem = {
  id: string
  previewUrl: string
  status: 'queued' | 'ocr' | 'saved' | 'enriched' | 'error'
  contact?: ScannedContact
  error?: string
  justCaptured?: boolean
}

type Props = {
  items: BurstQueueItem[]
}

function queueItemLabel(item: BurstQueueItem): string | null {
  if (item.status === 'enriched' && item.contact) {
    const score = item.contact.match_score ?? item.contact.ai_lead_score
    if (score != null && score > 0) return String(score)
  }
  return null
}

export default function ScanBurstQueue({ items }: Props) {
  if (items.length === 0) return null

  return (
    <div className="mx-4 mb-2 z-20 relative">
      <p className="text-[10px] uppercase tracking-wider mb-2" style={{ color: '#666666' }}>
        Queue · {items.length}
      </p>
      <div
        className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide"
        style={{ WebkitOverflowScrolling: 'touch' }}
      >
        {items.map((item) => {
          const scoreLabel = queueItemLabel(item)
          const enriching =
            item.contact && isContactEnriching(item.contact) && item.status !== 'error'
          const isProcessing = item.status === 'queued' || item.status === 'ocr'

          return (
            <motion.div
              key={item.id}
              layout
              initial={item.justCaptured ? { scale: 1.2, opacity: 0.6, y: -40 } : { scale: 0.85, opacity: 0 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              transition={{ type: 'spring', stiffness: 420, damping: 28 }}
              className="relative shrink-0 rounded-xl overflow-hidden"
              style={{
                width: 56,
                height: 56,
                border: item.status === 'error'
                  ? '2px solid rgba(239,68,68,0.6)'
                  : item.status === 'enriched'
                    ? '2px solid rgba(34,197,94,0.55)'
                    : '2px solid rgba(0, 212, 212, 0.35)',
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={item.previewUrl} alt="" className="w-full h-full object-cover" />

              {item.justCaptured && (
                <motion.div
                  initial={{ opacity: 1, scale: 1 }}
                  animate={{ opacity: 0, scale: 1.4 }}
                  transition={{ duration: 0.35 }}
                  className="absolute inset-0 flex items-center justify-center"
                  style={{ background: 'rgba(34,197,94,0.35)' }}
                >
                  <span className="text-xl font-bold" style={{ color: '#ffffff' }}>✓</span>
                </motion.div>
              )}

              {(isProcessing || enriching) && !item.justCaptured && item.status !== 'enriched' && (
                <div
                  className="absolute inset-0 flex items-center justify-center"
                  style={{ background: 'rgba(15,15,15,0.55)' }}
                >
                  <span
                    className="rounded-full enriching-pulse-dot"
                    style={{
                      width: 10,
                      height: 10,
                      background: 'linear-gradient(135deg, #f0197d, #00d4d4)',
                    }}
                  />
                </div>
              )}

              {item.status === 'enriched' && !item.justCaptured && (
                <div
                  className="absolute inset-0 flex items-center justify-center"
                  style={{ background: 'rgba(34,197,94,0.25)' }}
                >
                  {scoreLabel ? (
                    <span className="text-sm font-extrabold tabular-nums" style={{ color: '#ffffff' }}>
                      {scoreLabel}
                    </span>
                  ) : (
                    <span className="text-base font-bold" style={{ color: '#22c55e' }}>✓</span>
                  )}
                </div>
              )}

              {item.status === 'error' && (
                <div
                  className="absolute inset-0 flex items-center justify-center text-lg font-bold"
                  style={{ background: 'rgba(239,68,68,0.35)', color: '#ffffff' }}
                >
                  !
                </div>
              )}
            </motion.div>
          )
        })}
      </div>
    </div>
  )
}
