'use client'

import { motion } from 'framer-motion'
import { getEnrichmentProgress, getEnrichmentStepLabel } from '@/lib/enrichment-steps'

type Props = {
  step: string | null | undefined
  status: string | null | undefined
}

export default function EnrichmentProgress({ step, status }: Props) {
  const progress = getEnrichmentProgress(step)
  const label = getEnrichmentStepLabel(step)
  const isActive = status === 'PENDING' || status === 'ENRICHING'

  if (!isActive) return null

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0, marginBottom: 0 }}
      className="abc-card p-4 flex flex-col gap-3"
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium" style={{ color: '#f0f0ff' }}>
          Enriching contact
        </p>
        <span className="text-xs tabular-nums" style={{ color: '#00d4d4' }}>
          {progress}%
        </span>
      </div>

      <div
        className="h-2 rounded-full overflow-hidden"
        style={{ background: 'rgba(139, 92, 246, 0.12)' }}
      >
        <motion.div
          className="h-full rounded-full"
          style={{ background: 'linear-gradient(135deg, #00d4d4, #8b5cf6)' }}
          initial={{ width: 0 }}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.45, ease: 'easeOut' }}
        />
      </div>

      <p className="text-xs" style={{ color: '#8892b0' }}>
        {label}
      </p>
    </motion.div>
  )
}
