'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { IconX, IconCreditCard, IconMicrophone } from '@tabler/icons-react'
import { createClientComponent } from '@/lib/supabase'
import LoadingMatrix from '@/components/ui/LoadingMatrix'
import BottomNav from '@/components/ui/BottomNav'
import type { ABCProfile } from '@/lib/types'

const EVENTS = ['Medica', 'Heim Textile', 'Web Summit', 'Personal']

const chipStyle = (active: boolean): React.CSSProperties =>
  active
    ? { border: '0.5px solid #7C3AED', color: '#A78BFA', background: '#1A0A2E' }
    : { border: '0.5px solid #1A0E30', color: '#3A2060', background: 'transparent' }

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
  const [events, setEvents] = useState<string[]>(EVENTS)
  const [selectedEvent, setSelectedEvent] = useState<string | null>(null)
  const [addingTag, setAddingTag] = useState(false)
  const [newTag, setNewTag] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [toastMsg, setToastMsg] = useState<string | null>(null)

  useEffect(() => {
    return () => {
      if (imagePreview) URL.revokeObjectURL(imagePreview)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function handleFile(file: File | undefined) {
    if (!file) return
    if (imagePreview) URL.revokeObjectURL(imagePreview)
    setSelectedImage(file)
    setImagePreview(URL.createObjectURL(file))
    setError(null)
  }

  function handleImageSelect(e: React.ChangeEvent<HTMLInputElement>) {
    handleFile(e.target.files?.[0])
    e.target.value = ''
  }

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' })
      chunksRef.current = []

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }

      recorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
        stream.getTracks().forEach((t) => t.stop())

        setIsTranscribing(true)
        try {
          const formData = new FormData()
          formData.append('audio', blob, 'recording.webm')

          const res = await fetch('/api/card/transcribe', {
            method: 'POST',
            body: formData,
          })
          const data = await res.json()

          if (data.text) {
            setNote((prev) => (prev ? prev + ' ' + data.text : data.text))
          }
        } catch (err) {
          console.error('Transcription error:', err)
        } finally {
          setIsTranscribing(false)
        }
      }

      recorder.start()
      setMediaRecorder(recorder)
      setIsRecording(true)
    } catch {
      alert('Microphone access denied. Please allow microphone access.')
    }
  }

  const stopRecording = () => {
    mediaRecorder?.stop()
    setIsRecording(false)
  }

  function addCustomTag() {
    const tag = newTag.trim()
    if (tag && !events.includes(tag)) {
      setEvents((prev) => [...prev, tag])
      setSelectedEvent(tag)
    }
    setNewTag('')
    setAddingTag(false)
  }

  async function handleAnalyze() {
    if (!selectedImage) return
    setError(null)
    setIsLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/login')
        return
      }

      const { data: profile } = await supabase
        .from('abc_profiles')
        .select('*')
        .eq('id', user.id)
        .maybeSingle()

      const profilePayload: Partial<ABCProfile> = profile ?? {
        id: user.id,
        full_name: null,
        company: null,
        role: null,
        goals: null,
        communication_style: 'direct',
        outreach_language: 'EN',
      }

      const formData = new FormData()
      formData.append('image', selectedImage)
      formData.append('userId', user.id)
      formData.append('userProfile', JSON.stringify(profilePayload))
      if (note) formData.append('note', note)
      if (selectedEvent) formData.append('eventName', selectedEvent)

      const res = await fetch('/api/card/scan', { method: 'POST', body: formData })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error || 'Analysis failed.')

      if (data.count > 1) {
        setIsLoading(false)
        setToastMsg(`Found ${data.count} business cards!`)
        setTimeout(() => router.push('/contacts'), 1400)
        return
      }

      if (data.count === 1) {
        router.push('/contact/' + data.contacts[0].id)
        return
      }

      throw new Error('No business card detected. Try again with better lighting.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen pb-32" style={{ background: '#07050E' }}>
      <LoadingMatrix isVisible={isLoading} />

      {/* 1. TOP BAR */}
      <div
        className="flex items-center justify-between px-4 py-4"
        style={{ background: '#06040C', borderBottom: '0.5px solid #1A0E30' }}
      >
        <span className="gradient-text text-xl font-black tracking-widest">ABC</span>
        <button onClick={() => router.push('/contacts')} aria-label="Close">
          <IconX size={20} style={{ color: '#2A1A4A' }} />
        </button>
      </div>

      {/* 2. CAMERA CARD */}
      <div
        className="mx-4 mt-4 rounded-xl p-5 relative overflow-hidden"
        style={{ background: '#06040C', border: '0.5px solid #1A0E30' }}
      >
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ background: 'radial-gradient(ellipse, #7C3AED1A, transparent)' }}
        />

        {/* Scan frame 240x152 */}
        <div
          className="relative mx-auto flex items-center justify-center"
          style={{ width: 240, height: 152 }}
        >
          {imagePreview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={imagePreview}
              alt="Business card preview"
              className="absolute inset-0 w-full h-full object-cover rounded-lg z-10"
            />
          ) : (
            <IconCreditCard size={44} className="relative z-10" style={{ color: '#2A1A4A' }} />
          )}
          {/* Corner brackets — animated pulse */}
          <span className="absolute left-0 top-0 w-5 h-5 z-20 animate-pulse" style={{ borderLeft: '2px solid #A78BFA', borderTop: '2px solid #A78BFA', filter: 'drop-shadow(0 0 6px rgba(167,139,250,0.8))' }} />
          <span className="absolute right-0 top-0 w-5 h-5 z-20 animate-pulse" style={{ borderRight: '2px solid #A78BFA', borderTop: '2px solid #A78BFA', filter: 'drop-shadow(0 0 6px rgba(167,139,250,0.8))' }} />
          <span className="absolute left-0 bottom-0 w-5 h-5 z-20 animate-pulse" style={{ borderLeft: '2px solid #A78BFA', borderBottom: '2px solid #A78BFA', filter: 'drop-shadow(0 0 6px rgba(167,139,250,0.8))' }} />
          <span className="absolute right-0 bottom-0 w-5 h-5 z-20 animate-pulse" style={{ borderRight: '2px solid #A78BFA', borderBottom: '2px solid #A78BFA', filter: 'drop-shadow(0 0 6px rgba(167,139,250,0.8))' }} />
        </div>

        <p className="text-center text-xs mt-3 relative" style={{ color: '#2A1A4A' }}>
          Point at business card
        </p>
        <p className="text-center text-xs mt-1.5 relative leading-snug px-2" style={{ color: '#3A2060' }}>
          💡 Tip: Place multiple business cards side by side and scan them all at once!
        </p>

        <motion.button
          whileTap={{ scale: 0.98 }}
          onClick={() => cameraInputRef.current?.click()}
          className="glow-btn relative w-full rounded-xl text-white font-bold py-3 mt-4"
        >
          📷 Take Photo
        </motion.button>

        <div className="flex items-center gap-3 my-3 text-xs relative" style={{ color: '#3A2060' }}>
          <span className="h-px flex-1" style={{ background: '#1A0E30' }} />
          or
          <span className="h-px flex-1" style={{ background: '#1A0E30' }} />
        </div>

        <motion.button
          whileTap={{ scale: 0.98 }}
          onClick={() => galleryInputRef.current?.click()}
          className="relative w-full rounded-xl font-medium py-3"
          style={{ background: 'transparent', border: '0.5px solid #1A0E30', color: '#F0EAFF' }}
        >
          ↑ Upload from Gallery
        </motion.button>

        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={handleImageSelect}
        />
        <input
          ref={galleryInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleImageSelect}
        />
      </div>

      {/* 3. NOTE */}
      <div className="mx-4 mt-4 flex flex-col gap-2">
        <span className="tracking-widest uppercase" style={{ fontSize: '9px', color: '#3A2060' }}>NOTE</span>
        <div className="flex items-center gap-2">
          <button
            onClick={isRecording ? stopRecording : startRecording}
            disabled={isTranscribing}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg shrink-0 disabled:opacity-60"
            style={{ background: '#1A0A2E', border: '0.5px solid #7C3AED44', color: '#A78BFA' }}
          >
            {isTranscribing ? (
              <>
                <span className="w-3.5 h-3.5 rounded-full border-2 border-transparent animate-spin" style={{ borderTopColor: '#A78BFA', borderRightColor: '#A78BFA' }} />
                <span className="text-xs">Transcribing...</span>
              </>
            ) : isRecording ? (
              <>
                <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                <span className="text-xs">Recording...</span>
              </>
            ) : (
              <>
                <IconMicrophone size={16} />
                <span className="text-xs">Voice</span>
              </>
            )}
          </button>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Where did we meet..."
            className="flex-1 rounded-lg px-3 py-2 text-base outline-none"
            style={{ background: '#0D0A18', border: '0.5px solid #1A0E30', color: '#F0EAFF' }}
          />
        </div>
      </div>

      {/* 4. EVENT */}
      <div className="mx-4 mt-3 flex flex-col gap-2">
        <span className="tracking-widest uppercase" style={{ fontSize: '9px', color: '#3A2060' }}>EVENT</span>
        <div className="flex flex-wrap gap-2">
          {events.map((ev) => (
            <button
              key={ev}
              onClick={() => setSelectedEvent(selectedEvent === ev ? null : ev)}
              className="px-3 py-1.5 rounded-full text-xs"
              style={chipStyle(selectedEvent === ev)}
            >
              {ev}
            </button>
          ))}
          {addingTag ? (
            <input
              autoFocus
              value={newTag}
              onChange={(e) => setNewTag(e.target.value)}
              onBlur={addCustomTag}
              onKeyDown={(e) => e.key === 'Enter' && addCustomTag()}
              placeholder="Name..."
              className="w-24 px-3 py-1.5 rounded-full text-xs outline-none"
              style={{ background: '#0D0A18', border: '0.5px solid #7C3AED', color: '#F0EAFF' }}
            />
          ) : (
            <button
              onClick={() => setAddingTag(true)}
              className="px-3 py-1.5 rounded-full text-xs"
              style={chipStyle(false)}
            >
              + New
            </button>
          )}
        </div>
      </div>

      {error && (
        <p className="mx-4 mt-4 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-2.5 text-sm text-red-300">
          {error}
        </p>
      )}

      {/* 5. ANALYZE BUTTON — fixed above bottom nav */}
      <div
        className="fixed bottom-[calc(env(safe-area-inset-bottom)+64px)] left-1/2 -translate-x-1/2 w-full max-w-[430px] p-4 z-20"
        style={{ background: '#07050E', borderTop: '0.5px solid #1A0E30' }}
      >
        <motion.button
          whileTap={{ scale: 0.97 }}
          disabled={!selectedImage || isLoading}
          onClick={handleAnalyze}
          className={`glow-btn w-full rounded-xl text-white font-semibold py-3.5 ${
            !selectedImage || isLoading ? 'opacity-40 cursor-not-allowed' : ''
          }`}
        >
          ✦ Analyze with AI
        </motion.button>
      </div>

      <AnimatePresence>
        {toastMsg && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-32 left-1/2 -translate-x-1/2 z-50 rounded-full px-5 py-2.5 text-sm font-medium text-white"
            style={{ background: '#16A34A', boxShadow: '0 4px 16px rgba(22,163,74,0.4)' }}
          >
            {toastMsg}
          </motion.div>
        )}
      </AnimatePresence>

      <BottomNav />
    </div>
  )
}
