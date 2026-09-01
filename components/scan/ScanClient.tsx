'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { IconCheck, IconScan } from '@tabler/icons-react'
import CameraStage from '@/components/scan/CameraStage'
import DuplicateResolution from '@/components/scan/DuplicateResolution'
import QrSheet from '@/components/scan/QrSheet'
import ScanReview, {
  type MeetingContextValue,
  type ReviewFields,
} from '@/components/scan/ScanReview'
import Button from '@/components/ui/abc/Button'
import { createClientComponent } from '@/lib/supabase'
import { compressImageForScan } from '@/lib/image-compress'
import { hapticMedium, hapticSuccess } from '@/lib/hooks/useHaptic'
import { formatScanErrorForUser } from '@/lib/scan-card-validation'
import { candidateToFields, emptyCandidate, toCandidate, type CandidateInput } from '@/lib/scan/candidate'
import { hintForMode, kindForMode, qrEnabledForMode, sourceForMode, type CaptureMode } from '@/lib/scan/modes'
import type { CaptureOrigin, CaptureProvenance } from '@/lib/scan/provenance'
import { parseQrPayload, type QrResult } from '@/lib/scan/qr-parse'
import { useCamera } from '@/lib/scan/useCamera'
import { useQrScanner } from '@/lib/scan/useQrScanner'
import type { DuplicateMatch } from '@/lib/contacts/duplicate-match'
import type { ScannedContact } from '@/lib/types'

type Stage = 'capture' | 'processing' | 'review' | 'duplicate' | 'saved'

const PROCESSING_STEPS = ['Reading contact…', 'Extracting details…', 'Preparing connection…']

function emptyContext(): MeetingContextValue {
  return { whereMet: '', discussed: '', nextAction: '', followUpAt: null }
}

export default function ScanClient() {
  const router = useRouter()
  const supabase = useRef(createClientComponent()).current

  const [stage, setStage] = useState<Stage>('capture')
  const [mode, setMode] = useState<CaptureMode>('auto')
  const [qrResult, setQrResult] = useState<Exclude<QrResult, { kind: 'contact' }> | null>(null)
  const [processingStep, setProcessingStep] = useState(0)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [fields, setFields] = useState<ReviewFields>(emptyCandidate)
  const [context, setContext] = useState<MeetingContextValue>(emptyContext)
  /** How the candidate on screen was captured — recorded on the saved contact. */
  const [captureSource, setCaptureSource] = useState<string>('auto')
  /** Where it came from and what it was, kept beside the candidate rather than in it. */
  const [provenance, setProvenance] = useState<CaptureProvenance | null>(null)
  /** Someone the owner already has, waiting on their decision. Nothing written. */
  const [duplicate, setDuplicate] = useState<DuplicateMatch | null>(null)
  const [savedContact, setSavedContact] = useState<ScannedContact | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [blocked, setBlocked] = useState(false)
  const [qrDetectedAt, setQrDetectedAt] = useState(0)

  const previewRef = useRef<string | null>(null)
  const busy = stage === 'processing'

  // Camera runs only while capturing — released during review and on unmount.
  const cameraActive = stage === 'capture'
  const { videoRef, status, captureFrame } = useCamera(cameraActive)

  useEffect(() => {
    return () => {
      if (previewRef.current) URL.revokeObjectURL(previewRef.current)
    }
  }, [])

  const setPreview = useCallback((file: File | null) => {
    if (previewRef.current) URL.revokeObjectURL(previewRef.current)
    if (!file) {
      previewRef.current = null
      setPreviewUrl(null)
      return
    }
    const url = URL.createObjectURL(file)
    previewRef.current = url
    setPreviewUrl(url)
  }, [])

  const resetToCapture = useCallback(() => {
    setPreview(null)
    setFields(emptyCandidate())
    setContext(emptyContext())
    setCaptureSource('auto')
    setProvenance(null)
    setDuplicate(null)
    setSavedContact(null)
    setError(null)
    setQrResult(null)
    setStage('capture')
  }, [setPreview])

  /** Image path: existing OCR pipeline, with enrichment explicitly off. */
  const processImage = useCallback(
    async (file: File, origin: CaptureOrigin) => {
      setError(null)
      setStage('processing')
      setProcessingStep(0)
      setPreview(file)
      hapticMedium()

      const stepTimers = [
        setTimeout(() => setProcessingStep(1), 700),
        setTimeout(() => setProcessingStep(2), 1600),
      ]

      try {
        const {
          data: { user },
        } = await supabase.auth.getUser()
        if (!user) {
          router.push('/login')
          return
        }

        const compressed = await compressImageForScan(file)

        const form = new FormData()
        form.append('image', compressed)
        form.append('userId', user.id)
        form.append('userProfile', JSON.stringify({ id: user.id }))
        form.append('enrich', 'false')
        form.append('source', sourceForMode(mode))

        const res = await fetch('/api/card/scan', { method: 'POST', body: form })
        const data = await res.json()

        if (res.status === 403 && data.error === 'SCAN_LIMIT_REACHED') {
          setBlocked(true)
          setError('You have used every scan on your plan. Upgrade to keep scanning.')
          setStage('capture')
          return
        }

        if (!res.ok || !data.success) {
          throw new Error(data.error || 'Scan failed')
        }

        /*
          The scan hands back a candidate, not a contact. Nothing exists in the
          database yet and nothing will until Save, so there is no id to carry
          through review — which is exactly what makes Discard free.
        */
        setCaptureSource(sourceForMode(mode))
        setProvenance({ origin, kind: kindForMode(mode) })
        setFields(toCandidate((data.candidate ?? {}) as CandidateInput))
        hapticSuccess()
        setStage('review')
      } catch (err) {
        const message = formatScanErrorForUser(
          err instanceof Error ? err.message : 'Scan failed'
        )
        setError(message)
        setStage('capture')
      } finally {
        stepTimers.forEach(clearTimeout)
      }
    },
    [mode, router, setPreview, supabase]
  )

  /**
   * ABC-to-ABC: another user's card QR resolves into the same review step a
   * paper card reaches, so meeting context and saving work identically.
   * If the card cannot be resolved, the generic QR sheet still offers the link.
   */
  const handleAbcCard = useCallback(
    async (parsed: Extract<QrResult, { kind: 'abc_card' }>) => {
      try {
        const res = await fetch(
          `/api/card/resolve/${encodeURIComponent(parsed.slug)}?ref=${parsed.ref}`
        )
        const data = await res.json()
        if (!res.ok || !data?.ok || !data.card?.name) {
          setQrResult(parsed)
          return
        }

        const card = data.card as CandidateInput
        setPreview(null)
        setCaptureSource('qr')
        setProvenance({ origin: 'qr_live', kind: 'abc_card', abcCardSlug: parsed.slug, abcCardRef: parsed.ref })
        setFields(toCandidate(card))
        setError(null)
        setStage('review')
      } catch (err) {
        console.error('[scan] ABC card resolve failed:', err)
        setQrResult(parsed)
      }
    },
    [setPreview]
  )

  /** QR path: no vision call, no scan credit. */
  const handleQr = useCallback(
    (raw: string) => {
      // Ignore repeat detections of the same frame burst.
      if (Date.now() - qrDetectedAt < 1500) return
      setQrDetectedAt(Date.now())
      hapticSuccess()

      const parsed = parseQrPayload(raw)

      if (parsed.kind === 'abc_card') {
        void handleAbcCard(parsed)
        return
      }

      if (parsed.kind === 'contact') {
        setPreview(null)
        setCaptureSource('qr')
        setProvenance({ origin: 'qr_live', kind: parsed.format })
        setFields(toCandidate(parsed.fields))
        setError(null)
        setStage('review')
        return
      }

      setQrResult(parsed)
    },
    [handleAbcCard, qrDetectedAt, setPreview]
  )

  useQrScanner(videoRef, cameraActive && !qrResult && qrEnabledForMode(mode), handleQr)

  const capture = useCallback(async () => {
    const file = await captureFrame()
    if (!file) {
      setError('Could not read a frame from the camera. Try again.')
      return
    }
    void processImage(file, 'camera')
  }, [captureFrame, processImage])

  /** Meeting context for a contact that already exists, as its own encounter. */
  const addMeetingToExisting = useCallback(
    async (contactId: string) => {
      setSaving(true)
      setError(null)
      try {
        /*
          Always sent, even with every field empty. A scan is a meeting whether
          or not the owner wrote anything down, and this is what records it —
          the encounter carries when and how, and the server declines to project
          an empty meeting over the notes from the last one.
        */
        const res = await fetch('/api/card/context', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contactId,
            provenance,
            whereMet: context.whereMet,
            topic: context.discussed,
            nextAction: context.nextAction,
            followUpAt: context.followUpAt,
            recalculateScore: false,
            generateMessages: false,
          }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok || !data.success) {
          throw new Error(data.error || 'Could not add this meeting.')
        }

        hapticSuccess()
        router.push(`/contacts/${contactId}`)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not add this meeting.')
      } finally {
        setSaving(false)
      }
    },
    [context, provenance, router]
  )

  const save = useCallback(
    async (allowDuplicate = false) => {
      setSaving(true)
      setError(null)

      try {
        /*
          No contactId: a fresh scan has never been written, whichever way it was
          captured, so this always creates. `captureSource` records how the
          candidate was read — an image keeps the chosen mode, a QR says so.

          `allowDuplicate` is sent only when the owner has seen a match and asked
          for a separate contact anyway. It travels per request rather than being
          remembered, so the next scan is checked again.
        */
        const identityRes = await fetch('/api/scan/contact', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            source: captureSource,
            provenance,
            allowDuplicate,
            fields: candidateToFields(fields),
          }),
        })
        const identityData = await identityRes.json()
        if (!identityRes.ok || !identityData.success) {
          throw new Error(identityData.error || 'Could not save this contact.')
        }

        /*
          Someone the owner already has. Nothing was written, and the reviewed
          candidate and meeting context stay exactly as they are in state — going
          back to review must not cost the owner their typing.
        */
        if (identityData.outcome === 'existing_contact') {
          setDuplicate(identityData.match as DuplicateMatch)
          hapticMedium()
          setStage('duplicate')
          return
        }

        const saved = identityData.contact as ScannedContact
        // The save already recorded the meeting. Context written below revises
        // that encounter rather than adding a second one for the same handshake.
        const encounterId = (identityData.encounter?.id as string | undefined) ?? undefined
        const hasContext =
          context.whereMet.trim() ||
          context.discussed.trim() ||
          context.nextAction.trim() ||
          context.followUpAt

        if (hasContext) {
          const contextRes = await fetch('/api/card/context', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contactId: saved.id,
              encounterId,
              whereMet: context.whereMet,
              topic: context.discussed,
              nextAction: context.nextAction,
              followUpAt: context.followUpAt,
              recalculateScore: false,
              generateMessages: false,
            }),
          })
          if (!contextRes.ok) {
            const contextData = await contextRes.json().catch(() => ({}))
            throw new Error(contextData.error || 'Contact saved, but the meeting notes did not.')
          }
        }

        setSavedContact(saved)
        hapticSuccess()
        setStage('saved')
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not save this contact.')
      } finally {
        setSaving(false)
      }
    },
    [captureSource, context, fields, provenance]
  )

  const statusText =
    status === 'live'
      ? mode === 'qr'
        ? 'Point at a QR code'
        : hintForMode(mode)
      : 'Preparing camera…'

  return (
    <div className="mx-auto flex w-full max-w-[1000px] flex-col abc-page-top px-4 pb-8 sm:px-6 lg:px-8">
      {stage === 'capture' || stage === 'processing' ? (
        <>
          <header className="shrink-0">
            <h1 className="text-[24px] font-bold tracking-tight text-abc-text lg:text-[32px]">
              Scan a connection
            </h1>
            <p className="mt-1.5 text-[14px] text-abc-secondary lg:text-[15px]">
              Scan a business card, badge, QR, flyer or screen.
            </p>
          </header>

          {error ? (
            <p
              className="mt-4 rounded-inner px-3.5 py-3 text-[13.5px]"
              style={{
                background: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                color: '#fca5a5',
              }}
              role="alert"
            >
              {error}
            </p>
          ) : null}

          <div
            className="mt-4 flex min-h-0 flex-col"
            style={{ height: 'min(72vh, 640px)' }}
          >
            {stage === 'processing' ? (
              <Processing step={processingStep} previewUrl={previewUrl} />
            ) : (
              <CameraStage
                videoRef={videoRef}
                status={status}
                mode={mode}
                onModeChange={setMode}
                onCapture={capture}
                onFile={(file, origin) => void processImage(file, origin)}
                statusText={statusText}
                busy={busy}
                blocked={blocked}
              />
            )}
          </div>
        </>
      ) : null}

      {stage === 'review' ? (
        <ScanReview
          fields={fields}
          onFieldsChange={setFields}
          context={context}
          onContextChange={setContext}
          previewUrl={previewUrl}
          saving={saving}
          error={error}
          onSave={() => void save()}
          onDiscard={resetToCapture}
        />
      ) : null}

      {stage === 'duplicate' && duplicate ? (
        <DuplicateResolution
          reason={duplicate.reason}
          contacts={duplicate.contacts}
          busy={saving}
          onAddMeeting={(contactId) => void addMeetingToExisting(contactId)}
          onCreateSeparate={() => void save(true)}
          onBack={() => {
            setDuplicate(null)
            setError(null)
            setStage('review')
          }}
        />
      ) : null}

      {stage === 'saved' && savedContact ? (
        <Saved
          name={savedContact.name || 'Connection'}
          onScanAnother={resetToCapture}
          onView={() => router.push(`/contacts/${savedContact.id}`)}
        />
      ) : null}

      {qrResult ? <QrSheet result={qrResult} onDismiss={() => setQrResult(null)} /> : null}
    </div>
  )
}

function Processing({ step, previewUrl }: { step: number; previewUrl: string | null }) {
  return (
    <div className="abc-surface flex min-h-0 flex-1 flex-col items-center justify-center gap-5 p-6 text-center">
      {previewUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={previewUrl}
          alt=""
          className="h-32 w-48 rounded-inner border border-abc-border object-cover opacity-70"
        />
      ) : null}
      <div className="flex flex-col items-center gap-3">
        <span
          className="abc-ring-pulse flex h-12 w-12 items-center justify-center rounded-full border-2"
          style={{ borderColor: 'var(--abc-gold)' }}
        >
          <IconScan size={22} stroke={1.6} style={{ color: 'var(--abc-gold-accent)' }} />
        </span>
        <p className="text-[15px] font-medium text-abc-text" aria-live="polite">
          {PROCESSING_STEPS[Math.min(step, PROCESSING_STEPS.length - 1)]}
        </p>
      </div>
    </div>
  )
}

function Saved({
  name,
  onScanAnother,
  onView,
}: {
  name: string
  onScanAnother: () => void
  onView: () => void
}) {
  return (
    <div className="abc-surface mt-6 flex flex-col items-center px-6 py-12 text-center">
      <span
        className="flex h-14 w-14 items-center justify-center rounded-full"
        style={{ background: 'var(--abc-gold-soft)', border: '1px solid var(--abc-gold-border)' }}
      >
        <IconCheck size={26} stroke={2} style={{ color: 'var(--abc-gold-accent)' }} />
      </span>
      <h1 className="mt-4 text-[22px] font-bold tracking-tight text-abc-text">Connection saved.</h1>
      <p className="mt-1.5 text-[14px] text-abc-secondary">{name} is in your contacts.</p>

      <div className="mt-6 flex w-full max-w-[340px] flex-col gap-2">
        <Button onClick={onView} size="lg" fullWidth>
          View contact
        </Button>
        <Button onClick={onScanAnother} variant="surface" size="lg" fullWidth>
          Scan another
        </Button>
      </div>
    </div>
  )
}
