'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { IconX, IconCreditCard, IconMicrophone } from '@tabler/icons-react'
import { createClientComponent } from '@/lib/supabase'
import LoadingMatrix from '@/components/ui/LoadingMatrix'
import type { ABCProfile } from '@/lib/types'

const EVENTS = ['Medica', 'Heim Textile', 'Web Summit', 'Personal']

const chipStyle = (active: boolean): React.CSSProperties =>
  active
    ? { border: '1px solid rgba(0, 212, 212, 0.5)', color: '#00d4d4', background: 'rgba(0, 212, 212, 0.08)' }
    : { border: '1px solid rgba(139, 92, 246, 0.15)', color: '#4a5168', background: 'transparent' }

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
  const [showPaywall, setShowPaywall] = useState(false)
  const [scansRemaining, setScansRemaining] = useState<number | null>(null)

  useEffect(() => {
    return () => {
      if (imagePreview) URL.revokeObjectURL(imagePreview)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const fetchProfile = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data } = await supabase
        .from('abc_profiles')
        .select('plan, scans_used')
        .eq('id', user.id)
        .single()
      if (data) {
        const limits: Record<string, number> = { free: 3, basic: 20, pro: 100, team: 500 }
        const limit = limits[(data as { plan: string }).plan] || 3
        setScansRemaining(limit - ((data as { scans_used: number }).scans_used || 0))
      }
    }
    fetchProfile()
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

      if (res.status === 403 && data.error === 'SCAN_LIMIT_REACHED') {
        setIsLoading(false)
        setShowPaywall(true)
        return
      }

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

  const upgradeMailto = (plan: string) =>
    `mailto:hello@aibusinesscard.ai?subject=${encodeURIComponent(
      `Upgrade ABC to ${plan}`
    )}&body=${encodeURIComponent(`Hi, I would like to upgrade my ABC account to ${plan} plan.`)}`

  return (
    <div className="min-h-screen pb-8 page-shell page-shell--scan w-full max-w-[480px] mx-auto">
      <LoadingMatrix isVisible={isLoading} />

      {/* 1. TOP BAR */}
      <div
        className="flex items-center justify-between px-4 py-4 -mx-4 lg:-mx-6"
        style={{ background: '#141628', borderBottom: '1px solid rgba(139, 92, 246, 0.12)' }}
      >
        <span className="gradient-text text-xl font-black tracking-widest">ABC</span>
        <button onClick={() => router.push('/contacts')} aria-label="Close">
          <IconX size={20} style={{ color: '#8892b0' }} />
        </button>
      </div>

      {scansRemaining !== null && (
        <p
          style={{
            fontSize: '12px',
            color: '#00d4d4',
            textAlign: 'center',
            marginTop: '12px',
            fontWeight: 600,
          }}
        >
          {scansRemaining} scans remaining
        </p>
      )}

      {/* 2. CAMERA CARD */}
      <div
        className="mt-4 rounded-2xl p-5 relative overflow-hidden abc-card"
      >
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ background: 'radial-gradient(ellipse, rgba(0,212,212,0.08), transparent)' }}
        />

        {/* Scan frame */}
        <div
          className="scan-frame relative mx-auto flex items-center justify-center"
          style={{ width: '100%', maxWidth: 280, height: 176 }}
        >
          {imagePreview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={imagePreview}
              alt="Business card preview"
              className="absolute inset-0 w-full h-full object-cover rounded-[14px] z-10"
            />
          ) : (
            <IconCreditCard size={44} className="relative z-10" style={{ color: '#4a5168' }} />
          )}
          <span className="scan-corner scan-corner-tl z-20 animate-pulse" />
          <span className="scan-corner scan-corner-tr z-20 animate-pulse" />
          <span className="scan-corner scan-corner-bl z-20 animate-pulse" />
          <span className="scan-corner scan-corner-br z-20 animate-pulse" />
        </div>

        <p className="text-center text-xs mt-3 relative" style={{ color: '#8892b0' }}>
          Point at business card
        </p>
        <p className="text-center text-xs mt-1.5 relative leading-snug px-2" style={{ color: '#4a5168' }}>
          💡 Tip: Place multiple business cards side by side and scan them all at once!
        </p>

        <motion.button
          whileTap={{ scale: 0.98 }}
          onClick={() => cameraInputRef.current?.click()}
          className="btn-scan relative w-full rounded-xl text-white font-bold mt-4"
          style={{ height: 52 }}
        >
          📷 Take Photo
        </motion.button>

        <div className="flex items-center gap-3 my-3 text-xs relative" style={{ color: '#4a5168' }}>
          <span className="h-px flex-1" style={{ background: 'rgba(139, 92, 246, 0.15)' }} />
          or
          <span className="h-px flex-1" style={{ background: 'rgba(139, 92, 246, 0.15)' }} />
        </div>

        <motion.button
          whileTap={{ scale: 0.98 }}
          onClick={() => galleryInputRef.current?.click()}
          className="btn-outline-cyan relative w-full rounded-xl font-medium"
          style={{ height: 52 }}
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
      <div className="mt-4 flex flex-col gap-2">
        <span className="tracking-widest uppercase abc-label">NOTE</span>
        <div className="flex items-center gap-2">
          <button
            onClick={isRecording ? stopRecording : startRecording}
            disabled={isTranscribing}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg shrink-0 disabled:opacity-60"
            style={{ background: 'rgba(240, 25, 125, 0.12)', border: '1px solid rgba(240, 25, 125, 0.4)', color: '#f0197d' }}
          >
            {isTranscribing ? (
              <>
                <span className="w-3.5 h-3.5 rounded-full border-2 border-transparent animate-spin" style={{ borderTopColor: '#f0197d', borderRightColor: '#f0197d' }} />
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
            className="flex-1 rounded-lg px-3 py-2 text-base outline-none abc-input"
          />
        </div>
      </div>

      {/* 4. EVENT */}
      <div className="mt-3 flex flex-col gap-2">
        <span className="tracking-widest uppercase abc-label">EVENT</span>
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
              className="w-24 px-3 py-1.5 rounded-full text-xs outline-none abc-input"
              style={{ borderColor: 'rgba(0, 212, 212, 0.5)' }}
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
        <p className="mt-4 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-2.5 text-sm text-red-300">
          {error}
        </p>
      )}

      {/* 5. ANALYZE BUTTON — fixed above bottom nav */}
      <div
        className="fixed bottom-[calc(env(safe-area-inset-bottom)+64px)] left-1/2 -translate-x-1/2 w-full max-w-[480px] p-4 z-20 lg:hidden"
        style={{ background: '#0d0f1a', borderTop: '1px solid rgba(0, 212, 212, 0.1)' }}
      >
        <motion.button
          whileTap={{ scale: 0.97 }}
          disabled={!selectedImage || isLoading}
          onClick={handleAnalyze}
          className={`btn-analyze w-full rounded-xl text-white font-semibold ${
            !selectedImage || isLoading ? 'opacity-40 cursor-not-allowed' : ''
          }`}
          style={{ height: 52 }}
        >
          ✦ Analyze with AI
        </motion.button>
      </div>

      <div className="hidden lg:block mt-6 pb-4">
        <motion.button
          whileTap={{ scale: 0.97 }}
          disabled={!selectedImage || isLoading}
          onClick={handleAnalyze}
          className={`btn-analyze w-full rounded-xl text-white font-semibold ${
            !selectedImage || isLoading ? 'opacity-40 cursor-not-allowed' : ''
          }`}
          style={{ height: 52 }}
        >
          ✦ Analyze with AI
        </motion.button>
      </div>

      {showPaywall && (
        <div
          style={{
            position: 'fixed', inset: 0,
            background: 'rgba(7,5,14,0.97)',
            zIndex: 50, display: 'flex',
            flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            padding: '24px',
            overflowY: 'auto',
          }}
        >
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>⚡</div>
          <h2 style={{ color: '#F0EAFF', fontSize: '22px', fontWeight: 700, marginBottom: '8px', textAlign: 'center' }}>
            You&apos;ve used all your scans
          </h2>
          <p style={{ color: '#6B7280', fontSize: '14px', marginBottom: '32px', textAlign: 'center' }}>
            Upgrade to scan more contacts
          </p>

          <div style={{ width: '100%', maxWidth: '340px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {/* BASIC */}
            <div style={{ background: '#0D0A18', border: '1px solid #1A0E30', borderRadius: '16px', padding: '16px' }}>
              <p style={{ color: '#F0EAFF', fontSize: '16px', fontWeight: 700 }}>Basic</p>
              <p style={{ color: '#8B7AA8', fontSize: '13px', marginBottom: '12px' }}>€8/month · 20 scans/month</p>
              <a
                href={upgradeMailto('Basic')}
                style={{ display: 'block', textAlign: 'center', padding: '10px', borderRadius: '10px', border: '1px solid #1A0E30', color: '#A78BFA', fontSize: '14px', fontWeight: 600, textDecoration: 'none' }}
              >
                Upgrade to Basic
              </a>
            </div>

            {/* PRO */}
            <div style={{ background: 'linear-gradient(135deg, #1A0A2E, #0A1A2E)', border: '1px solid #7C3AED', borderRadius: '16px', padding: '16px', position: 'relative' }}>
              <span style={{ position: 'absolute', top: '-10px', left: '16px', background: '#7C3AED', color: 'white', fontSize: '10px', fontWeight: 700, padding: '3px 8px', borderRadius: '8px' }}>
                ⭐ Most Popular
              </span>
              <p style={{ color: '#F0EAFF', fontSize: '16px', fontWeight: 700 }}>Pro</p>
              <p style={{ color: '#C4B5FD', fontSize: '13px', marginBottom: '12px' }}>€26/month · 100 scans/month</p>
              <a
                href={upgradeMailto('Pro')}
                style={{ display: 'block', textAlign: 'center', padding: '10px', borderRadius: '10px', background: 'linear-gradient(135deg, #7C3AED, #0EA5E9)', color: 'white', fontSize: '14px', fontWeight: 600, textDecoration: 'none' }}
              >
                Upgrade to Pro
              </a>
            </div>

            {/* TEAM */}
            <div style={{ background: '#0D0A18', border: '1px solid #1A0E30', borderRadius: '16px', padding: '16px' }}>
              <p style={{ color: '#F0EAFF', fontSize: '16px', fontWeight: 700 }}>Team</p>
              <p style={{ color: '#8B7AA8', fontSize: '13px', marginBottom: '12px' }}>€49/month · 500 scans · 5 users</p>
              <a
                href={upgradeMailto('Team')}
                style={{ display: 'block', textAlign: 'center', padding: '10px', borderRadius: '10px', border: '1px solid #1A0E30', color: '#A78BFA', fontSize: '14px', fontWeight: 600, textDecoration: 'none' }}
              >
                Upgrade to Team
              </a>
            </div>
          </div>

          <button
            onClick={() => setShowPaywall(false)}
            style={{ marginTop: '16px', color: '#3A2060', background: 'none', border: 'none', cursor: 'pointer', fontSize: '13px' }}
          >
            Maybe later
          </button>
        </div>
      )}

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
    </div>
  )
}
