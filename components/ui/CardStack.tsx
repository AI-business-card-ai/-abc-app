'use client'

import { useRef } from 'react'
import { motion } from 'framer-motion'
import type { ScannedContact } from '@/lib/types'

interface Props {
  contacts: ScannedContact[]
  cur: number
  onCurChange: (index: number) => void
  onSelect: (id: string) => void
}

const GRADIENTS = [
  'linear-gradient(135deg,#1E1040,#0A0A22)',
  'linear-gradient(135deg,#10243F,#0A0A22)',
  'linear-gradient(135deg,#2A1040,#0A0A22)',
  'linear-gradient(135deg,#101A40,#0A0A22)',
  'linear-gradient(135deg,#231040,#0A0A22)',
]
const GLOWS = ['#7C3AED', '#0EA5E9', '#A855F7', '#3B82F6', '#8B5CF6']

const SPRING = { type: 'spring' as const, stiffness: 300, damping: 30 }

function scoreColor(score: number | null) {
  if (score === null) return '#4B5563'
  if (score > 75) return '#7C3AED'
  if (score > 50) return '#0EA5E9'
  return '#4B5563'
}

export default function CardStack({ contacts, cur, onCurChange, onSelect }: Props) {
  const touchStartX = useRef<number | null>(null)

  function handleTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX
  }
  function handleTouchEnd(e: React.TouchEvent) {
    if (touchStartX.current === null) return
    const dx = e.changedTouches[0].clientX - touchStartX.current
    if (dx < -50 && cur < contacts.length - 1) onCurChange(cur + 1)
    else if (dx > 50 && cur > 0) onCurChange(cur - 1)
    touchStartX.current = null
  }

  if (contacts.length === 0) {
    return <div className="h-[200px] flex items-center justify-center text-sm text-[#6B7280]">Zatím žádné kontakty.</div>
  }

  return (
    <div
      className="relative mx-4"
      style={{ height: 200 }}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {contacts.map((c, i) => {
        const offset = i - cur
        if (offset < 0 || offset > 3) {
          // Cards already swiped past, or too far back, are hidden.
          return (
            <motion.div
              key={c.id}
              animate={{ opacity: 0 }}
              transition={SPRING}
              className="absolute inset-x-0 pointer-events-none"
              style={{ zIndex: 0 }}
            />
          )
        }
        const top = offset * 18
        const scale = 1 - offset * 0.05
        const opacity = offset === 3 ? 0.7 : 1
        const zIndex = contacts.length - offset
        const grad = GRADIENTS[i % GRADIENTS.length]
        const glow = GLOWS[i % GLOWS.length]

        return (
          <motion.div
            key={c.id}
            onClick={() => (offset === 0 ? (i < contacts.length - 1 ? onCurChange(i + 1) : onSelect(c.id)) : onCurChange(i))}
            animate={{ top, scale, opacity, zIndex }}
            transition={SPRING}
            className="absolute inset-x-0 overflow-hidden cursor-pointer"
            style={{ height: 160, borderRadius: 14, background: grad, zIndex }}
          >
            <span
              className="pointer-events-none absolute -right-8 -top-8 w-32 h-32 rounded-full"
              style={{ background: `radial-gradient(circle, ${glow}55, transparent 70%)` }}
            />
            <span className="absolute right-4 top-3 text-2xl" style={{ opacity: 0.25, color: glow }}>✦</span>
            <div className="relative h-full p-4 flex flex-col justify-between">
              <span className="gradient-text text-xl font-black">{c.company ?? '—'}</span>
              <div>
                <p className="text-[#F0EAFF] font-bold">{c.name ?? 'Neznámý'}</p>
                <p className="text-xs text-[#6B7280]">{c.role ?? ''}</p>
              </div>
              <div className="flex items-end justify-between">
                <span className="text-[10px] text-[#6B7280] truncate max-w-[60%]">{c.email ?? c.website ?? ''}</span>
                <span className="rounded-full px-2.5 py-1 text-xs font-bold text-white" style={{ background: scoreColor(c.match_score) }}>
                  {c.match_score ?? '–'}
                </span>
              </div>
            </div>
          </motion.div>
        )
      })}
    </div>
  )
}
