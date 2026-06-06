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

const WALLET_GRADIENTS = [
  'linear-gradient(145deg, #1E1040 0%, #12082A 50%, #0A0A22 100%)',
  'linear-gradient(145deg, #10243F 0%, #0C1830 50%, #0A0A22 100%)',
  'linear-gradient(145deg, #2A1040 0%, #180828 50%, #0A0A22 100%)',
  'linear-gradient(145deg, #101A40 0%, #0A1228 50%, #0A0A22 100%)',
  'linear-gradient(145deg, #231040 0%, #140828 50%, #0A0A22 100%)',
]

const ACCENT_GLOWS = ['#7C3AED', '#0EA5E9', '#A855F7', '#38BDF8', '#8B5CF6']
const SCORE_COLORS = ['#A78BFA', '#38BDF8', '#7C3AED', '#0EA5E9', '#C4B5FD']

const SPRING = { type: 'spring' as const, stiffness: 300, damping: 30 }

const OFFSETS = [
  { top: 0, scale: 1, opacity: 1 },
  { top: 18, scale: 0.95, opacity: 1 },
  { top: 36, scale: 0.9, opacity: 1 },
  { top: 54, scale: 0.85, opacity: 0.7 },
]

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
    return (
      <div className="h-[220px] flex items-center justify-center text-sm" style={{ color: '#3A2060' }}>
        Zatím žádné kontakty.
      </div>
    )
  }

  return (
    <div
      className="relative mx-4"
      style={{ height: 220 }}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {contacts.map((c, i) => {
        const offset = i - cur
        if (offset < 0 || offset > 3) {
          return <motion.div key={c.id} animate={{ opacity: 0 }} transition={SPRING} className="absolute inset-x-0 pointer-events-none" />
        }

        const cfg = OFFSETS[offset]
        const zIndex = 5 - offset
        const grad = WALLET_GRADIENTS[i % WALLET_GRADIENTS.length]
        const glow = ACCENT_GLOWS[i % ACCENT_GLOWS.length]
        const scoreColor = SCORE_COLORS[i % SCORE_COLORS.length]
        const isTop = offset === 0

        return (
          <motion.div
            key={c.id}
            onClick={() =>
              isTop
                ? i < contacts.length - 1
                  ? onCurChange(i + 1)
                  : onSelect(c.id)
                : onCurChange(i)
            }
            animate={{ top: cfg.top, scale: cfg.scale, opacity: cfg.opacity, zIndex }}
            transition={SPRING}
            className="absolute inset-x-0 cursor-pointer overflow-hidden"
            style={{
              height: 160,
              borderRadius: 14,
              background: grad,
              border: '0.5px solid #1A0E30',
              zIndex,
              transformOrigin: 'top center',
            }}
          >
            <span
              className="pointer-events-none absolute -right-4 -top-4 w-28 h-28 rounded-full"
              style={{ background: `radial-gradient(circle, ${glow}55, transparent 70%)` }}
            />
            <span className="absolute right-4 top-3 text-2xl select-none" style={{ opacity: 0.25, color: glow }}>
              ✦
            </span>

            <div className="relative h-full p-4 flex flex-col justify-between">
              <span className="gradient-text font-bold tracking-wide truncate text-base">
                {c.company ?? '—'}
              </span>
              <div>
                <p className="font-bold text-sm" style={{ color: '#fff' }}>{c.name ?? 'Neznámý'}</p>
                <p className="text-[10px] mt-0.5" style={{ color: 'rgba(255,255,255,0.4)' }}>{c.role ?? ''}</p>
              </div>
              <div className="flex items-end justify-between gap-2">
                <span className="text-[9px] truncate max-w-[65%]" style={{ color: 'rgba(255,255,255,0.3)' }}>
                  {c.email ?? c.website ?? ''}
                </span>
                <span
                  className="rounded-full px-2.5 py-0.5 text-xs font-bold shrink-0"
                  style={{ background: 'rgba(0,0,0,0.4)', color: scoreColor }}
                >
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
