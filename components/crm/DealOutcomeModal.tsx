'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { logDealOutcome } from '@/lib/crm-client'
import type { ScannedContact } from '@/lib/types'

const LOST_REASONS = ['Not interested', 'Budget', 'Competitor', 'Timing', 'Other']

type Props = {
  contact: ScannedContact | null
  mode: 'won' | 'lost' | null
  onClose: () => void
  onUpdated: (c: ScannedContact) => void
}

export default function DealOutcomeModal({ contact, mode, onClose, onUpdated }: Props) {
  const [dealValue, setDealValue] = useState(String(contact?.deal_value || ''))
  const [reason, setReason] = useState('Not interested')
  const [customReason, setCustomReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [celebrate, setCelebrate] = useState(false)

  if (!contact || !mode) return null

  async function confirm() {
    if (!contact || !mode) return
    const outcome = mode
    setSaving(true)
    try {
      const { contact: updated } = await logDealOutcome({
        contactId: contact.id,
        outcome,
        dealValue: Number(dealValue) || 0,
        reason: outcome === 'lost' ? (reason === 'Other' ? customReason || 'Other' : reason) : undefined,
      })
      if (outcome === 'won') {
        setCelebrate(true)
        setTimeout(() => {
          onUpdated(updated)
          onClose()
        }, 1200)
      } else {
        onUpdated(updated)
        onClose()
      }
    } catch (err) {
      console.error(err)
    } finally {
      setSaving(false)
    }
  }

  return (
    <AnimatePresence>
      <div
        className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
        style={{ background: 'rgba(10,12,20,0.75)' }}
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 24 }}
          className="w-full max-w-md rounded-2xl p-5 flex flex-col gap-4"
          style={{ background: '#141628', border: '1px solid rgba(139,92,246,0.2)' }}
          onClick={(e) => e.stopPropagation()}
        >
          {celebrate ? (
            <div className="text-center py-8">
              <motion.p
                initial={{ scale: 0.5 }}
                animate={{ scale: 1 }}
                className="text-4xl mb-3"
              >
                🎉
              </motion.p>
              <p className="text-lg font-bold" style={{ color: '#22c55e' }}>Deal won!</p>
            </div>
          ) : mode === 'won' ? (
            <>
              <p className="font-bold text-lg" style={{ color: '#f0f0ff' }}>🏆 Mark as Won</p>
              <p className="text-sm" style={{ color: '#8892b0' }}>{contact.name}</p>
              <label className="text-xs uppercase tracking-wider" style={{ color: '#8892b0' }}>
                💰 Final deal value
              </label>
              <input
                type="number"
                value={dealValue}
                onChange={(e) => setDealValue(e.target.value)}
                placeholder="0"
                className="abc-input px-4 py-3 text-base min-h-[52px]"
              />
              <button
                type="button"
                disabled={saving}
                onClick={confirm}
                className="glow-btn w-full rounded-xl py-3.5 font-bold min-h-[52px] disabled:opacity-40"
              >
                {saving ? 'Saving…' : '🏆 Confirm Win!'}
              </button>
            </>
          ) : (
            <>
              <p className="font-bold text-lg" style={{ color: '#f0f0ff' }}>✗ Mark as Lost</p>
              <p className="text-sm" style={{ color: '#8892b0' }}>{contact.name}</p>
              <p className="text-xs uppercase tracking-wider" style={{ color: '#8892b0' }}>
                📝 Why did you lose this deal?
              </p>
              <div className="flex flex-wrap gap-2">
                {LOST_REASONS.map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setReason(r)}
                    className="rounded-full px-3 py-2 text-xs font-semibold min-h-[44px]"
                    style={
                      reason === r
                        ? { background: 'rgba(240,25,125,0.2)', color: '#f0197d', border: '1px solid rgba(240,25,125,0.4)' }
                        : { background: '#1c1f35', color: '#8892b0', border: '1px solid rgba(139,92,246,0.12)' }
                    }
                  >
                    {r}
                  </button>
                ))}
              </div>
              {reason === 'Other' && (
                <input
                  value={customReason}
                  onChange={(e) => setCustomReason(e.target.value)}
                  placeholder="Reason…"
                  className="abc-input px-4 py-3 text-base min-h-[48px]"
                />
              )}
              <button
                type="button"
                disabled={saving}
                onClick={confirm}
                className="w-full rounded-xl py-3.5 font-bold min-h-[52px] disabled:opacity-40"
                style={{ background: 'rgba(239,68,68,0.15)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.35)' }}
              >
                {saving ? 'Saving…' : 'Confirm'}
              </button>
            </>
          )}
          {!celebrate && (
            <button type="button" onClick={onClose} className="text-sm" style={{ color: '#8892b0' }}>
              Cancel
            </button>
          )}
        </motion.div>
      </div>
    </AnimatePresence>
  )
}
