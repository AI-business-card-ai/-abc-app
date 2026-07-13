'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { IconX } from '@tabler/icons-react'
import { createClientComponent } from '@/lib/supabase'
import { hapticMedium, hapticSuccess } from '@/lib/hooks/useHaptic'
import ScanBurstQueue, { type BurstQueueItem } from '@/components/mobile/ScanBurstQueue'
import ScanContextSheet, { type ContextSheetContact } from '@/components/mobile/ScanContextSheet'
import type { OutreachChannel } from '@/lib/contact-enrichment-ui'
import type { ABCProfile, ScannedContact } from '@/lib/types'

function PhoneStatusBar() {
  return (
    <div className="hidden md:flex items-center justify-between px-5 pt-9 pb-1 shrink-0 relative z-20">
      <span className="text-[11px] font-semibold text-white/90 tabular-nums">9:41</span>
      <div className="flex items-center gap-2">
        <div className="flex items-end gap-[2px] h-3">
          {[4, 6, 8, 10].map((h, i) => (
            <div key={i} className="w-[3px] rounded-sm bg-white/75" style={{ height: h }} />
          ))}
        </div>
        <span className="text-[9px] font-semibold text-white/70">5G</span>
        <div className="relative w-[22px] h-[11px] rounded-[3px] border border-white/45 p-[1.5px]">
          <div className="h-full w-[72%] rounded-[1px] bg-[#00d4d4]" />
          <div className="absolute -right-[3px] top-1/2 -translate-y-1/2 w-[2px] h-[5px] rounded-sm bg-white/45" />
        </div>
      </div>
    </div>
  )
}

function burstStatusFromContact(contact: ScannedContact): BurstQueueItem['status'] {
  if (contact.enrichment_status === 'ERROR') return 'error'
  if (contact.enrichment_status === 'DONE' || contact.scan_status === 'enriched') return 'enriched'
  if (contact.id) return 'saved'
  return 'ocr'
}

function createClientId() {
  return `scan-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

export default function ScanPage() {
  const router = useRouter()
  const supabase = createClientComponent()
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const galleryInputRef = useRef<HTMLInputElement>(null)
  const profileRef = useRef<Partial<ABCProfile> | null>(null)
  const processingRef = useRef<Set<string>>(new Set())

  const [queue, setQueue] = useState<BurstQueueItem[]>([])
  const [contextSheetQueue, setContextSheetQueue] = useState<ContextSheetContact[]>([])
  const contextSheet = contextSheetQueue[0] ?? null
  const [flash, setFlash] = useState(false)
  const [capturePulse, setCapturePulse] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showPaywall, setShowPaywall] = useState(false)
  const [scanBlocked, setScanBlocked] = useState(false)
  const [hasCapturedOnce, setHasCapturedOnce] = useState(false)
  const [scansToday, setScansToday] = useState(0)
  const [userId, setUserId] = useState<string | null>(null)

  useEffect(() => {
    return () => {
      queue.forEach((item) => URL.revokeObjectURL(item.previewUrl))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    let mounted = true

    async function loadProfile() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user || !mounted) {
        router.push('/login')
        return
      }
      setUserId(user.id)
      const { data: profile } = await supabase.from('abc_profiles').select('*').eq('id', user.id).maybeSingle()
      profileRef.current = (profile as ABCProfile | null) ?? {
        id: user.id,
        communication_style: 'direct',
        outreach_language: 'EN',
      }
      setScansToday((profile as ABCProfile | null)?.scans_used ?? 0)
    }

    void loadProfile()
    return () => {
      mounted = false
    }
  }, [router, supabase])

  const updateQueueItem = useCallback((clientId: string, patch: Partial<BurstQueueItem>) => {
    setQueue((prev) => prev.map((item) => (item.id === clientId ? { ...item, ...patch } : item)))
  }, [])

  const openContextSheet = useCallback((contact: ScannedContact) => {
    const entry: ContextSheetContact = {
      contactId: contact.id,
      name: contact.name || 'Unknown',
      company: contact.company,
      role: contact.role,
    }
    setContextSheetQueue((prev) => {
      if (prev.some((c) => c.contactId === entry.contactId)) return prev
      return [...prev, entry]
    })
  }, [])

  const advanceContextSheetQueue = useCallback(() => {
    setContextSheetQueue((prev) => prev.slice(1))
  }, [])

  const closeContextSheet = useCallback(() => {
    advanceContextSheetQueue()
  }, [advanceContextSheetQueue])

  useEffect(() => {
    if (contextSheetQueue.length > 0) return
    if (typeof window === 'undefined') return
    if (!window.location.search.includes('contextContact=')) return
    router.replace('/scan')
  }, [contextSheetQueue.length, router])

  const saveContext = useCallback(
    async (payload: {
      whereMet: string
      topic: string
      followupNote: string
      preferredChannels: OutreachChannel[]
    }) => {
      if (!contextSheet) return

      const hasData =
        payload.whereMet.trim() ||
        payload.topic.trim() ||
        payload.followupNote.trim()

      if (hasData) {
        const res = await fetch('/api/card/context', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contactId: contextSheet.contactId,
            whereMet: payload.whereMet,
            topic: payload.topic,
            followupNote: payload.followupNote,
            preferredChannels: payload.preferredChannels,
            recalculateScore: true,
          }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Failed to save context')
      }

      advanceContextSheetQueue()
      hapticSuccess()
    },
    [contextSheet, advanceContextSheetQueue]
  )

  const processScanInBackground = useCallback(
    async (clientId: string, file: File) => {
      if (processingRef.current.has(clientId)) return
      processingRef.current.add(clientId)

      updateQueueItem(clientId, { status: 'ocr' })

      try {
        const uid = userId ?? (await supabase.auth.getUser()).data.user?.id
        if (!uid) {
          router.push('/login')
          return
        }

        const profilePayload: Partial<ABCProfile> = profileRef.current ?? {
          id: uid,
          communication_style: 'direct',
          outreach_language: 'EN',
        }

        const formData = new FormData()
        formData.append('image', file)
        formData.append('userId', uid)
        formData.append('userProfile', JSON.stringify(profilePayload))

        const res = await fetch('/api/card/scan', { method: 'POST', body: formData })
        const data = await res.json()

        if (res.status === 403 && data.error === 'SCAN_LIMIT_REACHED') {
          setShowPaywall(true)
          setScanBlocked(true)
          updateQueueItem(clientId, { status: 'error', error: 'Limit reached' })
          return
        }

        if (!res.ok || !data.success) {
          throw new Error(data.error || 'Scan failed')
        }

        const contact = (data.contacts?.[0] as ScannedContact) || null
        if (!contact) throw new Error('No contact returned')

        setScansToday((prev) => prev + 1)
        if (profileRef.current) {
          profileRef.current = {
            ...profileRef.current,
            scans_used: (profileRef.current.scans_used ?? 0) + 1,
          }
        }

        updateQueueItem(clientId, {
          status: burstStatusFromContact(contact),
          contact,
        })

        openContextSheet(contact)
        hapticSuccess()
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Scan failed'
        setError(message)
        updateQueueItem(clientId, { status: 'error', error: message })
      } finally {
        processingRef.current.delete(clientId)
      }
    },
    [router, supabase, updateQueueItem, userId, openContextSheet]
  )

  const enqueueCapture = useCallback(
    (file: File) => {
      if (scanBlocked) {
        setShowPaywall(true)
        return
      }

      hapticMedium()
      setFlash(true)
      setTimeout(() => setFlash(false), 120)

      setCapturePulse(true)
      setTimeout(() => setCapturePulse(false), 320)
      hapticSuccess()

      const previewUrl = URL.createObjectURL(file)
      const clientId = createClientId()

      setQueue((prev) => [
        ...prev,
        {
          id: clientId,
          previewUrl,
          status: 'queued',
          justCaptured: true,
        },
      ])
      setHasCapturedOnce(true)
      setError(null)

      setTimeout(() => {
        updateQueueItem(clientId, { justCaptured: false })
      }, 300)

      void processScanInBackground(clientId, file)
    },
    [processScanInBackground, scanBlocked, updateQueueItem]
  )

  useEffect(() => {
    if (!userId) return

    const channel = supabase
      .channel(`scan-burst-${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'scanned_contacts',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const updated = payload.new as ScannedContact
          setQueue((prev) =>
            prev.map((item) =>
              item.contact?.id === updated.id
                ? {
                    ...item,
                    contact: updated,
                    status: burstStatusFromContact(updated),
                  }
                : item
            )
          )
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [supabase, userId])

  useEffect(() => {
    if (!userId) return

    const params = new URLSearchParams(window.location.search)
    const contextContactId = params.get('contextContact')
    if (!contextContactId) return

    let active = true
    ;(async () => {
      const { data } = await supabase
        .from('scanned_contacts')
        .select('*')
        .eq('id', contextContactId)
        .eq('user_id', userId)
        .maybeSingle()

      if (!active || !data) return
      openContextSheet(data as ScannedContact)
    })()

    return () => {
      active = false
    }
  }, [userId, supabase, openContextSheet])

  function triggerCamera() {
    if (scanBlocked) {
      setShowPaywall(true)
      return
    }
    hapticMedium()
    cameraInputRef.current?.click()
  }

  function onCameraSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    enqueueCapture(file)
  }

  function onGallerySelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    enqueueCapture(file)
  }

  const latestSaved = [...queue].reverse().find((item) => item.contact?.name || item.contact?.company)

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
          style={{ width: 120, height: 30, background: '#0f0f0f', borderRadius: '0 0 20px 20px' }}
        />

        <PhoneStatusBar />

        <div className="flex flex-col flex-1 min-h-0 relative">
          <AnimatePresence>
            {flash && (
              <motion.div
                initial={{ opacity: 0.9 }}
                animate={{ opacity: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.12 }}
                className="absolute inset-0 z-50 pointer-events-none bg-white"
              />
            )}
          </AnimatePresence>

          <AnimatePresence>
            {capturePulse && (
              <motion.div
                initial={{ opacity: 0, scale: 0.6 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 1.2 }}
                transition={{ duration: 0.28 }}
                className="absolute inset-0 z-40 flex items-center justify-center pointer-events-none"
              >
                <div
                  className="w-16 h-16 rounded-full flex items-center justify-center text-3xl font-bold"
                  style={{ background: 'rgba(34,197,94,0.85)', color: '#ffffff', boxShadow: '0 0 40px rgba(34,197,94,0.5)' }}
                >
                  ✓
                </div>
              </motion.div>
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

          {hasCapturedOnce && (
            <div
              className="absolute top-4 left-4 z-20 rounded-full px-3 py-1.5 text-xs font-semibold tabular-nums"
              style={{ background: 'rgba(15,15,15,0.75)', border: '1px solid rgba(0,212,212,0.25)', color: '#00d4d4' }}
            >
              {scansToday} cards today
            </div>
          )}

          <div className="flex-1 relative flex items-center justify-center overflow-hidden min-h-0">
            <div
              className="absolute inset-0"
              style={{ background: 'radial-gradient(ellipse at center, #1a1a1a 0%, #0f0f0f 70%)' }}
            />

            <div className="scan-frame-mobile relative z-10 w-[85%] max-w-[320px] aspect-[1.6/1]">
              <span className="scan-corner scan-corner-tl" />
              <span className="scan-corner scan-corner-tr" />
              <span className="scan-corner scan-corner-bl" />
              <span className="scan-corner scan-corner-br" />
              <p
                className="absolute inset-0 flex items-center justify-center text-sm text-center px-4"
                style={{ color: '#666666' }}
              >
                {scanBlocked ? 'Scan limit — upgrade for more' : 'Point at business card'}
              </p>
            </div>
          </div>

          {latestSaved?.contact && !contextSheet && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="mx-4 mb-1 rounded-2xl px-4 py-3 z-20 relative"
              style={{
                background: 'rgba(26, 26, 26, 0.92)',
                border: '1px solid rgba(0, 212, 212, 0.2)',
              }}
            >
              <p className="text-[10px] mb-0.5" style={{ color: '#22c55e' }}>✓ Latest card</p>
              <p className="font-bold text-base leading-tight truncate" style={{ color: '#ffffff' }}>
                {latestSaved.contact.name || 'Processing…'}
              </p>
              <p className="text-xs truncate" style={{ color: '#00d4d4' }}>
                {[latestSaved.contact.role, latestSaved.contact.company].filter(Boolean).join(' · ') || 'Enriching in background…'}
              </p>
            </motion.div>
          )}

          <ScanBurstQueue items={queue} />

          {error && (
            <p
              className="mx-4 mb-2 text-sm text-red-300 px-3 py-2 rounded-xl z-20 relative"
              style={{ background: 'rgba(239,68,68,0.1)' }}
            >
              {error}
            </p>
          )}

          <div
            className="shrink-0 z-20 px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+72px)] md:pb-4"
            style={{
              background: 'rgba(15, 15, 15, 0.95)',
              backdropFilter: 'blur(16px)',
              borderTop: '1px solid rgba(0, 212, 212, 0.12)',
            }}
          >
            <div className="flex gap-2 md:flex-col">
              <motion.button
                whileTap={{ scale: 0.97 }}
                type="button"
                onClick={triggerCamera}
                className="flex-[2] md:flex-none w-full rounded-xl text-white font-bold text-base min-h-[52px] md:min-h-[48px]"
                style={{
                  background: scanBlocked
                    ? '#2a2a2a'
                    : 'linear-gradient(135deg, #f0197d, #00d4d4)',
                  boxShadow: scanBlocked ? 'none' : '0 4px 24px rgba(240,25,125,0.2)',
                  opacity: scanBlocked ? 0.65 : 1,
                }}
              >
                📷 SCAN CARD
              </motion.button>
              <motion.button
                whileTap={{ scale: 0.97 }}
                type="button"
                onClick={() => {
                  if (scanBlocked) {
                    setShowPaywall(true)
                    return
                  }
                  galleryInputRef.current?.click()
                }}
                className="flex-1 md:flex-none w-full rounded-xl font-semibold text-sm min-h-[52px] md:min-h-[44px]"
                style={{
                  background: '#1a1a1a',
                  border: '1px solid #2a2a2a',
                  color: '#999999',
                  opacity: scanBlocked ? 0.65 : 1,
                }}
              >
                ⬆ Upload
              </motion.button>
            </div>
          </div>
        </div>
      </div>

      <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={onCameraSelected} />
      <input ref={galleryInputRef} type="file" accept="image/*" className="hidden" onChange={onGallerySelected} />

      <ScanContextSheet
        contact={contextSheet}
        waitingCount={Math.max(0, contextSheetQueue.length - 1)}
        onSave={saveContext}
        onSkip={closeContextSheet}
      />

      {showPaywall && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-6" style={{ background: 'rgba(7,5,14,0.97)' }}>
          <div className="text-center max-w-sm">
            <p className="text-4xl mb-3">⚡</p>
            <h2 className="text-xl font-bold mb-2" style={{ color: '#ffffff' }}>Scan limit reached</h2>
            <p className="text-sm mb-6" style={{ color: '#999999' }}>
              Upgrade to scan more contacts. Cards already in queue will keep processing.
            </p>
            <button
              type="button"
              onClick={() => router.push('/pricing')}
              className="glow-btn w-full py-3 rounded-xl text-white font-semibold mb-2"
            >
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
