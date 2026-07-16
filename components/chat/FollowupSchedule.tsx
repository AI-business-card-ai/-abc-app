'use client'

import { useMemo, useState } from 'react'
import { createClientComponent } from '@/lib/supabase'
import type { FollowupSequence } from '@/lib/types'

const CHANNEL_META: Record<'linkedin' | 'email' | 'whatsapp', { label: string; color: string }> = {
  linkedin: { label: 'LinkedIn', color: '#0077B5' },
  email: { label: 'Email', color: '#f0197d' },
  whatsapp: { label: 'WhatsApp', color: '#25D366' },
}

type Props = {
  sequences: FollowupSequence[]
  onSequenceUpdated: (row: FollowupSequence) => void
}

export default function FollowupSchedule({ sequences, onSequenceUpdated }: Props) {
  const supabase = useMemo(() => createClientComponent(), [])
  const [sendingId, setSendingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const scheduled = sequences.filter((s) => s.status === 'scheduled')
  const sent = sequences.filter((s) => s.status === 'sent')

  async function sendNow(seq: FollowupSequence) {
    setSendingId(seq.id)
    setError(null)
    try {
      const now = new Date().toISOString()
      const { data, error: updateError } = await supabase
        .from('followup_sequences')
        .update({ status: 'sent', sent_at: now })
        .eq('id', seq.id)
        .select()
        .single()

      if (updateError) throw new Error(updateError.message)
      onSequenceUpdated(data as FollowupSequence)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Send failed.')
    } finally {
      setSendingId(null)
    }
  }

  if (scheduled.length === 0 && sent.length === 0) return null

  return (
    <div style={{ background: '#1a1a1a', borderRadius: '12px', border: '1px solid #2a2a2a', padding: '20px' }}>
      <div style={{ fontSize: '11px', color: '#f0197d', letterSpacing: '0.08em', marginBottom: '12px' }}>
        SCHEDULED FOLLOW-UPS
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {scheduled.map((s) => {
          const meta = CHANNEL_META[s.message_type]
          const isSending = sendingId === s.id
          return (
            <div
              key={s.id}
              style={{
                background: '#242424',
                border: '1px solid #2a2a2a',
                borderLeft: `3px solid ${meta.color}`,
                borderRadius: '8px',
                padding: '12px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: meta.color,
                    boxShadow: `0 0 6px ${meta.color}`,
                    flexShrink: 0,
                  }}
                />
                <span style={{ fontSize: '12px', fontWeight: 700, color: '#ffffff', flex: 1 }}>
                  {meta.label} · Step {s.step}
                </span>
                <span style={{ fontSize: '11px', color: '#555555', flexShrink: 0 }}>
                  {new Date(s.scheduled_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                </span>
                <button
                  type="button"
                  className="interactive-primary"
                  disabled={isSending}
                  onClick={() => void sendNow(s)}
                  style={{
                    flexShrink: 0,
                    padding: '6px 12px',
                    borderRadius: '999px',
                    border: 'none',
                    background: 'linear-gradient(135deg,#f0197d,#00d4d4)',
                    color: '#ffffff',
                    fontSize: '11px',
                    fontWeight: 700,
                    cursor: isSending ? 'wait' : 'pointer',
                    opacity: isSending ? 0.6 : 1,
                  }}
                >
                  {isSending ? 'Sending…' : 'Send now'}
                </button>
              </div>
              {s.message_body && (
                <p
                  style={{
                    margin: 0,
                    fontSize: '12px',
                    color: '#999999',
                    lineHeight: 1.5,
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                  }}
                >
                  {s.message_body}
                </p>
              )}
            </div>
          )
        })}

        {sent.map((s) => {
          const meta = CHANNEL_META[s.message_type]
          return (
            <div
              key={s.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                background: '#242424',
                border: '1px solid #2a2a2a',
                borderRadius: '8px',
                padding: '10px 12px',
                opacity: 0.6,
              }}
            >
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: meta.color, flexShrink: 0 }} />
              <span style={{ fontSize: '12px', color: '#999999', flex: 1 }}>
                {meta.label} · Step {s.step}
              </span>
              <span style={{ fontSize: '11px', color: '#22c55e', flexShrink: 0 }}>Sent ✓</span>
            </div>
          )
        })}
      </div>

      {error && (
        <p style={{ margin: '10px 0 0', fontSize: '12px', color: '#ef4444' }}>{error}</p>
      )}
    </div>
  )
}
