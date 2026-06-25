'use client'

import { useState } from 'react'
import { CONTACT_TAGS } from '@/lib/tags'

type Props = {
  selected: string[]
  onSave: (tags: string[]) => void
  onClose: () => void
}

export default function TagSelector({ selected, onSave, onClose }: Props) {
  const [draft, setDraft] = useState<string[]>(selected)

  const toggle = (label: string) => {
    setDraft((prev) =>
      prev.includes(label) ? prev.filter((t) => t !== label) : [...prev, label]
    )
  }

  return (
    <div
      className="rounded-xl p-4 flex flex-col gap-3"
      style={{ background: '#141628', border: '1px solid rgba(139,92,246,0.2)' }}
    >
      <p className="text-xs font-bold uppercase tracking-wide" style={{ color: '#8892b0' }}>
        Select tags
      </p>
      <div className="flex flex-wrap gap-2">
        {CONTACT_TAGS.map((tag) => {
          const active = draft.includes(tag.label)
          return (
            <button
              key={tag.label}
              type="button"
              onClick={() => toggle(tag.label)}
              className="rounded-full px-3 py-1 text-xs font-semibold transition-colors"
              style={
                active
                  ? { background: tag.color, color: '#fff', border: `1px solid ${tag.color}` }
                  : { background: 'transparent', color: tag.color, border: `1px solid ${tag.color}66` }
              }
            >
              {tag.label}
            </button>
          )
        })}
      </div>
      <div className="flex gap-2 justify-end">
        <button
          type="button"
          onClick={onClose}
          className="text-xs px-3 py-1.5 rounded-lg"
          style={{ color: '#8892b0' }}
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => onSave(draft)}
          className="text-xs px-3 py-1.5 rounded-lg font-semibold text-white"
          style={{ background: 'linear-gradient(135deg, #00d4d4, #8b5cf6)' }}
        >
          Save tags
        </button>
      </div>
    </div>
  )
}
