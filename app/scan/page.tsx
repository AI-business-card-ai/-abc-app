'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { IconMicrophone, IconX } from '@tabler/icons-react'
import { createClientComponent } from '@/lib/supabase'
import { hapticMedium, hapticSuccess } from '@/lib/hooks/useHaptic'
import type { ABCProfile, ScannedContact } from '@/lib/types'

type FlowPhase = 'camera' | 'scanning' | 'event' | 'finishing'

function PhoneStatusBar() {
  return (
    <div className="hidden md:flex items-center justify-between px-5 pt-9 pb-1 shrink-0 relative z-20">
      <span className="text-[11px] font-semibold text-white/90 tabular-nums">9:41</span>
      <div className="flex items-center gap-2">
        <div className="flex items-end gap-[2px] h-3">
          {[4, 6, 8, 10].map((h, i) => (
            <div
              key={i}
              className="w-[3px] rounded-sm bg-white/75"
              style={{ height: h }}
            />
          ))}
        </div>
        <span className="text-[9px] font-semibold text-white/70">5G</span>
        <div
          className="relative w-[22px] h-[11px] rounded-[3px] border border-white/45 p-[1.5px]"
        >
          <div className="h-full w-[72%] rounded-[1px] bg-[#00d4d4]" />
          <div className="absolute -right-[3px] top-1/2 -translate-y-1/2 w-[2px] h-[5px] rounded-sm bg-white/45" />
        </div>
      </div>
    </div>
  )
}

async function fetchContactStatus(contactId: string) {
  const res = await fetch(`/api/card/status/${contactId}`)
  if (!res.ok) return null
  return res.json() as Promise<{ status: 'basic' | 'enriched' }>
}

export default function ScanPage() {
  const router = useRouter()
  const supabase = createClientComponent()
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const galleryInputRef = useRef<HTMLInputElement>(null)
  const chunksRef = useRef<BlobPart[]>([])

  const [selectedImage, setSelectedImage] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [isRecording, setIsRecording] = useState(false)
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null)
  const [flowPhase, setFlowPhase] = useState<FlowPhase>('camera')
  const [flash, setFlash] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showPaywall, setShowPaywall] = useState(false)
  const [savedContact, setSavedContact] = useState<ScannedContact | null>(null)
  const [submittingEvent, setSubmittingEvent] = useState(false)

  useEffect(() => {
    return () => {
      if (imagePreview) URL.revokeObjectURL(imagePreview)
    }
  }, [imagePreview])

  useEffect(() => {
    if (!savedContact?.id) return
    const channel = supabase
      .channel(`scan-${savedContact.id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'scanned_contacts', filter: `id=eq.${savedContact.id}` },
        (payload) => {
          const updated = payload.new as ScannedContact
          setSavedContact(updated)
          if (updated.scan_status === 'enriched' || updated.enrichment_status === 'DONE') {
            if (flowPhase === 'finishing') {
              router.push(`/contact/${updated.id}`)
            }
          }
        }
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [flowPhase, router, savedContact?.id, supabase])

  const resetForNextScan = useCallback(() => {
    if (imagePreview) URL.revokeObjectURL(imagePreview)
    setSelectedImage(null)
    setImagePreview(null)
    setSavedContact(null)
    setError(null)
    setNote('')
    setFlowPhase('camera')
  }, [imagePreview])

  function handleFile(file: File | undefined) {
    if (!file) return
    if (imagePreview) URL.revokeObjectURL(imagePreview)
    setSelectedImage(file)
    setImagePreview(URL.createObjectURL(file))
    setSavedContact(null)
    setError(null)
    setFlowPhase('camera')
  }

  const runPhase1Scan = useCallback(async (file: File) => {
    setFlowPhase('scanning')
    setError(null)
    hapticMedium()
    setFlash(true)
    setTimeout(() => setFlash(false), 180)

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/login')
        return
      }

      const { data: profile } = await supabase.from('abc_profiles').select('*').eq('id', user.id).maybeSingle()
      const profilePayload: Partial<ABCProfile> = profile ?? {
        id: user.id,
        communication_style: 'direct',
        outreach_language: 'EN',
      }

      const formData = new FormData()
      formData.append('image', file)
      formData.append('userId', user.id)
      formData.append('userProfile', JSON.stringify(profilePayload))

      const res = await fetch('/api/card/scan', { method: 'POST', body: formData })
      const data = await res.json()

      if (res.status === 403 && data.error === 'SCAN_LIMIT_REACHED') {
        setShowPaywall(true)
        setFlowPhase('camera')
        return
      }
      if (!res.ok || !data.success) throw new Error(data.error || 'Scan failed')

      hapticSuccess()
      const contact = (data.contacts?.[0] as ScannedContact) || null
      setSavedContact(contact)
      setFlowPhase('event')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Scan failed')
      setFlowPhase('camera')
    }
  }, [router, supabase])

  const waitForEnrichment = useCallback(async (contactId: string, maxMs = 20000) => {
    const start = Date.now()
    while (Date.now() - start < maxMs) {
      const status = await fetchContactStatus(contactId)
      if (status?.status === 'enriched') return true
      await new Promise((resolve) => setTimeout(resolve, 2000))
    }
    return false
  }, [])

  const submitEventAndContinue = useCallback(async () => {
    if (!savedContact?.id) return
    setSubmittingEvent(true)
    setError(null)

    try {
      const res = await fetch('/api/card/event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contactId: savedContact.id,
          eventName: note.trim() || null,
          note: note.trim() || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to save event')

      const status = await fetchContactStatus(savedContact.id)
      if (status?.status === 'enriched') {
        hapticSuccess()
        router.push(`/contact/${savedContact.id}`)
        return
      }

      setFlowPhase('finishing')
      await waitForEnrichment(savedContact.id, 20000)
      router.push(`/contact/${savedContact.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to continue')
      setFlowPhase('event')
    } finally {
      setSubmittingEvent(false)
    }
  }, [note, router, savedContact, waitForEnrichment])

  function triggerCamera() {
    hapticMedium()
    cameraInputRef.current?.click()
  }

  async function onCameraSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    handleFile(file)
    await runPhase1Scan(file)
  }

  async function onGallerySelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    handleFile(file)
    await runPhase1Scan(file)
  }

  const startRecording = async () => {
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
          if (data.text) setNote((prev) => (prev ? `${prev} ${data.text}` : data.text))
        } finally {
          setIsTranscribing(false)
        }
      }
      recorder.start()
      setMediaRecorder(recorder)
      setIsRecording(true)
    } catch {
      setError('Microphone access denied')
    }
  }

  const isScanning = flowPhase === 'scanning'
  const showEventForm = flowPhase === 'event' || flowPhase === 'finishing'
  const showCameraControls = flowPhase === 'camera' || flowPhase === 'scanning'

  return (
    <div
      className="fixed inset-0 z-40 flex flex-col md:static md:min-h-screen md:items-center md:justify-center md:overflow-hidden"
      style={{ background: '#0f0f0f' }}
    >
      <div
        className="hidden md:block absolute inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(ellipse at center, rgba(0,212,212,0.05) 0%, transparent 70%)' }}
      />

      <div
        className="relative flex flex-col flex-1 min-h-0 w-full h-full md:flex-none md:w-[390px] md:h-[780px] md:rounded-[44px] md:overflow-hidden md:shrink-0 md:z-10"
        style={{ background: '#0f0f0f' }}
      >
        <div
          className="hidden md:block absolute inset-0 pointer-events-none rounded-[44px] z-50"
          style={{
            border: '3px solid #2a2a2a',
            boxShadow: '0 0 0 8px #1a1a1a, 0 0 0 10px #2a2a2a, 0 30px 80px rgba(0,0,0,0.8)',
          }}
        />

        <div
          className="hidden md:block absolute top-0 left-1/2 -translate-x-1/2 z-40 pointer-events-none"
          style={{
            width: 120,
            height: 30,
            background: '#0f0f0f',
            borderRadius: '0 0 20px 20px',
          }}
        />

        <PhoneStatusBar />

        <div className="flex flex-col flex-1 min-h-0 relative">
          <AnimatePresence>
            {flash && (
              <motion.div
                initial={{ opacity: 0.85 }}
                animate={{ opacity: 0 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 z-50 pointer-events-none bg-white"
              />
            )}
          </AnimatePresence>

          <div
            className="absolute top-0 left-0 right-0 h-24 pointer-events-none z-10"
            style={{ background: 'linear-gradient(180deg, rgba(15,15,15,0.9), transparent)' }}
          />

          <button
            type="button"
            onClick={() => router.push('/contacts')}
            className="absolute top-4 right-4 z-20 tap-target rounded-full p-2 md:top-3"
            style={{ background: 'rgba(15,15,15,0.6)' }}
            aria-label="Close"
          >
            <IconX size={20} style={{ color: '#999999' }} />
          </button>

          <div className="flex-1 relative flex items-center justify-center overflow-hidden min-h-0">
            {imagePreview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={imagePreview} alt="" className="absolute inset-0 w-full h-full object-cover opacity-90" />
            ) : (
              <div
                className="absolute inset-0"
                style={{ background: 'radial-gradient(ellipse at center, #1a1a1a 0%, #0f0f0f 70%)' }}
              />
            )}

            <div className="scan-frame-mobile relative z-10 w-[85%] max-w-[320px] aspect-[1.6/1]">
              <span className="scan-corner scan-corner-tl" />
              <span className="scan-corner scan-corner-tr" />
              <span className="scan-corner scan-corner-bl" />
              <span className="scan-corner scan-corner-br" />
              {!imagePreview && !isScanning && flowPhase === 'camera' && (
                <p
                  className="absolute inset-0 flex items-center justify-center text-sm text-center px-4"
                  style={{ color: '#666666' }}
                >
                  Point at business card
                </p>
              )}
              {isScanning && (
                <p className="absolute inset-0 flex items-center justify-center text-sm font-semibold text-center px-4" style={{ color: '#00d4d4' }}>
                  AI analyzuje vizitku…
                </p>
              )}
            </div>

            {flowPhase === 'finishing' && (
              <div
                className="absolute inset-0 z-30 flex flex-col items-center justify-center px-6"
                style={{ background: 'rgba(15, 15, 15, 0.88)' }}
              >
                <div
                  className="w-10 h-10 rounded-full border-2 border-t-transparent animate-spin mb-4"
                  style={{ borderColor: '#00d4d4', borderTopColor: 'transparent' }}
                />
                <p className="text-base font-semibold text-center" style={{ color: '#ffffff' }}>
                  Dokončuji AI analýzu…
                </p>
                <p className="text-sm text-center mt-2" style={{ color: '#999999' }}>
                  AI analyzuje firmu a kontakt…
                </p>
              </div>
            )}
          </div>

          {flowPhase === 'event' && savedContact && (
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              className="mx-4 mb-3 rounded-2xl p-4 z-20 relative"
              style={{
                background: 'rgba(26, 26, 26, 0.95)',
                border: '1px solid rgba(0, 212, 212, 0.25)',
              }}
            >
              <p className="text-xs mb-1" style={{ color: '#22c55e' }}>✓ Vizitka načtena</p>
              <p className="font-bold text-lg leading-tight truncate" style={{ color: '#ffffff' }}>
                {savedContact.name || 'Unknown'}
              </p>
              <p className="text-sm truncate" style={{ color: '#00d4d4' }}>
                {[savedContact.role, savedContact.company].filter(Boolean).join(' · ') || '—'}
              </p>
              {(savedContact.email || savedContact.phone) && (
                <p className="text-xs mt-1 truncate" style={{ color: '#999999' }}>
                  {[savedContact.email, savedContact.phone].filter(Boolean).join(' · ')}
                </p>
              )}
            </motion.div>
          )}

          {error && (
            <p className="mx-4 mb-2 text-sm text-red-300 px-3 py-2 rounded-xl z-20 relative" style={{ background: 'rgba(239,68,68,0.1)' }}>
              {error}
            </p>
          )}

          <div
            className="shrink-0 z-20 px-4 pt-4 pb-[calc(env(safe-area-inset-bottom)+72px)] md:pb-4"
            style={{
              background: 'rgba(15, 15, 15, 0.95)',
              backdropFilter: 'blur(16px)',
              borderTop: '1px solid rgba(0, 212, 212, 0.12)',
              minHeight: showEventForm ? 200 : 180,
            }}
          >
            {showEventForm ? (
              <>
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-xs shrink-0" style={{ color: '#999999' }}>
                    📍 Kde jste se potkali?
                  </span>
                  <button
                    type="button"
                    onClick={isRecording ? () => { mediaRecorder?.stop(); setIsRecording(false) } : startRecording}
                    disabled={isTranscribing || flowPhase === 'finishing'}
                    className="tap-target shrink-0 flex items-center gap-1 px-3 py-2 rounded-lg text-xs font-semibold"
                    style={{ background: 'rgba(240,25,125,0.12)', border: '1px solid rgba(240,25,125,0.35)', color: '#f0197d' }}
                  >
                    <IconMicrophone size={14} />
                    {isTranscribing ? '…' : isRecording ? 'Stop' : 'Voice'}
                  </button>
                </div>
                <input
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Veletrh, schůzka, intro…"
                  disabled={flowPhase === 'finishing'}
                  className="w-full abc-input px-3 py-3 text-base mb-3 min-h-[44px]"
                />
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  type="button"
                  disabled={submittingEvent || flowPhase === 'finishing'}
                  onClick={() => void submitEventAndContinue()}
                  className="w-full rounded-xl text-white font-bold text-base disabled:opacity-50 min-h-[52px]"
                  style={{
                    background: 'linear-gradient(135deg, #f0197d, #00d4d4)',
                    boxShadow: '0 4px 24px rgba(240,25,125,0.2)',
                  }}
                >
                  {submittingEvent ? 'Ukládám…' : flowPhase === 'finishing' ? 'Analyzuji…' : 'Pokračovat →'}
                </motion.button>
              </>
            ) : (
              <>
                <div className="flex items-center gap-2 mb-3 opacity-40 pointer-events-none">
                  <span className="text-xs shrink-0" style={{ color: '#999999' }}>
                    📍 Kde jste se potkali?
                  </span>
                </div>
                <input
                  disabled
                  placeholder="Nejdřív nafoťte vizitku…"
                  className="w-full abc-input px-3 py-3 text-base mb-3 min-h-[44px] opacity-40"
                />

                {showCameraControls && (
                  <div className="flex gap-2 md:flex-col">
                    <motion.button
                      whileTap={{ scale: 0.97 }}
                      type="button"
                      disabled={isScanning}
                      onClick={triggerCamera}
                      className="flex-[2] md:flex-none w-full rounded-xl text-white font-bold text-base disabled:opacity-50 min-h-[52px] md:min-h-[48px]"
                      style={{
                        background: 'linear-gradient(135deg, #f0197d, #00d4d4)',
                        boxShadow: '0 4px 24px rgba(240,25,125,0.2)',
                      }}
                    >
                      {isScanning ? 'Analyzuji…' : '📷 SCAN CARD'}
                    </motion.button>
                    <motion.button
                      whileTap={{ scale: 0.97 }}
                      type="button"
                      disabled={isScanning}
                      onClick={() => galleryInputRef.current?.click()}
                      className="flex-1 md:flex-none w-full rounded-xl font-semibold text-sm min-h-[52px] md:min-h-[44px]"
                      style={{
                        background: '#1a1a1a',
                        border: '1px solid #2a2a2a',
                        color: '#999999',
                      }}
                    >
                      ⬆ Upload
                    </motion.button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={onCameraSelected} />
      <input ref={galleryInputRef} type="file" accept="image/*" className="hidden" onChange={onGallerySelected} />

      {showPaywall && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-6" style={{ background: 'rgba(7,5,14,0.97)' }}>
          <div className="text-center max-w-sm">
            <p className="text-4xl mb-3">⚡</p>
            <h2 className="text-xl font-bold mb-2" style={{ color: '#ffffff' }}>Scan limit reached</h2>
            <p className="text-sm mb-6" style={{ color: '#999999' }}>Upgrade to scan more contacts.</p>
            <button type="button" onClick={() => router.push('/settings')} className="glow-btn w-full py-3 rounded-xl text-white font-semibold mb-2">
              View plans
            </button>
            <button type="button" onClick={() => setShowPaywall(false)} className="text-sm" style={{ color: '#555555' }}>
              Maybe later
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
