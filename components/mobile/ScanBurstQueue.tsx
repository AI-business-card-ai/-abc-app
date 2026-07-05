'use client'

import { motion } from 'framer-motion'
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
  onItemClick?: (contactId: string) => void
}

function queueItemLabel(item: BurstQueueItem): string | null {
  if (item.status === 'enriched' && item.contact) {
    const score = item.contact.match_score ?? item.contact.ai_lead_score
    if (score != null && score > 0) return String(score)
  }
  return null
}

export default function ScanBurstQueue({ items, onItemClick }: Props) {
  if (items.length === 0) return null

  return (
    <div className="mx-4 mb-2 z-20 relative">
      <p className="text-[10px] uppercase tracking-wider mb-2" style={{ color: '#666666' }}>
        Fronta · {items.length}
      </p>
      <div
        className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide"
        style={{ WebkitOverflowScrolling: 'touch' }}
      >
        {items.map((item) => {
          const scoreLabel = queueItemLabel(item)
          const isProcessing = item.status === 'queued' || item.status === 'ocr' || item.status === 'saved'
          const contactId = item.contact?.id

          return (
            <motion.button
              key={item.id}
              type="button"
              layout
              initial={item.justCaptured ? { scale: 1.2, opacity: 0.6, y: -40 } : { scale: 0.85, opacity: 0 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              transition={{ type: 'spring', stiffness: 420, damping: 28 }}
              disabled={!contactId}
              onClick={() => contactId && onItemClick?.(contactId)}
              className="relative shrink-0 rounded-xl overflow-hidden disabled:cursor-default"
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

              {isProcessing && !item.justCaptured && (
                <div
                  className="absolute inset-0 flex items-center justify-center"
                  style={{ background: 'rgba(15,15,15,0.55)' }}
                >
                  <div
                    className="w-5 h-5 rounded-full border-2 border-t-transparent animate-spin"
                    style={{ borderColor: '#00d4d4', borderTopColor: 'transparent' }}
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
            </motion.button>
          )
        })}
      </div>
    </div>
  )
}
