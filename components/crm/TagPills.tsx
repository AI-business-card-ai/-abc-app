'use client'

import { getTagMeta } from '@/lib/tags'

type Props = {
  tags: string[]
  onRemove?: (tag: string) => void
  onAdd?: () => void
  compact?: boolean
}

export default function TagPills({ tags, onRemove, onAdd, compact }: Props) {
  if (!tags.length && !onAdd) return null

  return (
    <div className={`flex flex-wrap gap-1 ${compact ? '' : 'mt-1'}`}>
      {tags.map((tag) => {
        const meta = getTagMeta(tag)
        return (
          <span
            key={tag}
            className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold"
            style={{
              background: `${meta.color}22`,
              color: meta.color,
              border: `1px solid ${meta.color}55`,
            }}
          >
            {tag}
            {onRemove && (
              <button
                type="button"
                onClick={() => onRemove(tag)}
                className="opacity-70 hover:opacity-100 leading-none"
                aria-label={`Remove ${tag}`}
              >
                ×
              </button>
            )}
          </span>
        )
      })}
      {onAdd && (
        <button
          type="button"
          onClick={onAdd}
          className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
          style={{ border: '1px dashed rgba(139,92,246,0.4)', color: '#8892b0' }}
        >
          + Add
        </button>
      )}
    </div>
  )
}
