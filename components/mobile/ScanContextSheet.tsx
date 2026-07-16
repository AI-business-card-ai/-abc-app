'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { IconMicrophone } from '@tabler/icons-react'
import {
  ALL_OUTREACH_CHANNELS,
  type OutreachChannel,
} from '@/lib/contact-enrichment-ui'

export type ContextSheetContact = {
  contactId: string
  name: string
  company: string | null
  role: string | null
}

type Props = {
  contact: ContextSheetContact | null
  waitingCount?: number
  onSave: (payload: {
    whereMet: string
    topic: string
    followupNote: string
    preferredChannels: OutreachChannel[]
  }) => Promise<void>
  onSkip: () => void
}

const CHANNEL_LABELS: Record<OutreachChannel, string> = {
  email: 'Email',
  whatsapp: 'WhatsApp',
  linkedin: 'LinkedIn',
}

export default function ScanContextSheet({ contact, waitingCount = 0, onSave, onSkip }: Props) {
  const [whereMet, setWhereMet] = useState('')
  const [topic, setTopic] = useState('')
  const [followupNote, setFollowupNote] = useState('')
  const [channels, setChannels] = useState<Set<OutreachChannel>>(
    () => new Set(ALL_OUTREACH_CHANNELS)
  )
  const [saving, setSaving] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const chunksRef = useRef<BlobPart[]>([])
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)

  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const contactId = contact?.contactId ?? null

  useEffect(() => {
    if (!contactId) return
    setWhereMet('')
    setTopic('')
    setFollowupNote('')
    setChannels(new Set(ALL_OUTREACH_CHANNELS))
    setError(null)
    setSaving(false)
  }, [contactId])

  function toggleChannel(channel: OutreachChannel) {
    setChannels((prev) => {
      const next = new Set(prev)
      if (next.has(channel)) {
        if (next.size === 1) return next
        next.delete(channel)
      } else {
        next.add(channel)
      }
      return next
    })
  }

  function selectAllChannels() {
    setChannels(new Set(ALL_OUTREACH_CHANNELS))
  }

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' })
      chunksRef.current = []
      recorder.ondataavailable = (e) => e.data.size > 0 && chunksRef.current.push(e.data)
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop())
        setIsTranscribing(true)
        try {
          const formData = new FormData()
          formData.append('audio', new Blob(chunksRef.current, { type: 'audio/webm' }), 'recording.webm')
          const res = await fetch('/api/card/transcribe', { method: 'POST', body: formData })
          const data = await res.json()
          if (data.text) {
            setWhereMet((prev) => (prev ? `${prev} ${data.text}` : data.text))
          }
        } finally {
          setIsTranscribing(false)
        }
      }
      recorder.start()
      mediaRecorderRef.current = recorder
      setIsRecording(true)
    } catch {
      setError('Microphone access denied')
    }
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop()
    mediaRecorderRef.current = null
    setIsRecording(false)
  }

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      await onSave({
        whereMet,
        topic,
        followupNote,
        preferredChannels: Array.from(channels),
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save')
      setSaving(false)
    }
  }

  const headerLine = contact
    ? [contact.name || 'Unknown', contact.company].filter(Boolean).join(' · ')
    : ''

  const subtitle = contact
    ? [contact.role, contact.company].filter(Boolean).join(' · ')
    : ''

  const sheet = (
    <AnimatePresence>
      {contact && (
        <motion.div
          key={contact.contactId}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[110] flex flex-col"
          style={{ background: '#0f0f0f' }}
        >
          <div
            className="flex-1 overflow-y-auto px-5 pt-[max(env(safe-area-inset-top),20px)] pb-6"
            style={{ WebkitOverflowScrolling: 'touch' }}
          >
            <div className="mb-6 pt-2">
              <div className="flex items-center justify-between gap-3 mb-2">
                <p className="text-[10px] uppercase tracking-widest" style={{ color: '#22c55e' }}>
                  ✓ Card scanned
                </p>
                {waitingCount > 0 && (
                  <span
                    className="shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold tabular-nums"
                    style={{
                      background: 'rgba(0, 212, 212, 0.12)',
                      border: '1px solid rgba(0, 212, 212, 0.35)',
                      color: '#00d4d4',
                    }}
                  >
                    {waitingCount} more waiting
                  </span>
                )}
              </div>
              <h2 className="text-xl font-bold leading-tight" style={{ color: '#ffffff' }}>
                {headerLine}
              </h2>
              {subtitle && contact.role && (
                <p className="text-sm mt-1" style={{ color: '#00d4d4' }}>
                  {subtitle}
                </p>
              )}
            </div>

            <div className="flex flex-col gap-5">
              <div>
                <label className="block text-xs font-semibold mb-2" style={{ color: '#999999' }}>
                  Where did you meet?
                </label>
                <div className="flex gap-2">
                  <input
                    value={whereMet}
                    onChange={(e) => setWhereMet(e.target.value)}
                    placeholder="Trade show, meeting, intro…"
                    className="flex-1 abc-input interactive-input px-3 py-3 text-base min-h-[48px]"
                    autoComplete="off"
                  />
                  <button
                    type="button"
                    onClick={isRecording ? stopRecording : startRecording}
                    disabled={isTranscribing}
                    className="interactive tap-target shrink-0 flex items-center justify-center w-12 rounded-xl disabled:opacity-40"
                    style={{
                      background: 'rgba(240,25,125,0.12)',
                      border: '1px solid rgba(240,25,125,0.35)',
                      color: '#f0197d',
                    }}
                    aria-label="Voice note"
                  >
                    <IconMicrophone size={18} />
                  </button>
                </div>
                {isTranscribing && (
                  <p className="text-[11px] mt-1" style={{ color: '#666666' }}>
                    Transcribing…
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold mb-2" style={{ color: '#999999' }}>
                  What did you discuss?
                </label>
                <input
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder="Topic, project, interest…"
                  className="w-full abc-input interactive-input px-3 py-3 text-base min-h-[48px]"
                  autoComplete="off"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold mb-2" style={{ color: '#999999' }}>
                  Note / follow-up
                </label>
                <input
                  value={followupNote}
                  onChange={(e) => setFollowupNote(e.target.value)}
                  placeholder="e.g. follow up next week…"
                  className="w-full abc-input interactive-input px-3 py-3 text-base min-h-[48px]"
                  autoComplete="off"
                />
              </div>

              <div>
                <p className="text-xs font-semibold mb-3" style={{ color: '#999999' }}>
                  Reach out via:
                </p>
                <div className="flex flex-wrap gap-2">
                  {ALL_OUTREACH_CHANNELS.map((ch) => {
                    const active = channels.has(ch)
                    return (
                      <button
                        key={ch}
                        type="button"
                        onClick={() => toggleChannel(ch)}
                        className="interactive rounded-full px-4 py-2 text-xs font-semibold min-h-[40px] transition-colors"
                        style={
                          active
                            ? {
                                background: 'linear-gradient(135deg, rgba(240,25,125,0.25), rgba(0,212,212,0.2))',
                                border: '1px solid rgba(0, 212, 212, 0.45)',
                                color: '#ffffff',
                              }
                            : {
                                background: '#1a1a1a',
                                border: '1px solid #2a2a2a',
                                color: '#666666',
                              }
                        }
                      >
                        {CHANNEL_LABELS[ch]}
                      </button>
                    )
                  })}
                  <button
                    type="button"
                    onClick={selectAllChannels}
                    className="interactive rounded-full px-4 py-2 text-xs font-semibold min-h-[40px]"
                    style={{
                      background: channels.size === ALL_OUTREACH_CHANNELS.length
                        ? 'rgba(0,212,212,0.15)'
                        : '#1a1a1a',
                      border: '1px solid #2a2a2a',
                      color: channels.size === ALL_OUTREACH_CHANNELS.length ? '#00d4d4' : '#666666',
                    }}
                  >
                    All
                  </button>
                </div>
              </div>
            </div>

            {error && (
              <p className="text-sm mt-4 px-3 py-2 rounded-xl" style={{ background: 'rgba(239,68,68,0.1)', color: '#fca5a5' }}>
                {error}
              </p>
            )}
          </div>

          <div
            className="shrink-0 px-5 pt-3 flex flex-col gap-2"
            style={{
              paddingBottom: 'max(env(safe-area-inset-bottom), 20px)',
              background: 'rgba(15,15,15,0.98)',
              borderTop: '1px solid rgba(0, 212, 212, 0.12)',
            }}
          >
            <button
              type="button"
              disabled={saving}
              onClick={() => void handleSave()}
              className="interactive-primary w-full rounded-xl text-white font-bold text-base min-h-[52px] disabled:opacity-60"
              style={{
                background: 'linear-gradient(135deg, #f0197d, #00d4d4)',
                boxShadow: '0 4px 24px rgba(240,25,125,0.2)',
              }}
            >
              {saving ? 'Saving…' : 'Save & continue'}
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={onSkip}
              className="interactive w-full rounded-xl font-semibold text-sm min-h-[44px] disabled:opacity-60"
              style={{ background: '#1a1a1a', border: '1px solid #2a2a2a', color: '#999999' }}
            >
              Skip
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )

  if (!mounted) return null
  return createPortal(sheet, document.body)
}
