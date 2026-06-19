'use client'

import { useState } from 'react'
import { motion, useMotionValue, useTransform, PanInfo } from 'framer-motion'
import type { ScannedContact } from '@/lib/types'

interface Props {
  contacts: ScannedContact[]
  cur: number
  onCurChange: (index: number) => void
  onSelect: (id: string) => void
}

const SPRING = { type: 'spring' as const, stiffness: 320, damping: 32 }

const STACK_LAYERS = [
  { top: 0, scale: 1, opacity: 1, zIndex: 10 },
  { top: 20, scale: 0.96, opacity: 1, zIndex: 9 },
  { top: 40, scale: 0.92, opacity: 0.9, zIndex: 8 },
  { top: 60, scale: 0.88, opacity: 0.7, zIndex: 7 },
  { top: 80, scale: 0.84, opacity: 0.5, zIndex: 6 },
]

const CARD_THEMES = [
  { bg: 'linear-gradient(135deg, #0a1628, #1a0a3c)', glow: '#7C3AED', score: '#A78BFA', accent: '#6366F1' },
  { bg: 'linear-gradient(135deg, #0a2818, #1a3c0a)', glow: '#22C55E', score: '#86EFAC', accent: '#4ADE80' },
  { bg: 'linear-gradient(135deg, #280a0a, #3c1a0a)', glow: '#F97316', score: '#FDBA74', accent: '#FB923C' },
  { bg: 'linear-gradient(135deg, #0a1a28, #0a2838)', glow: '#0EA5E9', score: '#7DD3FC', accent: '#38BDF8' },
  { bg: 'linear-gradient(135deg, #1a0a28, #280a1a)', glow: '#EC4899', score: '#F9A8D4', accent: '#F472B6' },
  { bg: 'linear-gradient(135deg, #28200a, #1a280a)', glow: '#EAB308', score: '#FDE047', accent: '#FACC15' },
]

const NOISE_BG = `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`

function BusinessCardFace({
  contact,
  themeIndex,
  isTop,
}: {
  contact: ScannedContact
  themeIndex: number
  isTop: boolean
}) {
  const theme = CARD_THEMES[themeIndex % CARD_THEMES.length]
  const secondary = contact.website || contact.phone || ''

  return (
    <>
      <div
        className="absolute inset-0 pointer-events-none rounded-2xl"
        style={{ backgroundImage: NOISE_BG, opacity: 0.03, backgroundSize: 'cover' }}
      />
      <span
        className="pointer-events-none absolute -right-6 -top-6 w-32 h-32 rounded-full"
        style={{ background: `radial-gradient(circle, ${theme.glow}66, transparent 70%)` }}
      />

      <div className="relative h-full p-4 flex flex-col">
        <div className="flex items-start gap-2.5">
          {contact.photo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={contact.photo_url}
              alt={contact.name || ''}
              className="w-9 h-9 rounded-full object-cover shrink-0"
              style={{ border: `1.5px solid ${theme.accent}` }}
            />
          ) : (
            <span
              className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
              style={{ background: 'rgba(255,255,255,0.08)', border: `1.5px solid ${theme.accent}`, color: '#fff' }}
            >
              {contact.name?.split(' ').map((n) => n[0]).join('').substring(0, 2) || '✦'}
            </span>
          )}
          <span
            className="font-black tracking-tight truncate flex-1 text-lg leading-tight"
            style={{
              background: `linear-gradient(135deg, #fff, ${theme.accent})`,
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}
          >
            {contact.company ?? '—'}
          </span>
        </div>

        <div className="mt-3 flex-1">
          <p className="font-bold truncate" style={{ fontSize: 18, color: '#fff' }}>
            {contact.name ?? 'Unknown'}
          </p>
          <p className="truncate mt-0.5" style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>
            {contact.role ?? '—'}
          </p>
        </div>

        <div className="flex items-end justify-between gap-2 mt-auto">
          <div className="min-w-0 flex-1">
            {contact.email && (
              <p className="truncate" style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>
                {contact.email}
              </p>
            )}
            {secondary && (
              <p className="truncate mt-0.5" style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>
                {secondary}
              </p>
            )}
          </div>
          <div className="flex flex-col items-end gap-1.5 shrink-0">
            <span
              className="rounded-full px-3 py-1 text-xs font-bold tabular-nums"
              style={{
                background: 'rgba(0,0,0,0.4)',
                color: theme.score,
                border: '0.5px solid rgba(255,255,255,0.08)',
              }}
            >
              {contact.match_score ?? '–'}
            </span>
            {contact.event_name && (
              <span className="flex items-center gap-1 max-w-[88px]">
                <span
                  className="w-1.5 h-1.5 rounded-full shrink-0"
                  style={{ background: theme.accent, boxShadow: `0 0 4px ${theme.accent}` }}
                />
                <span className="truncate" style={{ fontSize: 9, color: 'rgba(255,255,255,0.45)' }}>
                  {contact.event_name}
                </span>
              </span>
            )}
          </div>
        </div>
      </div>

      {isTop && (
        <div
          className="absolute inset-0 rounded-2xl pointer-events-none"
          style={{ boxShadow: '0 16px 48px rgba(0,0,0,0.5)' }}
        />
      )}
    </>
  )
}

export default function CardStack({ contacts, cur, onCurChange, onSelect }: Props) {
  const [flyAway, setFlyAway] = useState<'left' | 'right' | null>(null)
  const dragX = useMotionValue(0)
  const dragRotate = useTransform(dragX, [-150, 0, 150], [-12, 0, 12])

  if (contacts.length === 0) {
    return (
      <div className="h-[320px] flex items-center justify-center text-sm" style={{ color: '#3A2060' }}>
        No contacts yet.
      </div>
    )
  }

  const visible = contacts.slice(cur, cur + 5)

  function handleDragEnd(_: unknown, info: PanInfo) {
    if (flyAway) return
    if (info.offset.x < -80) {
      if (cur < contacts.length - 1) {
        setFlyAway('left')
        window.setTimeout(handleFlyComplete, 280)
      } else {
        onSelect(contacts[cur].id)
      }
      return
    }
    if (info.offset.x > 80 && cur > 0) {
      setFlyAway('right')
      window.setTimeout(handleFlyComplete, 280)
    }
  }

  function handleFlyComplete() {
    if (flyAway === 'left' && cur < contacts.length - 1) {
      onCurChange(cur + 1)
    } else if (flyAway === 'right' && cur > 0) {
      onCurChange(cur - 1)
    }
    setFlyAway(null)
    dragX.set(0)
  }

  function handleCardClick(stackIndex: number) {
    if (flyAway) return
    const globalIndex = cur + stackIndex
    if (stackIndex === 0) {
      onSelect(contacts[globalIndex].id)
    } else {
      onCurChange(globalIndex)
    }
  }

  return (
    <div className="relative px-4" style={{ height: 320, overflow: 'visible' }}>
      {visible.map((contact, stackIndex) => {
        const layer = STACK_LAYERS[stackIndex] ?? STACK_LAYERS[STACK_LAYERS.length - 1]
        const themeIndex = (cur + stackIndex) % CARD_THEMES.length
        const theme = CARD_THEMES[themeIndex]
        const isTop = stackIndex === 0

        const cardStyle: React.CSSProperties = {
          height: 200,
          borderRadius: 16,
          background: theme.bg,
          border: '0.5px solid rgba(255,255,255,0.08)',
          boxShadow: isTop ? '0 16px 48px rgba(0,0,0,0.5)' : '0 8px 32px rgba(0,0,0,0.4)',
          transformOrigin: 'top center',
          zIndex: layer.zIndex,
        }

        if (isTop) {
          return (
            <motion.div
              key={contact.id}
              drag={flyAway ? false : 'x'}
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={0.85}
              style={{
                ...cardStyle,
                x: flyAway ? undefined : dragX,
                rotate: flyAway ? undefined : dragRotate,
              }}
              animate={
                flyAway
                  ? {
                      x: flyAway === 'left' ? -300 : 300,
                      opacity: 0,
                      rotate: flyAway === 'left' ? -20 : 20,
                      top: layer.top,
                      scale: layer.scale,
                    }
                  : {
                      x: 0,
                      opacity: layer.opacity,
                      rotate: 0,
                      top: layer.top,
                      scale: layer.scale,
                    }
              }
              transition={flyAway ? { duration: 0.28, ease: 'easeIn' } : SPRING}
              onDragEnd={handleDragEnd}
              onClick={() => handleCardClick(stackIndex)}
              className="absolute inset-x-0 cursor-pointer overflow-hidden rounded-2xl"
            >
              <BusinessCardFace contact={contact} themeIndex={themeIndex} isTop />
            </motion.div>
          )
        }

        return (
          <motion.div
            key={contact.id}
            animate={{
              top: layer.top,
              scale: layer.scale,
              opacity: layer.opacity,
            }}
            transition={SPRING}
            onClick={() => handleCardClick(stackIndex)}
            className="absolute inset-x-0 cursor-pointer overflow-hidden rounded-2xl"
            style={cardStyle}
          >
            <BusinessCardFace contact={contact} themeIndex={themeIndex} isTop={false} />
          </motion.div>
        )
      })}
    </div>
  )
}
