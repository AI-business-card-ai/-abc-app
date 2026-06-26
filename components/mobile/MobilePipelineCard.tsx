'use client'

import { useRouter } from 'next/navigation'
import { formatDealValue } from '@/lib/tags'
import { getAiNextStep, getScoreTier } from '@/lib/pipeline-ai'
import type { ScannedContact } from '@/lib/types'

type Props = {
  contact: ScannedContact
  onAction: (c: ScannedContact) => void
  onUpdate: (c: ScannedContact) => void
}

export default function MobilePipelineCard({ contact, onAction, onUpdate }: Props) {
  const router = useRouter()
  const score = contact.ai_lead_score ?? contact.match_score ?? 0
  const tier = getScoreTier(score)
  const step = getAiNextStep(contact)
  const deal = Number(contact.deal_value) || 0

  return (
    <div
      className="rounded-2xl p-4 flex flex-col gap-2"
      style={{ background: '#141628', border: '1px solid rgba(139, 92, 246, 0.12)' }}
      onClick={() => router.push('/contacts/' + contact.id)}
      role="button"
      tabIndex={0}
    >
      <div className="flex justify-between gap-2">
        <div className="min-w-0">
          <p className="font-bold truncate" style={{ color: '#f0f0ff' }}>
            {contact.name || 'Unknown'}
          </p>
          <p className="text-xs truncate" style={{ color: '#8892b0' }}>
            {[contact.role, contact.company].filter(Boolean).join(' · ')}
          </p>
        </div>
        <span className="shrink-0 text-xs font-bold px-2 py-1 rounded text-white" style={{ background: tier.bg }}>
          {score}
        </span>
      </div>
      {deal > 0 && (
        <p className="text-xs font-semibold" style={{ color: '#f59e0b' }}>
          💰 {formatDealValue(deal, contact.deal_currency || 'USD')}
        </p>
      )}
      <p className="text-xs italic" style={{ color: '#8b5cf6' }}>
        ⚡ {step.text}
      </p>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          onAction(contact)
        }}
        className="rounded-lg py-2.5 text-xs font-semibold text-white min-h-[44px]"
        style={{ background: 'linear-gradient(135deg, #00d4d4, #8b5cf6)' }}
      >
        {step.action}
      </button>
    </div>
  )
}
