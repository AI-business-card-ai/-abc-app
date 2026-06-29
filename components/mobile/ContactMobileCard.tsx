'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getAiNextStep, getScoreTier } from '@/lib/pipeline-ai'
import { logCrmActivity } from '@/lib/crm-client'
import type { ScannedContact } from '@/lib/types'

type Props = {
  contact: ScannedContact
  onContacted?: () => void
  onFollowUp?: () => void
  onDelete?: (contactId: string) => void
}

export default function ContactMobileCard({ contact, onContacted, onFollowUp, onDelete }: Props) {
  const router = useRouter()
  const startX = useRef(0)
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [offsetX, setOffsetX] = useState(0)
  const [swiping, setSwiping] = useState(false)
  const [deleteRevealed, setDeleteRevealed] = useState(false)

  const score = contact.ai_lead_score ?? contact.match_score ?? 0
  const tier = getScoreTier(score)
  const step = getAiNextStep(contact)

  const initials =
    contact.name
      ?.split(' ')
      .map((n) => n[0])
      .join('')
      .substring(0, 2)
      .toUpperCase() || '?'

  function onTouchStart(e: React.TouchEvent) {
    startX.current = e.touches[0].clientX
    setSwiping(true)
    longPressTimer.current = setTimeout(() => {
      setDeleteRevealed(true)
      setOffsetX(0)
      if (navigator.vibrate) navigator.vibrate(20)
    }, 500)
  }

  function clearLongPress() {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
  }

  function onTouchMove(e: React.TouchEvent) {
    clearLongPress()
    if (!swiping) return
    setOffsetX(e.touches[0].clientX - startX.current)
  }

  function onTouchEnd() {
    clearLongPress()
    if (deleteRevealed) return
    if (offsetX > 80) onContacted?.()
    else if (offsetX < -80) onFollowUp?.()
    setOffsetX(0)
    setSwiping(false)
  }

  function handleDeleteClick(e: React.MouseEvent) {
    e.stopPropagation()
    if (!window.confirm('Delete this contact? This cannot be undone.')) {
      setDeleteRevealed(false)
      return
    }
    onDelete?.(contact.id)
    setDeleteRevealed(false)
  }

  const cardOffset = deleteRevealed ? -88 : offsetX

  function openChannel(channel: 'linkedin' | 'email' | 'whatsapp') {
    hapticAndOpen(channel)
  }

  function hapticAndOpen(channel: 'linkedin' | 'email' | 'whatsapp') {
    if (channel === 'linkedin') {
      if (contact.linkedin_url) window.open(contact.linkedin_url, '_blank')
      logCrmActivity({
        contactId: contact.id,
        activityType: 'LINKEDIN_COPIED',
        activityDetail: `Quick LinkedIn from contacts list — ${contact.name}`,
      })
    } else if (channel === 'email' && contact.email) {
      window.open(`mailto:${contact.email}`)
      logCrmActivity({
        contactId: contact.id,
        activityType: 'EMAIL_SENT',
        activityDetail: `Quick email from contacts list — ${contact.name}`,
      })
    } else if (channel === 'whatsapp' && contact.phone) {
      const phone = contact.phone.replace(/\D/g, '')
      window.open(`https://wa.me/${phone}`)
      logCrmActivity({
        contactId: contact.id,
        activityType: 'WHATSAPP_OPENED',
        activityDetail: `Quick WhatsApp from contacts list — ${contact.name}`,
      })
    }
    router.push('/contact/' + contact.id)
  }

  const swipeHint =
    offsetX > 40 ? '✓ Contacted' : offsetX < -40 ? 'Follow-up →' : null

  return (
    <>
    <div className="relative overflow-hidden rounded-2xl">
      <button
        type="button"
        onClick={handleDeleteClick}
        className="absolute inset-y-0 right-0 z-0 flex items-center justify-center font-bold text-sm min-w-[88px]"
        style={{ background: '#ef4444', color: '#fff' }}
        aria-label="Delete contact"
      >
        Delete
      </button>

    <div
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      className="relative z-10 rounded-2xl p-4 flex flex-col gap-3 touch-pan-y transition-transform"
      style={{
        background: '#141628',
        border: '1px solid rgba(139, 92, 246, 0.15)',
        transform: `translateX(${cardOffset}px)`,
        transition: deleteRevealed ? 'transform 0.2s ease-out' : swiping ? 'none' : 'transform 0.2s ease-out',
      }}
      onClick={() => {
        if (deleteRevealed) {
          setDeleteRevealed(false)
          return
        }
        router.push('/contact/' + contact.id)
      }}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && router.push('/contact/' + contact.id)}
    >
      {swipeHint && (
        <div
          className="absolute inset-0 flex items-center justify-center rounded-2xl text-sm font-bold pointer-events-none"
          style={{
            background: offsetX > 0 ? 'rgba(34,197,94,0.15)' : 'rgba(240,25,125,0.12)',
            color: offsetX > 0 ? '#22c55e' : '#f0197d',
          }}
        >
          {swipeHint}
        </div>
      )}

      <div className="flex items-start gap-3">
        <div
          className="shrink-0 w-12 h-12 rounded-full flex items-center justify-center font-bold text-sm"
          style={{
            background: 'linear-gradient(135deg, #141628, #141628) padding-box, linear-gradient(135deg, #00d4d4, #8b5cf6) border-box',
            border: '2px solid transparent',
            color: '#f0f0ff',
          }}
        >
          {contact.photo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={contact.photo_url} alt="" loading="lazy" className="w-full h-full rounded-full object-cover" />
          ) : (
            initials
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <p className="font-bold text-base truncate" style={{ color: '#f0f0ff' }}>
              {contact.name || 'Unknown'}
            </p>
            <span
              className="shrink-0 text-xs font-bold px-2 py-0.5 rounded-md text-white"
              style={{ background: tier.bg }}
            >
              {score}
              {tier.tier === 'hot' ? ' 🔥' : ''}
            </span>
          </div>
          <p className="text-[13px] truncate" style={{ color: '#8892b0' }}>
            {[contact.role, contact.company].filter(Boolean).join(' · ') || '—'}
          </p>
        </div>
      </div>

      <div className="h-px" style={{ background: 'rgba(139, 92, 246, 0.12)' }} />

      <p className="text-[13px] italic" style={{ color: '#8b5cf6' }}>
        ⚡ {step.text}
      </p>

      <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
        {[
          { key: 'linkedin' as const, label: 'LinkedIn', show: contact.linkedin_url || contact.message_linkedin },
          { key: 'email' as const, label: 'Email', show: contact.email },
          { key: 'whatsapp' as const, label: 'WhatsApp', show: contact.phone },
        ]
          .filter((c) => c.show)
          .map((c) => (
            <button
              key={c.key}
              type="button"
              onClick={() => openChannel(c.key)}
              className="flex-1 rounded-full py-2.5 text-xs font-semibold min-h-[44px]"
              style={{ background: 'rgba(0, 212, 212, 0.1)', border: '1px solid rgba(0, 212, 212, 0.25)', color: '#00d4d4' }}
            >
              {c.label}
            </button>
          ))}
      </div>
    </div>
    </div>
    </>
  )
}
