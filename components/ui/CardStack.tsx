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

const SPRING = { type: 'spring' as const, stiffness: 320, damping: 32 }

function scoreBadgeStyle(score: number | null) {
  if (score === null) return { background: '#3A2060', color: '#8B7AA8' }
  if (score > 75) return { background: 'linear-gradient(135deg, #7C3AED, #0EA5E9)', color: '#fff', boxShadow: '0 2px 10px rgba(124,58,237,0.4)' }
  if (score > 50) return { background: 'linear-gradient(135deg, #0EA5E9, #38BDF8)', color: '#fff', boxShadow: '0 2px 10px rgba(14,165,233,0.3)' }
  return { background: '#1A0E30', color: '#8B7AA8' }
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
    return (
      <div className="h-[220px] flex items-center justify-center text-sm text-text-secondary">
        Zatím žádné kontakty.
      </div>
    )
  }

  return (
    <div
      className="relative mx-4"
      style={{ height: 220, perspective: 800 }}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {contacts.map((c, i) => {
        const offset = i - cur
        if (offset < 0 || offset > 3) {
          return (
            <motion.div
              key={c.id}
              animate={{ opacity: 0 }}
              transition={SPRING}
              className="absolute inset-x-0 pointer-events-none"
            />
          )
        }

        const top = offset * 16
        const scale = 1 - offset * 0.045
        const opacity = offset === 3 ? 0.55 : 1 - offset * 0.08
        const zIndex = contacts.length - offset
        const grad = WALLET_GRADIENTS[i % WALLET_GRADIENTS.length]
        const glow = ACCENT_GLOWS[i % ACCENT_GLOWS.length]
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
            animate={{ top, scale, opacity, zIndex }}
            transition={SPRING}
            className="absolute inset-x-0 cursor-pointer"
            style={{ zIndex, transformOrigin: 'top center' }}
          >
            <div
              className="relative overflow-hidden"
              style={{
                height: 168,
                borderRadius: 16,
                background: grad,
                border: '0.5px solid #1A0E30',
                boxShadow: isTop
                  ? '0 8px 32px rgba(0,0,0,0.5), 0 0 24px rgba(124,58,237,0.15)'
                  : '0 4px 16px rgba(0,0,0,0.35)',
              }}
            >
              {/* wallet shine */}
              <span
                className="pointer-events-none absolute inset-0"
                style={{
                  background: 'linear-gradient(105deg, rgba(255,255,255,0.06) 0%, transparent 40%)',
                }}
              />
              <span
                className="pointer-events-none absolute -right-6 -top-6 w-28 h-28 rounded-full"
                style={{ background: `radial-gradient(circle, ${glow}44, transparent 70%)` }}
              />
              <span
                className="absolute right-4 top-3 text-2xl select-none"
                style={{ opacity: 0.3, color: glow }}
              >
                ✦
              </span>

              <div className="relative h-full p-4 flex flex-col justify-between">
                <span className="gradient-text text-lg font-black tracking-wide truncate">
                  {c.company ?? '—'}
                </span>
                <div>
                  <p className="text-text-primary font-bold text-base">{c.name ?? 'Neznámý'}</p>
                  <p className="text-xs text-text-secondary mt-0.5">{c.role ?? ''}</p>
                </div>
                <div className="flex items-end justify-between gap-2">
                  <span className="text-[10px] text-text-secondary truncate max-w-[65%]">
                    {c.email ?? c.website ?? ''}
                  </span>
                  <span
                    className="rounded-full px-2.5 py-1 text-xs font-bold shrink-0"
                    style={scoreBadgeStyle(c.match_score)}
                  >
                    {c.match_score ?? '–'}
                  </span>
                </div>
              </div>
            </div>
          </motion.div>
        )
      })}
    </div>
  )
}
