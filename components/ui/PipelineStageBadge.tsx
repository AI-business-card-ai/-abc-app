'use client'

import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { PIPELINE_STAGES, getStageMeta } from '@/lib/pipeline'
import type { PipelineStageId } from '@/lib/types'

export default function PipelineStageBadge({
  stage,
  onChange,
  size = 'sm',
}: {
  stage: PipelineStageId | null | undefined
  onChange: (stage: PipelineStageId) => void
  size?: 'sm' | 'xs'
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const meta = getStageMeta(stage)

  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  const pad = size === 'xs' ? 'px-1.5 py-0.5 text-[9px]' : 'px-2 py-0.5 text-[10px]'

  return (
    <div ref={ref} className="relative inline-block">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          setOpen((o) => !o)
        }}
        className={`rounded-full font-bold tracking-wide ${pad}`}
        style={{
          background: `${meta.color}22`,
          color: meta.color,
          border: `0.5px solid ${meta.color}55`,
        }}
      >
        {meta.label}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 4, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.96 }}
            className="absolute left-0 top-full mt-1 z-50 rounded-xl overflow-hidden min-w-[140px]"
            style={{
              background: '#0D0A18',
              border: '0.5px solid #1A0E30',
              boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
            }}
          >
            {PIPELINE_STAGES.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  onChange(s.id)
                  setOpen(false)
                }}
                className="block w-full text-left px-3 py-2 text-xs font-semibold hover:bg-[#1A0A2E] transition-colors"
                style={{ color: s.id === (stage || 'new') ? s.color : '#8B7AA8' }}
              >
                {s.label}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
