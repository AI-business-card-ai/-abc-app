'use client'

import { useMemo, useState } from 'react'
import { PIPELINE_STAGES } from '@/lib/pipeline'
import type { ScannedContact } from '@/lib/types'
import MobilePipelineCard from '@/components/mobile/MobilePipelineCard'

type Props = {
  contacts: ScannedContact[]
  onAction: (c: ScannedContact) => void
  onUpdate: (c: ScannedContact) => void
}

export default function PipelineMobileStages({ contacts, onAction, onUpdate }: Props) {
  const [activeStage, setActiveStage] = useState<string>('new')

  const counts = useMemo(() => {
    const map: Record<string, number> = {}
    for (const s of PIPELINE_STAGES) {
      if (s.id === 'lost') continue
      map[s.id] = contacts.filter((c) => (c.pipeline_stage || 'new') === s.id).length
    }
    return map
  }, [contacts])

  const stageContacts = useMemo(
    () => contacts.filter((c) => (c.pipeline_stage || 'new') === activeStage),
    [contacts, activeStage]
  )

  return (
    <div className="flex flex-col gap-4">
      <div
        className="flex gap-2 overflow-x-auto pb-2 snap-x snap-mandatory -mx-1 px-1"
        style={{ scrollbarWidth: 'none' }}
      >
        {PIPELINE_STAGES.filter((s) => s.id !== 'lost').map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setActiveStage(s.id)}
            className="shrink-0 snap-center rounded-xl px-4 py-3 min-h-[44px] text-left"
            style={
              activeStage === s.id
                ? { background: `${s.color}22`, border: `1px solid ${s.color}`, color: s.color }
                : { background: '#141628', border: '1px solid rgba(139,92,246,0.12)', color: '#8892b0' }
            }
          >
            <span className="text-xs font-bold block">{s.label.replace(' ✓', '')}</span>
            <span className="text-lg font-black tabular-nums">{counts[s.id] ?? 0}</span>
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-3">
        {stageContacts.length === 0 ? (
          <p className="text-center py-8 text-sm" style={{ color: '#8892b0' }}>
            No contacts in this stage
          </p>
        ) : (
          stageContacts.map((c) => (
            <MobilePipelineCard key={c.id} contact={c} onAction={onAction} onUpdate={onUpdate} />
          ))
        )}
      </div>
    </div>
  )
}
