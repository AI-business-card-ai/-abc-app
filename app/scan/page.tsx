'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import {
  IconX,
  IconCreditCard,
  IconMicrophone,
} from '@tabler/icons-react'
import { createClient } from '@/lib/supabase-client'
import LoadingMatrix from '@/components/ui/LoadingMatrix'
import type { ABCProfile } from '@/lib/types'

const EVENTS = ['Medica', 'Heim Textile', 'Web Summit', 'Osobní']

export default function ScanPage() {
  const router = useRouter()
  const supabase = createClient()

  const cameraInputRef = useRef<HTMLInputElement>(null)
  const galleryInputRef = useRef<HTMLInputElement>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const [selectedImage, setSelectedImage] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [isRecording, setIsRecording] = useState(false)
  const [recordingTime, setRecordingTime] = useState(0)
  const [events, setEvents] = useState<string[]>(EVENTS)
  const [selectedEvent, setSelectedEvent] = useState<string | null>(null)
  const [addingTag, setAddingTag] = useState(false)
  const [newTag, setNewTag] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
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

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream)
      recorder.start()
      recorder.onstop = () => stream.getTracks().forEach((t) => t.stop())
      mediaRecorderRef.current = recorder
      setIsRecording(true)
      setRecordingTime(0)
      timerRef.current = setInterval(() => setRecordingTime((t) => t + 1), 1000)
    } catch {
      setError('Nepodařilo se získat přístup k mikrofonu.')
    }
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop()
    setIsRecording(false)
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
  }

  function formatTime(s: number) {
    const m = Math.floor(s / 60).toString().padStart(2, '0')
    const sec = (s % 60).toString().padStart(2, '0')
    return `${m}:${sec}`
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
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.error || 'Analýza selhala.')

      router.push('/contact/' + json.contact.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Něco se pokazilo.')
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-bg pb-28">
      <LoadingMatrix isVisible={isLoading} />

      {/* HERO HEADER */}
      <div className="hero-radial px-4 pt-6 pb-2">
        <div className="relative flex items-center justify-between">
          <div>
            <span className="gradient-text text-3xl font-black tracking-tight">ABC</span>
            <p className="text-xs text-text-secondary mt-0.5">Scan. Know. Connect.</p>
          </div>
          <button
            onClick={() => router.push('/contacts')}
            className="icon-btn"
            aria-label="Zavřít"
          >
            <IconX size={18} />
          </button>
        </div>
      </div>

      {/* SCAN CARD */}
      <div className="abc-card mx-4 p-5 mt-2">
        <p className="abc-label mb-4">Naskenuj vizitku</p>

        <div
          className="scan-frame mx-auto flex items-center justify-center"
          style={{ width: '100%', maxWidth: 280, height: 168 }}
        >
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background: 'radial-gradient(ellipse at center, rgba(124,58,237,0.15), transparent 70%)',
            }}
          />
          {imagePreview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={imagePreview}
              alt="Náhled vizitky"
              className="relative z-10 w-[calc(100%-24px)] h-[calc(100%-24px)] object-cover rounded-lg"
            />
          ) : (
            <div className="relative z-10 flex flex-col items-center gap-2">
              <IconCreditCard size={48} className="text-muted" stroke={1.2} />
              <span className="text-xs text-muted">Umísti vizitku do rámečku</span>
            </div>
          )}
          <span className="scan-corner scan-corner-tl" />
          <span className="scan-corner scan-corner-tr" />
          <span className="scan-corner scan-corner-bl" />
          <span className="scan-corner scan-corner-br" />
        </div>

        <motion.button
          whileTap={{ scale: 0.98 }}
          onClick={() => cameraInputRef.current?.click()}
          className="glow-btn w-full rounded-xl text-white font-semibold py-3.5 mt-5"
        >
          📷 Vyfotit vizitku
        </motion.button>

        <div className="flex items-center gap-3 my-3 text-xs text-muted">
          <span className="h-px flex-1 bg-abc-border" />
          nebo
          <span className="h-px flex-1 bg-abc-border" />
        </div>

        <motion.button
          whileTap={{ scale: 0.98 }}
          onClick={() => galleryInputRef.current?.click()}
          className="ghost-btn w-full font-medium py-3"
        >
          ↑ Nahrát z galerie
        </motion.button>

        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          hidden
          onChange={(e) => handleFile(e.target.files?.[0])}
        />
        <input
          ref={galleryInputRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => handleFile(e.target.files?.[0])}
        />
      </div>

      {/* NOTE */}
      <div className="mx-4 mt-5 flex flex-col gap-2">
        <span className="abc-label">Poznámka</span>
        <div className="flex items-center gap-2">
          <button
            onClick={isRecording ? stopRecording : startRecording}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg shrink-0"
            style={{
              background: 'rgba(26, 10, 46, 0.8)',
              border: '0.5px solid rgba(124, 58, 237, 0.35)',
              color: '#A78BFA',
              boxShadow: isRecording ? '0 0 12px rgba(239,68,68,0.3)' : undefined,
            }}
          >
            {isRecording ? (
              <>
                <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                <span className="text-xs tabular-nums">{formatTime(recordingTime)}</span>
              </>
            ) : (
              <>
                <IconMicrophone size={16} />
                <span className="text-xs">Hlas</span>
              </>
            )}
          </button>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Kde jsme se potkali..."
            className="abc-input flex-1 px-3 py-2 text-sm"
          />
        </div>
      </div>

      {/* EVENT */}
      <div className="mx-4 mt-5 flex flex-col gap-2">
        <span className="abc-label">Událost</span>
        <div className="flex flex-wrap gap-2">
          {events.map((ev) => {
            const active = selectedEvent === ev
            return (
              <button
                key={ev}
                onClick={() => setSelectedEvent(active ? null : ev)}
                className={`abc-chip ${active ? 'abc-chip-active' : ''}`}
              >
                {ev}
              </button>
            )
          })}
          {addingTag ? (
            <input
              autoFocus
              value={newTag}
              onChange={(e) => setNewTag(e.target.value)}
              onBlur={addCustomTag}
              onKeyDown={(e) => e.key === 'Enter' && addCustomTag()}
              placeholder="Název..."
              className="abc-input w-24 px-3 py-1.5 text-xs"
            />
          ) : (
            <button onClick={() => setAddingTag(true)} className="abc-chip">
              + Nová
            </button>
          )}
        </div>
      </div>

      {error && (
        <p className="mx-4 mt-4 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-2.5 text-sm text-red-300">
          {error}
        </p>
      )}

      {/* STICKY CTA */}
      <div
        className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] p-4 pb-[calc(env(safe-area-inset-bottom)+16px)]"
        style={{ background: 'linear-gradient(to top, #07050E 70%, transparent)' }}
      >
        <motion.button
          whileTap={{ scale: 0.97 }}
          disabled={!selectedImage || isLoading}
          onClick={handleAnalyze}
          className={`glow-btn w-full rounded-xl text-white font-semibold py-3.5 ${
            !selectedImage || isLoading ? 'opacity-40 cursor-not-allowed' : ''
          }`}
        >
          ✦ Analyzovat AI
        </motion.button>
      </div>
    </div>
  )
}
