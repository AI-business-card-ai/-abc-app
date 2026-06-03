'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import {
  IconX,
  IconCreditCard,
  IconMicrophone,
  IconPlayerStopFilled,
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
    <div className="min-h-screen bg-[#07050E] pb-28">
      <LoadingMatrix isVisible={isLoading} />

      {/* TOP BAR */}
      <div className="flex items-center justify-between px-4 pt-6 pb-4">
        <span className="gradient-text text-2xl font-black">ABC</span>
        <button
          onClick={() => router.push('/contacts')}
          className="w-9 h-9 rounded-full border border-[#1A0E30] flex items-center justify-center text-[#6B7280]"
        >
          <IconX size={18} />
        </button>
      </div>

      {/* CAMERA CARD */}
      <div className="abc-card mx-4 p-5">
        <div
          className="relative mx-auto flex items-center justify-center"
          style={{ width: 240, height: 152 }}
        >
          <div
            className="absolute inset-0"
            style={{
              background:
                'radial-gradient(ellipse, rgba(124,58,237,0.1), transparent)',
            }}
          />
          {imagePreview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={imagePreview}
              alt="Náhled vizitky"
              className="relative z-10 w-full h-full object-cover rounded-lg"
            />
          ) : (
            <IconCreditCard size={44} className="relative z-10 text-[#2A1A4A]" />
          )}
          {/* corner brackets */}
          <span className="absolute left-0 top-0 w-5 h-5 border-l-2 border-t-2 border-[#7C3AED]" />
          <span className="absolute right-0 top-0 w-5 h-5 border-r-2 border-t-2 border-[#7C3AED]" />
          <span className="absolute left-0 bottom-0 w-5 h-5 border-l-2 border-b-2 border-[#7C3AED]" />
          <span className="absolute right-0 bottom-0 w-5 h-5 border-r-2 border-b-2 border-[#7C3AED]" />
        </div>

        <button
          onClick={() => cameraInputRef.current?.click()}
          className="glow-btn w-full rounded-xl text-white font-semibold py-3 mt-5"
        >
          📷 Vyfotit vizitku
        </button>

        <div className="flex items-center gap-3 my-3 text-xs text-[#6B7280]">
          <span className="h-px flex-1 bg-[#1A0E30]" />
          nebo
          <span className="h-px flex-1 bg-[#1A0E30]" />
        </div>

        <button
          onClick={() => galleryInputRef.current?.click()}
          className="w-full rounded-xl border border-[#1A0E30] text-[#F0EAFF] font-medium py-3"
        >
          ↑ Nahrát z galerie
        </button>

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

      {/* POZNÁMKA */}
      <div className="mx-4 mt-5 flex flex-col gap-2">
        <span className="text-[10px] text-[#3A2060] tracking-widest">POZNÁMKA</span>
        <div className="flex items-center gap-2">
          <button
            onClick={isRecording ? stopRecording : startRecording}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg"
            style={{ background: '#1A0A2E', border: '1px solid #7C3AED44', color: '#A78BFA' }}
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
            className="flex-1 bg-[#0D0A18] border-[0.5px] border-[#1A0E30] focus:border-[#7C3AED] text-[#F0EAFF] rounded-lg px-3 py-2 text-sm outline-none placeholder:text-[#6B7280]"
          />
        </div>
      </div>

      {/* UDÁLOST */}
      <div className="mx-4 mt-5 flex flex-col gap-2">
        <span className="text-[10px] text-[#3A2060] tracking-widest">UDÁLOST</span>
        <div className="flex flex-wrap gap-2">
          {events.map((ev) => {
            const active = selectedEvent === ev
            return (
              <button
                key={ev}
                onClick={() => setSelectedEvent(active ? null : ev)}
                className="px-3 py-1.5 rounded-full text-xs border transition-colors"
                style={
                  active
                    ? { borderColor: '#7C3AED', color: '#A78BFA', background: '#1A0A2E' }
                    : { borderColor: '#1A0E30', color: '#6B7280' }
                }
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
              className="w-24 px-3 py-1.5 rounded-full text-xs bg-[#0D0A18] border border-[#7C3AED] text-[#F0EAFF] outline-none"
            />
          ) : (
            <button
              onClick={() => setAddingTag(true)}
              className="px-3 py-1.5 rounded-full text-xs border border-[#1A0E30] text-[#6B7280]"
            >
              + Nová
            </button>
          )}
        </div>
      </div>

      {error && (
        <p className="mx-4 mt-4 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-2 text-sm text-red-300">
          {error}
        </p>
      )}

      {/* ANALYZE BUTTON */}
      <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] p-4 pb-[calc(env(safe-area-inset-bottom)+16px)] bg-gradient-to-t from-[#07050E] to-transparent">
        <motion.button
          whileTap={{ scale: 0.97 }}
          disabled={!selectedImage || isLoading}
          onClick={handleAnalyze}
          className={`glow-btn w-full rounded-xl text-white font-semibold py-3.5 ${
            !selectedImage || isLoading ? 'opacity-40' : ''
          }`}
        >
          ✦ Analyzovat AI
        </motion.button>
      </div>
    </div>
  )
}
