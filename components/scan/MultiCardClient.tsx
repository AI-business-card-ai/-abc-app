'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  IconAlertTriangle,
  IconArrowBackUp,
  IconArrowLeft,
  IconCameraPlus,
  IconCheck,
  IconDeviceMobileRotated,
  IconLayoutGrid,
  IconPhoto,
  IconScan,
  IconX,
} from '@tabler/icons-react'
import Button from '@/components/ui/abc/Button'
import BatchCardList from '@/components/scan/BatchCardList'
import BatchExportPanel from '@/components/scan/BatchExportPanel'
import BatchSharedContextForm from '@/components/scan/BatchSharedContextForm'
import { prepareImageForVision } from '@/lib/image-compress'
import { hapticMedium, hapticSuccess } from '@/lib/hooks/useHaptic'
import { useCamera } from '@/lib/scan/useCamera'
import {
  IMMERSIVE_FRAME_INSETS,
  shouldEnterImmersive,
  shouldSuggestLandscape,
  useOrientation,
} from '@/lib/scan/useOrientation'
import type { ContactCandidate } from '@/lib/scan/candidate'
import { ABOVE_MOBILE_NAV, MOBILE_NAV_HEIGHT, SAFE_TOP } from '@/lib/ui/layout'
import {
  batchSaveCount,
  emptySharedContext,
  MAX_BATCH_CARDS,
  MULTI_CARD_IMAGE_POLICY,
  remainingInBatch,
  restoreRoom,
  setItemSelected,
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

/** Long enough to notice a slip and reach Undo; short enough not to linger. */
const UNDO_WINDOW_MS = 6000

/*
  A phone held sideways has very little height, and the header and the bottom
  navigation both stay on screen. The stage is sized to what is left between
  them, so the viewfinder and its controls are all visible at once.
*/
const LANDSCAPE_STAGE_HEIGHT = `calc(100svh - 3.5rem - ${SAFE_TOP} - ${MOBILE_NAV_HEIGHT}px - env(safe-area-inset-bottom) - 24px)`

/*
  The full-screen camera: no padding at all, so the picture runs to every edge
  of the app viewport. The frame and the two controls position themselves from
  these insets instead, each clearing the phone's own shape on its own terms.
  Black shows only for the instant before the stream starts.
*/
const IMMERSIVE_SURFACE_STYLE = {
  background: '#000',
  '--mc-frame-top': IMMERSIVE_FRAME_INSETS.top,
  '--mc-frame-bottom': IMMERSIVE_FRAME_INSETS.bottom,
  '--mc-frame-left': IMMERSIVE_FRAME_INSETS.left,
  '--mc-frame-right': IMMERSIVE_FRAME_INSETS.right,
} as React.CSSProperties

/** Whether the element that has focus got it from the keyboard. */
function focusFromKeyboard(): boolean {
  try {
    return Boolean(document.activeElement?.matches(':focus-visible'))
  } catch {
    return false
  }
}

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
  /** The card just removed, while it can still be put back. */
  const [removed, setRemoved] = useState<{ itemId: string; fromKeyboard: boolean } | null>(null)
  /** Paused while the owner is on the toast — it must not vanish under a finger or a focus ring. */
  const [holdUndo, setHoldUndo] = useState(false)
  const [hintDismissed, setHintDismissed] = useState(false)
  /** Back was pressed in the full-screen camera; cleared when the phone goes upright or a new capture begins. */
  const [immersiveExited, setImmersiveExited] = useState(false)

  const uploadRef = useRef<HTMLInputElement>(null)
  const undoRef = useRef<HTMLButtonElement>(null)
  /*
    Removals and restores, in the order they happened. Each is sent as it is
    made, because a removed card frees its place for the next photo and the
    server counts that place; detection and save wait for the queue, so neither
    can overtake a change the owner has already made.
  */
  const selectionSync = useRef<Promise<void>>(Promise.resolve())

  // The camera runs only while capturing, and is released for review and save.
  const cameraActive = stage === 'capture'
  const { videoRef, status, captureFrame } = useCamera(cameraActive)
  const orientation = useOrientation()

  const items = batch?.items ?? []
  const selectedCount = batchSaveCount(items)
  const activeCount = items.filter((item) => item.selected).length
  /*
    Room left in the batch. A removed card gives its place back, so the owner
    can retake a badly read card without starting over. Mirrors the server's
    own count, which is the one that is enforced.
  */
  const remaining = remainingInBatch(items)

  /*
    Full-screen camera: a phone held sideways, capturing, camera live. Nothing
    is stored about it — it is a way of looking at the capture stage, so
    turning the phone upright or taking the photo simply ends it.
  */
  const immersive = shouldEnterImmersive(orientation, {
    capturing: stage === 'capture',
    live: status === 'live',
    canCapture: !blocked && remaining > 0,
    exited: immersiveExited,
  })

  // Back opts out of the full-screen camera only until the next chance to use it.
  useEffect(() => {
    if (orientation.portrait) setImmersiveExited(false)
  }, [orientation.portrait])
  useEffect(() => {
    if (stage !== 'capture') setImmersiveExited(false)
  }, [stage])

  /*
    The page behind the full-screen camera must not move under the owner's
    hands. Locked only for as long as the camera covers it, and put back
    exactly as it was — the rest of ABC scrolls as it always did.
  */
  useEffect(() => {
    if (!immersive) return
    const root = document.documentElement
    const previous = { root: root.style.overflow, body: document.body.style.overflow }
    root.style.overflow = 'hidden'
    document.body.style.overflow = 'hidden'
    return () => {
      root.style.overflow = previous.root
      document.body.style.overflow = previous.body
    }
  }, [immersive])

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

  /*
    Remove and restore are the one edit that is not held back for Save: the
    place a removed card frees is counted by the server when the next photo is
    read. Save still carries every card's final state, so a PATCH lost to bad
    wifi cannot save a card the owner removed.
  */
  const batchId = batch?.id ?? null
  const setSelected = useCallback(
    (itemIds: string[], selected: boolean) => {
      if (itemIds.length === 0) return
      setBatch((current) =>
        current ? { ...current, items: setItemSelected(current.items, itemIds, selected) } : current
      )
      if (!batchId) return
      // One request for a Restore all, not one per card.
      selectionSync.current = selectionSync.current.then(() =>
        fetch(`/api/scan/batch/${batchId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ items: itemIds.map((id) => ({ id, selected })) }),
        }).then(
          () => undefined,
          () => undefined
        )
      )
    },
    [batchId]
  )

  const removeCard = useCallback(
    (itemId: string) => {
      const fromKeyboard = focusFromKeyboard()
      setSelected([itemId], false)
      setHoldUndo(false)
      setRemoved({ itemId, fromKeyboard })
    },
    [setSelected]
  )

  /*
    Every way a removed card comes back — Undo, a single Restore, Restore all —
    goes through here, so the ten-card ceiling is checked in one place. The
    server refuses the same restore; checking first keeps the screen from
    showing a card as back when the batch could not take it.
  */
  const restoreCards = useCallback(
    (itemIds: string[]) => {
      if (itemIds.length === 0) return false
      if (itemIds.length > restoreRoom(batch?.items ?? [])) {
        setNotice(`A batch holds up to ${MAX_BATCH_CARDS} cards. Remove one to restore another.`)
        return false
      }
      setSelected(itemIds, true)
      // The quick Undo is for the card it names; once that card is back, it has nothing to offer.
      setRemoved((current) => (current && itemIds.includes(current.itemId) ? null : current))
      setHoldUndo(false)
      return true
    },
    [batch, setSelected]
  )

  const undoRemove = useCallback(() => {
    if (!removed) return
    const { itemId } = removed
    const fromKeyboard = focusFromKeyboard()
    if (!restoreCards([itemId])) return
    // Back to the card that came back, for someone working by keyboard.
    if (fromKeyboard) {
      requestAnimationFrame(() => {
        const row = document.querySelector<HTMLElement>(`[data-batch-item="${itemId}"] button`)
        row?.focus()
        row?.scrollIntoView({ block: 'nearest' })
      })
    }
  }, [removed, restoreCards])

  // The Undo window.
  useEffect(() => {
    if (!removed || holdUndo) return
    const timer = setTimeout(() => setRemoved(null), UNDO_WINDOW_MS)
    return () => clearTimeout(timer)
  }, [removed, holdUndo])

  /*
    A removal made from the keyboard puts focus on Undo — the button that was
    pressed no longer exists, and leaving focus on the page body would drop a
    keyboard user back at the top of the screen.
  */
  useEffect(() => {
    if (removed?.fromKeyboard) undoRef.current?.focus({ preventScroll: true })
  }, [removed])

  // Undo belongs to the review it was offered on.
  useEffect(() => {
    if (stage !== 'review') setRemoved(null)
  }, [stage])

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
        const targetId = await ensureBatch()
        if (!targetId) {
          setStage('capture')
          return
        }

        // Sized to what the vision model actually reads, not to a fixed width.
        const compressed = await prepareImageForVision(file, MULTI_CARD_IMAGE_POLICY)
        const form = new FormData()
        form.append('image', compressed)

        // A card removed a moment ago has to have freed its place first.
        await selectionSync.current

        const res = await fetch(`/api/scan/batch/${targetId}/detect`, {
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
    // An empty save is never sent: there is nothing it could create.
    if (!batch || batchSaveCount(batch.items) === 0) return
    setStage('saving')
    setError(null)

    try {
      // Let a removal or an Undo still in flight land before the save reads it.
      await selectionSync.current

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
          capturedCount={activeCount}
          remaining={remaining}
          sideways={orientation.mobile && !orientation.portrait}
          suggestLandscape={shouldSuggestLandscape(orientation, {
            live: status === 'live',
            dismissed: hintDismissed,
          })}
          onDismissHint={() => setHintDismissed(true)}
          immersive={immersive}
          immersiveError={error}
          onExitImmersive={() => setImmersiveExited(true)}
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
            onSelectedChange={(itemId, selected) =>
              selected ? restoreCards([itemId]) : removeCard(itemId)
            }
            onRestore={restoreCards}
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

          {/*
            Every card removed. Nothing to save, and nothing wrong either — the
            owner can photograph more, or begin a fresh batch.
          */}
          {activeCount === 0 && stage === 'review' ? (
            <button
              type="button"
              onClick={restart}
              className="mx-auto flex h-[44px] items-center px-4 text-[13px] font-medium text-abc-secondary transition-colors duration-200 ease-abc hover:text-abc-text abc-focus-ring rounded-inner"
            >
              Start over
            </button>
          ) : null}

          {/*
            Sits above the bottom navigation on a phone, like the editor's save
            bar, so the count and Undo are on screen while the list scrolls.
          */}
          <div
            className="sticky z-[60] -mx-4 mt-1 border-t border-abc-border bg-abc-bg px-4 py-3 sm:mx-0 sm:rounded-card sm:border sm:px-4 lg:!bottom-0"
            style={{ bottom: ABOVE_MOBILE_NAV }}
          >
            <div aria-live="polite" aria-atomic="true">
              {removed ? (
                <div
                  className="mb-2.5 flex items-center gap-2 rounded-inner border border-abc-border bg-abc-raised py-0.5 pl-3.5 pr-1 text-[13px] text-abc-secondary"
                  onFocus={() => setHoldUndo(true)}
                  onBlur={() => setHoldUndo(false)}
                  onPointerEnter={() => setHoldUndo(true)}
                  onPointerLeave={() => setHoldUndo(false)}
                >
                  <span>Card removed</span>
                  <span aria-hidden="true">·</span>
                  <button
                    ref={undoRef}
                    type="button"
                    onClick={undoRemove}
                    disabled={restoreRoom(items) === 0}
                    className="flex h-[44px] items-center gap-1.5 rounded-inner px-2.5 font-semibold text-abc-gold-accent transition-colors duration-200 ease-abc hover:bg-abc-card abc-focus-ring disabled:opacity-40"
                  >
                    <IconArrowBackUp size={15} stroke={2} aria-hidden="true" />
                    Undo
                  </button>
                </div>
              ) : null}
            </div>

            <Button
              onClick={() => void save()}
              disabled={stage === 'saving' || selectedCount === 0}
              size="lg"
              fullWidth
            >
              {stage === 'saving'
                ? 'Saving…'
                : selectedCount === 0
                  ? 'No cards to save'
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
  capturedCount,
  remaining,
  sideways,
  suggestLandscape,
  onDismissHint,
  immersive,
  immersiveError,
  onExitImmersive,
  onCapture,
  onPickFile,
  onReview,
}: {
  videoRef: React.RefObject<HTMLVideoElement>
  live: boolean
  status: string
  blocked: boolean
  capturedCount: number
  remaining: number
  /** A phone held landscape. */
  sideways: boolean
  suggestLandscape: boolean
  onDismissHint: () => void
  /** The camera is the whole screen: a phone held sideways, capturing, camera live. */
  immersive: boolean
  immersiveError: string | null
  onExitImmersive: () => void
  onCapture: () => void
  onPickFile: () => void
  onReview?: () => void
}) {
  const stageRef = useRef<HTMLDivElement>(null)
  const backRef = useRef<HTMLButtonElement>(null)
  const shutterRef = useRef<HTMLButtonElement>(null)

  /*
    Turning the phone sideways leaves room for the viewfinder and little else,
    so the stage is brought fully into view — the owner is looking at the
    cards, not scrolling for the shutter.
  */
  useEffect(() => {
    if (sideways) stageRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' })
  }, [sideways])

  // The shutter is what the full-screen camera is for.
  useEffect(() => {
    if (immersive) shutterRef.current?.focus({ preventScroll: true })
  }, [immersive])

  /*
    A camera surface, not a page: Escape is Back, and Tab moves between the
    only two controls on it rather than into the page hidden behind.
  */
  function onSurfaceKey(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Escape') {
      e.preventDefault()
      onExitImmersive()
      return
    }
    if (e.key !== 'Tab') return
    const stops = [backRef.current, shutterRef.current].filter(
      (el): el is HTMLButtonElement => Boolean(el && !el.disabled)
    )
    if (stops.length === 0) return
    e.preventDefault()
    const index = stops.indexOf(document.activeElement as HTMLButtonElement)
    const next = e.shiftKey
      ? index <= 0
        ? stops.length - 1
        : index - 1
      : (index + 1) % stops.length
    stops[next].focus()
  }

  return (
    /*
      Upright: viewfinder above, controls below. Sideways on a phone: the
      camera becomes the whole screen (below); after Back, the viewfinder takes
      the width and the controls move beside it.
    */
    <div
      ref={stageRef}
      className="mt-4 flex h-[min(72vh,640px)] min-h-0 scroll-mt-[calc(3.5rem_+_env(safe-area-inset-top)_+_12px)] flex-col max-lg:landscape:h-[min(var(--abc-sideways-stage),640px)] max-lg:landscape:min-h-[220px] max-lg:landscape:flex-row max-lg:landscape:gap-3"
      style={{ '--abc-sideways-stage': LANDSCAPE_STAGE_HEIGHT } as React.CSSProperties}
    >
      {/*
        The camera surface. One element in both layouts, because the live
        stream is attached to this <video>: a second element for the full-screen
        camera would open on a black frame. Only its classes change.

        Full screen, it covers the app header, the page, and the bottom
        navigation (z-50 and z-[100]), and the page behind is scroll-locked.
        The picture fills the whole app viewport, edge to edge, cropped rather
        than stretched (object-cover). Nothing is laid out beside it: the
        shutter and Back float over the picture, so no column of the screen
        is spent on controls.
      */}
      <div
        role={immersive ? 'dialog' : undefined}
        aria-modal={immersive ? true : undefined}
        aria-label={immersive ? 'Multi-Card camera' : undefined}
        onKeyDown={immersive ? onSurfaceKey : undefined}
        className={
          immersive
            ? 'fixed inset-0 z-[200] h-[100dvh] w-full touch-none overflow-hidden overscroll-none'
            : 'relative min-h-0 flex-1 overflow-hidden rounded-card border border-abc-border'
        }
        style={immersive ? IMMERSIVE_SURFACE_STYLE : { background: '#050506' }}
      >
        <div className="absolute inset-0">
          <div className={immersive ? 'absolute inset-0' : 'relative h-full w-full'}>
            <video
              ref={videoRef}
              playsInline
              muted
              autoPlay
              className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-300 ${
                live ? 'opacity-100' : 'opacity-0'
              }`}
            />

            {immersive ? <ImmersiveFrame /> : null}

            {/* Back floats in the frame's top-left corner, inside the safe area. */}
            {immersive ? (
              <button
                ref={backRef}
                type="button"
                onClick={onExitImmersive}
                aria-label="Back"
                className="absolute flex h-[44px] w-[44px] items-center justify-center rounded-full text-white backdrop-blur-md transition-colors duration-200 ease-abc abc-focus-ring"
                style={{
                  top: 'calc(var(--mc-frame-top) + 8px)',
                  left: 'max(calc(var(--mc-frame-left) + 8px), env(safe-area-inset-left))',
                  background: 'rgba(10, 10, 11, 0.55)',
                }}
              >
                <IconArrowLeft size={20} stroke={2} aria-hidden="true" />
              </button>
            ) : null}
          </div>
        </div>

        {!immersive ? (
          <div className="pointer-events-none absolute inset-0 flex flex-col">
            {suggestLandscape ? <LandscapeHint onDismiss={onDismissHint} /> : null}

            <div className="flex min-h-0 flex-1 items-center justify-center px-3 pt-3 sm:px-5 sm:pt-5">
              {live ? <WideFrame /> : null}
            </div>

            <p className="shrink-0 px-4 pb-3 pt-2 text-center [text-shadow:0_1px_2px_rgba(0,0,0,0.65)]">
              <span className="block text-[13.5px] font-semibold text-white max-lg:landscape:inline">
                {capturedCount > 0
                  ? `${capturedCount} card${capturedCount === 1 ? '' : 's'} so far · ${remaining} left`
                  : `Scan up to ${MAX_BATCH_CARDS} cards at once`}
              </span>
              <span className="hidden text-white/60 max-lg:landscape:inline" aria-hidden="true">
                {' · '}
              </span>
              <span className="mt-0.5 block text-[12px] text-white/75 max-lg:landscape:mt-0 max-lg:landscape:inline">
                Keep cards flat, separated and well lit.
              </span>
            </p>
          </div>
        ) : null}

        {!live && !immersive ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center">
            <p className="text-[14px] text-abc-secondary">
              {status === 'starting' ? 'Starting camera…' : 'Camera unavailable — upload a photo instead.'}
            </p>
          </div>
        ) : null}

        {/*
          The shutter floats over the picture at the right, vertically centred
          — where the thumb is, as in the phone's own camera — and wholly inside
          the safe area. It takes no width from the camera or the frame: it sits
          over the frame's right edge, and the photo is taken of everything
          underneath it. A dark wash behind the ring keeps it readable over a
          bright table.
        */}
        {immersive ? (
          <button
            ref={shutterRef}
            type="button"
            onClick={onCapture}
            disabled={!live}
            aria-label="Capture photo"
            className="absolute top-1/2 flex h-[68px] w-[68px] -translate-y-1/2 items-center justify-center rounded-full transition-transform duration-200 ease-abc active:scale-95 disabled:opacity-40 abc-focus-ring"
            style={{
              right: 'max(calc(var(--mc-frame-right) + 10px), env(safe-area-inset-right))',
              border: '3px solid var(--abc-gold)',
              background: 'rgba(10, 10, 11, 0.35)',
              boxShadow: '0 2px 14px rgba(0, 0, 0, 0.45)',
            }}
          >
            <span className="h-[52px] w-[52px] rounded-full" style={{ background: 'var(--abc-gold)' }} />
          </button>
        ) : null}

        {immersive && immersiveError ? (
          <p
            role="alert"
            className="absolute left-1/2 top-3 max-w-[70%] -translate-x-1/2 rounded-full px-3.5 py-2 text-center text-[12.5px] backdrop-blur-md"
            style={{ background: 'rgba(10, 10, 11, 0.8)', color: '#fca5a5' }}
          >
            {immersiveError}
          </p>
        ) : null}
      </div>

      {!immersive ? (
        <div className="mt-3 flex shrink-0 flex-col gap-2 max-lg:landscape:mt-0 max-lg:landscape:w-[196px] max-lg:landscape:justify-center">
          <Button onClick={onCapture} disabled={!live || blocked || remaining <= 0} size="lg" fullWidth>
            <IconScan size={19} stroke={1.8} />
            {capturedCount > 0 ? 'Capture more cards' : 'Capture cards'}
          </Button>

          {/* Never gated on orientation: a photo already taken can be any shape. */}
          <div className="flex gap-2 max-lg:landscape:flex-col">
            <Button onClick={onPickFile} disabled={blocked || remaining <= 0} variant="surface" size="md" fullWidth>
              <IconPhoto size={17} stroke={1.8} />
              Upload a photo
            </Button>
            {onReview ? (
              <Button onClick={onReview} variant="surface" size="md" fullWidth>
                <IconLayoutGrid size={17} stroke={1.8} />
                {capturedCount > 0 ? `Review ${capturedCount}` : 'Back to review'}
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}

/**
 * The full-screen framing guide: one large rectangle and nothing inside it.
 *
 * Nearly the whole screen — a thin margin off each edge, set by
 * `IMMERSIVE_FRAME_INSETS` — so the owner can bring the phone right up to the
 * cards. Back and the shutter float over its corner and its right edge rather
 * than narrowing it. No ghost cards here: at this size they would only be
 * something to look past.
 */
function ImmersiveFrame() {
  const corner = 'absolute h-9 w-9 border-abc-gold-accent'
  return (
    <div
      className="pointer-events-none absolute rounded-[10px] border border-white/25"
      style={{
        top: 'var(--mc-frame-top)',
        bottom: 'var(--mc-frame-bottom)',
        left: 'var(--mc-frame-left)',
        right: 'var(--mc-frame-right)',
      }}
      aria-hidden="true"
    >
      <span className={`${corner} -left-px -top-px rounded-tl-[10px] border-l-[3px] border-t-[3px]`} />
      <span className={`${corner} -right-px -top-px rounded-tr-[10px] border-r-[3px] border-t-[3px]`} />
      <span className={`${corner} -bottom-px -left-px rounded-bl-[10px] border-b-[3px] border-l-[3px]`} />
      <span className={`${corner} -bottom-px -right-px rounded-br-[10px] border-b-[3px] border-r-[3px]`} />
    </div>
  )
}

/**
 * Turn the phone sideways — a suggestion, never a gate.
 *
 * Ten cards laid out on a table are wider than they are tall, and an upright
 * phone spends most of its pixels on the table above and below them, which is
 * what made small print unreadable in the first real test. Not a modal: it
 * takes no focus and blocks nothing, so rotation lock, an upload, or simply
 * preferring portrait all still work. It goes the moment the phone turns, and
 * stays gone once dismissed.
 */
function LandscapeHint({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div
      role="status"
      className="pointer-events-auto mx-3 mt-3 flex shrink-0 items-start gap-3 rounded-inner py-2 pl-3 pr-1 backdrop-blur-md"
      style={{ background: 'rgba(10, 10, 11, 0.78)', border: '1px solid var(--abc-border)' }}
    >
      <span
        className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
        style={{ background: 'var(--abc-gold-soft)', border: '1px solid var(--abc-gold-border)' }}
      >
        <IconDeviceMobileRotated
          size={18}
          stroke={1.8}
          aria-hidden="true"
          style={{ color: 'var(--abc-gold-accent)' }}
        />
      </span>
      <span className="min-w-0 flex-1 py-1">
        <span className="block text-[14px] font-semibold text-abc-text">Turn your phone sideways</span>
        <span className="mt-0.5 block text-[12.5px] leading-[1.45] text-abc-secondary">
          Fit all cards in the frame and leave a little space between them.
        </span>
      </span>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss rotation tip"
        className="flex h-[44px] w-[44px] shrink-0 items-center justify-center rounded-full text-abc-muted transition-colors duration-200 ease-abc hover:text-abc-text abc-focus-ring"
      >
        <IconX size={16} stroke={2} aria-hidden="true" />
      </button>
    </div>
  )
}

/**
 * The multi-card guide: a wide tabletop, with the faint outline of six cards
 * laid out on it.
 *
 * It says "several, side by side, with room between them" before a word is
 * read — the one thing the single-card guide must not say, which is why the
 * two are separate components and the single-card one is untouched. As wide
 * as the viewfinder allows, so the owner can come closer to the cards instead
 * of stepping back to fit them in.
 */
function WideFrame() {
  const corner = 'absolute h-8 w-8 border-abc-gold-accent/80'
  return (
    <div className="relative aspect-[3/2] max-h-full w-full [container-type:size]">
      <span className={`${corner} left-0 top-0 rounded-tl-lg border-l-2 border-t-2`} />
      <span className={`${corner} right-0 top-0 rounded-tr-lg border-r-2 border-t-2`} />
      <span className={`${corner} bottom-0 left-0 rounded-bl-lg border-b-2 border-l-2`} />
      <span className={`${corner} bottom-0 right-0 rounded-br-lg border-b-2 border-r-2`} />
      <div
        className="absolute inset-0 grid grid-cols-[repeat(3,auto)] place-content-center gap-x-[3cqw] gap-y-[5cqh]"
        aria-hidden="true"
      >
        {Array.from({ length: 6 }, (_, index) => (
          <span
            key={index}
            className="aspect-[85/55] w-[min(24cqw,54cqh)] rounded-[4px] border border-dashed border-white/25"
          />
        ))}
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
