'use client'

import { useCallback, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  IconAlertTriangle,
  IconCameraPlus,
  IconCheck,
  IconLayoutGrid,
  IconPhoto,
  IconScan,
} from '@tabler/icons-react'
import Button from '@/components/ui/abc/Button'
import BatchCardList from '@/components/scan/BatchCardList'
import BatchExportPanel from '@/components/scan/BatchExportPanel'
import BatchSharedContextForm from '@/components/scan/BatchSharedContextForm'
import { compressImageForScan } from '@/lib/image-compress'
import { hapticMedium, hapticSuccess } from '@/lib/hooks/useHaptic'
import { useCamera } from '@/lib/scan/useCamera'
import type { ContactCandidate } from '@/lib/scan/candidate'
import {
  emptySharedContext,
  MAX_BATCH_CARDS,
  type BatchSharedContext,
  type ScanBatch,
} from '@/lib/scan/batch'

/**
 * Multi-card scanning, end to end.
 *
 * The flow is one photograph, one review, one context, one save — and the
 * guided path is the same flow with the first step repeated. That is why there
 * is no separate "guided mode" state machine: adding a second photo appends to
 * the batch the first one opened, so a session that started as one shot and
 * became four is still one batch with one meeting on it.
 *
 * Nothing here creates a contact. The batch and its items are server-side
 * scratch space, and only Save turns them into people — which is what makes
 * abandoning a batch free, the same property the single-card candidate has.
 */

type Stage = 'capture' | 'detecting' | 'review' | 'saving' | 'saved'

const DETECT_STEPS = [
  'Finding the cards…',
  'Reading each one…',
  'Checking your contacts…',
]

type SaveOutcome = {
  created: { contactId: string; name: string; linked?: boolean }[]
  failed: { itemId: string; name: string; reason: string }[]
  /** Cards that became new people. */
  newContacts: number
  /** Cards that became a further meeting with somebody already on file. */
  linkedContacts: number
  stoppedForCredits: boolean
}

export default function MultiCardClient() {
  const router = useRouter()

  const [stage, setStage] = useState<Stage>('capture')
  const [batch, setBatch] = useState<ScanBatch | null>(null)
  const [context, setContext] = useState<BatchSharedContext>(emptySharedContext)
  const [detectStep, setDetectStep] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [blocked, setBlocked] = useState(false)
  const [outcome, setOutcome] = useState<SaveOutcome | null>(null)

  const uploadRef = useRef<HTMLInputElement>(null)

  // The camera runs only while capturing, and is released for review and save.
  const cameraActive = stage === 'capture'
  const { videoRef, status, captureFrame } = useCamera(cameraActive)

  const items = batch?.items ?? []
  const selectedCount = items.filter((item) => item.selected && !item.createdContactId).length
  const remaining = MAX_BATCH_CARDS - items.length

  /**
   * Local edits, applied to state immediately and sent with Save.
   *
   * Deliberately not a request per keystroke. A batch review is ten rows of
   * eight fields, and PATCHing each one would put the owner's typing at the
   * mercy of trade-fair wifi; the edits ride along with the save that needs
   * them, which is also the request that cannot be skipped.
   */
  const patchItemFields = useCallback((itemId: string, fields: ContactCandidate) => {
    setBatch((current) =>
      current
        ? {
            ...current,
            items: current.items.map((item) => (item.id === itemId ? { ...item, fields } : item)),
          }
        : current
    )
  }, [])

  const patchItemSelected = useCallback((itemId: string, selected: boolean) => {
    setBatch((current) =>
      current
        ? {
            ...current,
            items: current.items.map((item) => (item.id === itemId ? { ...item, selected } : item)),
          }
        : current
    )
  }, [])

  const patchItemLink = useCallback((itemId: string, linkToExisting: boolean) => {
    setBatch((current) =>
      current
        ? {
            ...current,
            items: current.items.map((item) =>
              item.id === itemId ? { ...item, linkToExisting } : item
            ),
          }
        : current
    )
  }, [])

  /** Opens the batch on first use, then reuses it for every later photo. */
  const ensureBatch = useCallback(async (): Promise<string | null> => {
    if (batch) return batch.id

    const res = await fetch('/api/scan/batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sourceKind: 'single_photo' }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok || !data.success) {
      setError(data.error || 'Could not start this batch.')
      return null
    }

    setBatch(data.batch as ScanBatch)
    return (data.batch as ScanBatch).id
  }, [batch])

  const detect = useCallback(
    async (file: File) => {
      setError(null)
      setNotice(null)
      setStage('detecting')
      setDetectStep(0)
      hapticMedium()

      const timers = [
        setTimeout(() => setDetectStep(1), 1200),
        setTimeout(() => setDetectStep(2), 3200),
      ]

      try {
        const batchId = await ensureBatch()
        if (!batchId) {
          setStage('capture')
          return
        }

        const compressed = await compressImageForScan(file)
        const form = new FormData()
        form.append('image', compressed)

        const res = await fetch(`/api/scan/batch/${batchId}/detect`, {
          method: 'POST',
          body: form,
        })
        const data = await res.json().catch(() => ({}))

        if (res.status === 403 && data.error === 'SCAN_LIMIT_REACHED') {
          setBlocked(true)
          setError('You have used every scan on your plan. Upgrade to keep scanning.')
          setStage(items.length > 0 ? 'review' : 'capture')
          return
        }

        if (!res.ok || !data.success) {
          throw new Error(data.error || 'Could not read that photo.')
        }

        setBatch(data.batch as ScanBatch)
        if (data.cappedByPlan) {
          setNotice(
            `Your plan covered ${data.added} of the cards in that photo. Upgrade to capture the rest.`
          )
        }
        hapticSuccess()
        setStage('review')
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not read that photo.')
        // A failed photo must not lose the cards already in the batch.
        setStage(items.length > 0 ? 'review' : 'capture')
      } finally {
        timers.forEach(clearTimeout)
      }
    },
    [ensureBatch, items.length]
  )

  const capture = useCallback(async () => {
    const file = await captureFrame()
    if (!file) {
      setError('Could not read a frame from the camera. Try again.')
      return
    }
    void detect(file)
  }, [captureFrame, detect])

  const save = useCallback(async () => {
    if (!batch) return
    setStage('saving')
    setError(null)

    try {
      const res = await fetch(`/api/scan/batch/${batch.id}/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sharedContext: context,
          // Every unsaved row, so a correction and an untick travel together.
          items: batch.items
            .filter((item) => !item.createdContactId)
            .map((item) => ({
              id: item.id,
              fields: item.fields,
              selected: item.selected,
              linkToExisting: item.linkToExisting,
            })),
        }),
      })
      const data = await res.json().catch(() => ({}))

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Could not save these contacts.')
      }

      setBatch(data.batch as ScanBatch)
      setOutcome({
        created: data.created || [],
        failed: data.failed || [],
        newContacts: data.newContacts ?? (data.created || []).length,
        linkedContacts: data.linkedContacts ?? 0,
        stoppedForCredits: Boolean(data.stoppedForCredits),
      })
      hapticSuccess()
      setStage('saved')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save these contacts.')
      setStage('review')
    }
  }, [batch, context])

  const restart = useCallback(() => {
    setBatch(null)
    setContext(emptySharedContext())
    setOutcome(null)
    setError(null)
    setNotice(null)
    setStage('capture')
  }, [])

  return (
    <div className="flex w-full flex-col">
      {error ? <Banner tone="error" text={error} /> : null}
      {notice && !error ? <Banner tone="notice" text={notice} /> : null}

      {stage === 'capture' ? (
        <CaptureStage
          videoRef={videoRef}
          live={status === 'live'}
          status={status}
          blocked={blocked}
          alreadyCaptured={items.length}
          remaining={remaining}
          onCapture={() => void capture()}
          onPickFile={() => uploadRef.current?.click()}
          onReview={items.length > 0 ? () => setStage('review') : undefined}
        />
      ) : null}

      {stage === 'detecting' ? <Detecting step={detectStep} /> : null}

      {(stage === 'review' || stage === 'saving') && batch ? (
        <div className="mt-4 flex flex-col gap-3">
          <BatchCardList
            items={items}
            onFieldsChange={patchItemFields}
            onSelectedChange={patchItemSelected}
            onLinkChange={patchItemLink}
            disabled={stage === 'saving'}
          />

          <BatchSharedContextForm
            value={context}
            onChange={setContext}
            count={Math.max(selectedCount, 1)}
            disabled={stage === 'saving'}
          />

          {remaining > 0 && !blocked ? (
            <button
              type="button"
              onClick={() => setStage('capture')}
              className="abc-surface flex items-center justify-center gap-2 p-3.5 text-[13.5px] font-semibold text-abc-gold-accent transition-colors duration-200 ease-abc hover:border-abc-border-strong abc-focus-ring"
            >
              <IconCameraPlus size={17} stroke={1.8} />
              Add another photo ({remaining} card{remaining === 1 ? '' : 's'} left)
            </button>
          ) : null}

          <div className="sticky bottom-0 z-10 -mx-4 mt-1 border-t border-abc-border bg-abc-bg px-4 py-3 sm:mx-0 sm:rounded-card sm:border sm:px-4">
            <Button
              onClick={() => void save()}
              disabled={stage === 'saving' || selectedCount === 0}
              size="lg"
              fullWidth
            >
              {stage === 'saving'
                ? 'Saving…'
                : selectedCount === 0
                  ? 'Select a card to save'
                  : `Save ${selectedCount} contact${selectedCount === 1 ? '' : 's'}`}
            </Button>
            <p className="mt-2 text-center text-[12px] text-abc-muted">
              You can add individual details to any contact afterwards.
            </p>
          </div>
        </div>
      ) : null}

      {stage === 'saved' && batch && outcome ? (
        <SavedStage
          batchId={batch.id}
          outcome={outcome}
          onScanMore={restart}
          onViewContacts={() => router.push('/contacts')}
          onViewBatch={() => router.push(`/batches/${batch.id}`)}
        />
      ) : null}

      <input
        ref={uploadRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          e.target.value = ''
          if (file) void detect(file)
        }}
      />
    </div>
  )
}

function Banner({ tone, text }: { tone: 'error' | 'notice'; text: string }) {
  const error = tone === 'error'
  return (
    <p
      className="mt-4 rounded-inner px-3.5 py-3 text-[13.5px]"
      style={{
        background: error ? 'rgba(239, 68, 68, 0.1)' : 'rgba(234, 179, 8, 0.1)',
        border: `1px solid ${error ? 'rgba(239, 68, 68, 0.3)' : 'rgba(234, 179, 8, 0.28)'}`,
        color: error ? '#fca5a5' : '#e5c07b',
      }}
      role={error ? 'alert' : 'status'}
    >
      {text}
    </p>
  )
}

function CaptureStage({
  videoRef,
  live,
  status,
  blocked,
  alreadyCaptured,
  remaining,
  onCapture,
  onPickFile,
  onReview,
}: {
  videoRef: React.RefObject<HTMLVideoElement>
  live: boolean
  status: string
  blocked: boolean
  alreadyCaptured: number
  remaining: number
  onCapture: () => void
  onPickFile: () => void
  onReview?: () => void
}) {
  return (
    <div className="mt-4 flex min-h-0 flex-col" style={{ height: 'min(72vh, 640px)' }}>
      <div
        className="relative min-h-0 flex-1 overflow-hidden rounded-card border border-abc-border"
        style={{ background: '#050506' }}
      >
        <video
          ref={videoRef}
          playsInline
          muted
          autoPlay
          className={`h-full w-full object-cover transition-opacity duration-300 ${
            live ? 'opacity-100' : 'opacity-0'
          }`}
        />

        {live ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6">
            {/*
              A wide frame rather than a card-shaped one: the owner is being
              asked to fill it with several cards, and a single-card guide would
              be telling them the opposite of what this mode wants.
            */}
            <div
              className="h-[58%] w-full rounded-card border-2 border-dashed"
              style={{ borderColor: 'rgba(217, 164, 65, 0.45)' }}
            />
          </div>
        ) : null}

        {!live ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center">
            <p className="text-[14px] text-abc-secondary">
              {status === 'starting' ? 'Starting camera…' : 'Camera unavailable — upload a photo instead.'}
            </p>
          </div>
        ) : null}

        <div className="absolute inset-x-0 bottom-0 p-4">
          <p className="mb-3 text-center text-[13px] text-white/80">
            {alreadyCaptured > 0
              ? `${alreadyCaptured} card${alreadyCaptured === 1 ? '' : 's'} so far · ${remaining} left`
              : `Lay the cards flat and fill the frame — up to ${MAX_BATCH_CARDS} at once`}
          </p>
        </div>
      </div>

      <div className="mt-3 flex flex-col gap-2">
        <Button onClick={onCapture} disabled={!live || blocked || remaining <= 0} size="lg" fullWidth>
          <IconScan size={19} stroke={1.8} />
          {alreadyCaptured > 0 ? 'Capture more cards' : 'Capture cards'}
        </Button>

        <div className="flex gap-2">
          <Button onClick={onPickFile} disabled={blocked || remaining <= 0} variant="surface" size="md" fullWidth>
            <IconPhoto size={17} stroke={1.8} />
            Upload a photo
          </Button>
          {onReview ? (
            <Button onClick={onReview} variant="surface" size="md" fullWidth>
              <IconLayoutGrid size={17} stroke={1.8} />
              Review {alreadyCaptured}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function Detecting({ step }: { step: number }) {
  return (
    <div
      className="abc-surface mt-4 flex min-h-0 flex-col items-center justify-center gap-5 p-6 text-center"
      style={{ height: 'min(52vh, 420px)' }}
    >
      <span
        className="abc-ring-pulse flex h-12 w-12 items-center justify-center rounded-full border-2"
        style={{ borderColor: 'var(--abc-gold)' }}
      >
        <IconScan size={22} stroke={1.6} style={{ color: 'var(--abc-gold-accent)' }} />
      </span>
      <div>
        <p className="text-[15px] font-medium text-abc-text" aria-live="polite">
          {DETECT_STEPS[Math.min(step, DETECT_STEPS.length - 1)]}
        </p>
        <p className="mt-1.5 text-[13px] text-abc-secondary">
          Reading several cards takes a moment longer than one.
        </p>
      </div>
    </div>
  )
}

function SavedStage({
  batchId,
  outcome,
  onScanMore,
  onViewContacts,
  onViewBatch,
}: {
  batchId: string
  outcome: SaveOutcome
  onScanMore: () => void
  onViewContacts: () => void
  onViewBatch: () => void
}) {
  const saved = outcome.created.length

  return (
    <div className="mt-4 flex flex-col gap-3">
      <section className="abc-surface flex flex-col items-center px-6 py-10 text-center">
        <span
          className="flex h-14 w-14 items-center justify-center rounded-full"
          style={{ background: 'var(--abc-gold-soft)', border: '1px solid var(--abc-gold-border)' }}
        >
          <IconCheck size={26} stroke={2} style={{ color: 'var(--abc-gold-accent)' }} />
        </span>
        <h2 className="mt-4 text-[22px] font-bold tracking-tight text-abc-text">
          {saved} card{saved === 1 ? '' : 's'} saved
        </h2>
        {/*
          New people and people met again are counted separately, because they
          are different things and only one of them costs a credit. Saying "10
          contacts saved" when three were already in the book would be claiming
          contacts that were not created.
        */}
        <p className="mt-1.5 text-[14px] text-abc-secondary">
          {outcome.linkedContacts > 0
            ? `${outcome.newContacts} new contact${outcome.newContacts === 1 ? '' : 's'}, and ${outcome.linkedContacts} meeting${outcome.linkedContacts === 1 ? '' : 's'} added to ${outcome.linkedContacts === 1 ? 'someone' : 'people'} you already had.`
            : 'They all share the meeting you entered. Open any one to add details of your own.'}
        </p>

        {outcome.stoppedForCredits ? (
          <p
            className="mt-3 w-full rounded-inner px-3 py-2.5 text-left text-[12.5px] leading-[1.5]"
            style={{ background: 'rgba(234, 179, 8, 0.1)', border: '1px solid rgba(234, 179, 8, 0.28)', color: '#e5c07b' }}
          >
            You ran out of Smart Scan credits partway through. The remaining cards are still in
            this batch — top up and press Save again to finish.
          </p>
        ) : null}

        {outcome.failed.length > 0 ? (
          <div
            className="mt-5 w-full rounded-inner p-3 text-left"
            style={{ background: 'rgba(234, 179, 8, 0.1)', border: '1px solid rgba(234, 179, 8, 0.28)' }}
          >
            <p className="flex items-center gap-2 text-[13px] font-semibold" style={{ color: '#e5c07b' }}>
              <IconAlertTriangle size={14} stroke={2} />
              {outcome.failed.length} card{outcome.failed.length === 1 ? '' : 's'} still need
              attention
            </p>
            <ul className="mt-1.5 flex flex-col gap-1">
              {outcome.failed.map((row) => (
                <li key={row.itemId} className="text-[12.5px] text-abc-secondary">
                  <span className="text-abc-text">{row.name}</span> — {row.reason}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="mt-6 flex w-full max-w-[340px] flex-col gap-2">
          <Button onClick={onViewContacts} size="lg" fullWidth>
            View contacts
          </Button>
          <Button onClick={onViewBatch} variant="surface" size="lg" fullWidth>
            View this batch
          </Button>
          <Button onClick={onScanMore} variant="surface" size="lg" fullWidth>
            Scan more cards
          </Button>
        </div>
      </section>

      <BatchExportPanel batchId={batchId} contactCount={saved} />
    </div>
  )
}
