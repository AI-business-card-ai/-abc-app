'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { IconMicrophone, IconX } from '@tabler/icons-react'
import { createClientComponent } from '@/lib/supabase'
import ScanInstantResult from '@/components/mobile/ScanInstantResult'
import { hapticMedium, hapticSuccess } from '@/lib/hooks/useHaptic'
import type { ABCProfile, ScannedContact } from '@/lib/types'

export default function ScanPage() {
  const router = useRouter()
  const supabase = createClientComponent()
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const galleryInputRef = useRef<HTMLInputElement>(null)
  const chunksRef = useRef<BlobPart[]>([])
  const touchStartY = useRef(0)

  const [selectedImage, setSelectedImage] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [isRecording, setIsRecording] = useState(false)
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null)
  const [isScanning, setIsScanning] = useState(false)
  const [flash, setFlash] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showPaywall, setShowPaywall] = useState(false)
  const [savedContact, setSavedContact] = useState<ScannedContact | null>(null)

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
        (payload) => setSavedContact(payload.new as ScannedContact)
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [savedContact?.id, supabase])

  const resetForNextScan = useCallback(() => {
    if (imagePreview) URL.revokeObjectURL(imagePreview)
    setSelectedImage(null)
    setImagePreview(null)
    setSavedContact(null)
    setError(null)
    setNote('')
  }, [imagePreview])

  function handleFile(file: File | undefined) {
    if (!file) return
    if (imagePreview) URL.revokeObjectURL(imagePreview)
    setSelectedImage(file)
    setImagePreview(URL.createObjectURL(file))
    setSavedContact(null)
    setError(null)
  }

  const runScan = useCallback(async (file: File) => {
    setIsScanning(true)
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
      formData.append('fastScan', 'true')
      if (note) formData.append('note', note)

      const res = await fetch('/api/card/scan', { method: 'POST', body: formData })
      const data = await res.json()

      if (res.status === 403 && data.error === 'SCAN_LIMIT_REACHED') {
        setShowPaywall(true)
        return
      }
      if (!res.ok || !data.success) throw new Error(data.error || 'Scan failed')

      hapticSuccess()
      const contact = (data.contacts?.[0] as ScannedContact) || null
      setSavedContact(contact)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Scan failed')
    } finally {
      setIsScanning(false)
    }
  }, [note, router, supabase])

  function triggerCamera() {
    hapticMedium()
    cameraInputRef.current?.click()
  }

  async function onCameraSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    handleFile(file)
    await runScan(file)
  }

  async function onGallerySelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    handleFile(file)
    await runScan(file)
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

  return (
    <div
      className="fixed inset-0 z-40 flex flex-col lg:relative lg:min-h-screen lg:max-w-[500px] lg:mx-auto"
      style={{ background: '#0a0c14' }}
      onTouchStart={(e) => { touchStartY.current = e.touches[0].clientY }}
      onTouchEnd={(e) => {
        const dy = e.changedTouches[0].clientY - touchStartY.current
        if (dy > 120) router.push('/contacts')
      }}
    >
      <AnimatePresence>
        {flash && (
          <motion.div
            initial={{ opacity: 0.85 }}
            animate={{ opacity: 0 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 pointer-events-none bg-white"
          />
        )}
      </AnimatePresence>

      {/* Status gradient */}
      <div
        className="absolute top-0 left-0 right-0 h-24 pointer-events-none z-10"
        style={{ background: 'linear-gradient(180deg, rgba(10,12,20,0.9), transparent)' }}
      />

      <button
        type="button"
        onClick={() => router.push('/contacts')}
        className="absolute top-4 right-4 z-20 tap-target rounded-full p-2"
        style={{ background: 'rgba(10,12,20,0.6)' }}
        aria-label="Close"
      >
        <IconX size={20} style={{ color: '#8892b0' }} />
      </button>

      {/* Camera viewport */}
      <div className="flex-1 relative flex items-center justify-center overflow-hidden min-h-0">
        {imagePreview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imagePreview} alt="" className="absolute inset-0 w-full h-full object-cover opacity-90" />
        ) : (
          <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse at center, #141628 0%, #0a0c14 70%)' }} />
        )}

        <div className="scan-frame-mobile relative z-10 w-[85%] max-w-[320px] aspect-[1.6/1]">
          <span className="scan-corner scan-corner-tl" />
          <span className="scan-corner scan-corner-tr" />
          <span className="scan-corner scan-corner-bl" />
          <span className="scan-corner scan-corner-br" />
          {!imagePreview && !isScanning && (
            <p className="absolute inset-0 flex items-center justify-center text-sm text-center px-4" style={{ color: '#8892b0' }}>
              Point at business card
            </p>
          )}
          {isScanning && (
            <p className="absolute inset-0 flex items-center justify-center text-sm font-semibold" style={{ color: '#00d4d4' }}>
              Reading card…
            </p>
          )}
        </div>
      </div>

      {savedContact && (
        <ScanInstantResult contact={savedContact} previewUrl={imagePreview} onScanAnother={resetForNextScan} />
      )}

      {error && (
        <p className="mx-4 mb-2 text-sm text-red-300 px-3 py-2 rounded-xl" style={{ background: 'rgba(239,68,68,0.1)' }}>
          {error}
        </p>
      )}

      {/* Bottom panel */}
      <div
        className="shrink-0 z-20 px-4 pt-4 pb-[calc(env(safe-area-inset-bottom)+72px)] lg:pb-4"
        style={{
          background: 'rgba(10, 12, 20, 0.95)',
          backdropFilter: 'blur(16px)',
          borderTop: '1px solid rgba(0, 212, 212, 0.12)',
          minHeight: 180,
        }}
      >
        <div className="flex items-center gap-2 mb-3">
          <span className="text-xs shrink-0" style={{ color: '#8892b0' }}>
            📍 Where did you meet?
          </span>
          <button
            type="button"
            onClick={isRecording ? () => { mediaRecorder?.stop(); setIsRecording(false) } : startRecording}
            disabled={isTranscribing}
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
          placeholder="Trade show, meeting, intro…"
          className="w-full abc-input px-3 py-3 text-base mb-3 min-h-[44px]"
        />

        <div className="flex gap-2">
          <motion.button
            whileTap={{ scale: 0.97 }}
            type="button"
            disabled={isScanning}
            onClick={triggerCamera}
            className="flex-[2] rounded-xl text-white font-bold text-base disabled:opacity-50 min-h-[64px]"
            style={{ background: 'linear-gradient(135deg, #00d4d4, #8b5cf6)', boxShadow: '0 4px 24px rgba(0,212,212,0.25)' }}
          >
            📷 SCAN CARD
          </motion.button>
          <motion.button
            whileTap={{ scale: 0.97 }}
            type="button"
            disabled={isScanning}
            onClick={() => galleryInputRef.current?.click()}
            className="flex-1 rounded-xl font-semibold text-sm min-h-[64px]"
            style={{ border: '1px solid rgba(139,92,246,0.35)', color: '#a78bfa' }}
          >
            ⬆ Upload
          </motion.button>
        </div>
      </div>

      <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={onCameraSelected} />
      <input ref={galleryInputRef} type="file" accept="image/*" className="hidden" onChange={onGallerySelected} />

      {showPaywall && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-6" style={{ background: 'rgba(7,5,14,0.97)' }}>
          <div className="text-center max-w-sm">
            <p className="text-4xl mb-3">⚡</p>
            <h2 className="text-xl font-bold mb-2" style={{ color: '#f0f0ff' }}>Scan limit reached</h2>
            <p className="text-sm mb-6" style={{ color: '#8892b0' }}>Upgrade to scan more contacts.</p>
            <button type="button" onClick={() => router.push('/settings')} className="glow-btn w-full py-3 rounded-xl text-white font-semibold mb-2">
              View plans
            </button>
            <button type="button" onClick={() => setShowPaywall(false)} className="text-sm" style={{ color: '#4a5168' }}>
              Maybe later
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
