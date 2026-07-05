'use client'

import { motion } from 'framer-motion'
import { useRouter } from 'next/navigation'
import { getEnrichmentStepLabel } from '@/lib/enrichment-steps'
import type { ScannedContact } from '@/lib/types'

const STEPS = ['apollo', 'linkedin', 'messages'] as const

type Props = {
  contact: ScannedContact
  previewUrl: string | null
  onScanAnother: () => void
}

export default function ScanInstantResult({ contact, previewUrl, onScanAnother }: Props) {
  const router = useRouter()
  const step = contact.enrichment_step || 'queued'
  const stepIndex = STEPS.findIndex((s) => s === step)
  const activeIdx = stepIndex >= 0 ? stepIndex : 0

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      className="mx-4 mb-4 rounded-2xl p-4 flex flex-col gap-3"
      style={{
        background: 'rgba(10, 12, 20, 0.95)',
        border: '1px solid rgba(0, 212, 212, 0.25)',
        backdropFilter: 'blur(12px)',
      }}
    >
      <div className="flex gap-3 items-start">
        <div
          className="shrink-0 w-16 h-16 rounded-xl overflow-hidden"
          style={{ border: '2px solid rgba(0, 212, 212, 0.4)' }}
        >
          {previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={previewUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-2xl" style={{ background: '#141628' }}>
              📇
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-bold text-lg leading-tight truncate" style={{ color: '#f0f0ff' }}>
            {contact.name || 'Unknown'}
          </p>
          <p className="text-sm truncate" style={{ color: '#00d4d4' }}>
            {[contact.role, contact.company].filter(Boolean).join(' · ') || 'Extracting…'}
          </p>
          <p className="text-xs mt-1.5" style={{ color: '#22c55e' }}>
            ✓ Saved — enriching in background…
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {STEPS.map((s, i) => (
          <span key={s} className="flex items-center gap-1.5 text-[11px]" style={{ color: i <= activeIdx ? '#00d4d4' : '#4a5168' }}>
            <span
              className="w-1.5 h-1.5 rounded-full"
              style={{
                background: i <= activeIdx ? '#00d4d4' : '#4a5168',
                boxShadow: i === activeIdx ? '0 0 6px #00d4d4' : undefined,
              }}
            />
            {s === 'apollo' ? 'Profil' : s === 'linkedin' ? 'LinkedIn' : 'Zprávy'}
          </span>
        ))}
      </div>
      <p className="text-[11px]" style={{ color: '#8892b0' }}>
        {getEnrichmentStepLabel(step)}
      </p>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => router.push('/contact/' + contact.id)}
          className="flex-1 rounded-xl py-3 text-sm font-semibold text-white"
          style={{ background: 'linear-gradient(135deg, #00d4d4, #8b5cf6)' }}
        >
          View Contact →
        </button>
        <button
          type="button"
          onClick={onScanAnother}
          className="rounded-xl px-4 py-3 text-sm font-semibold"
          style={{ border: '1px solid rgba(139, 92, 246, 0.3)', color: '#a78bfa' }}
        >
          Scan next
        </button>
      </div>
    </motion.div>
  )
}
