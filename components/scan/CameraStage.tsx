'use client'

import { useRef } from 'react'
import {
  IconAlertTriangle,
  IconCamera,
  IconCameraOff,
  IconPhoto,
  IconLock,
} from '@tabler/icons-react'
import Button from '@/components/ui/abc/Button'
import type { CameraStatus } from '@/lib/scan/useCamera'
import type { CaptureMode } from '@/lib/scan/modes'
import { CAPTURE_MODES } from '@/lib/scan/modes'

export default function CameraStage({
  videoRef,
  status,
  mode,
  onModeChange,
  onCapture,
  onFile,
  statusText,
  busy,
  blocked,
}: {
  videoRef: React.RefObject<HTMLVideoElement>
  status: CameraStatus
  mode: CaptureMode
  onModeChange: (mode: CaptureMode) => void
  onCapture: () => void
  onFile: (file: File) => void
  statusText: string
  busy: boolean
  blocked: boolean
}) {
  const uploadRef = useRef<HTMLInputElement>(null)
  const fallbackCameraRef = useRef<HTMLInputElement>(null)

  const live = status === 'live'
  const cameraFailed = status === 'denied' || status === 'unavailable' || status === 'error'

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (file) onFile(file)
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Viewfinder */}
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

        {live ? <Guides /> : null}

        {status === 'starting' ? (
          <Overlay>
            <p className="text-[14px] text-abc-secondary">Starting camera…</p>
          </Overlay>
        ) : null}

        {cameraFailed ? (
          <Overlay>
            <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-full border border-abc-border bg-abc-raised">
              {status === 'denied' ? (
                <IconLock size={22} stroke={1.6} className="text-abc-muted" />
              ) : (
                <IconCameraOff size={22} stroke={1.6} className="text-abc-muted" />
              )}
            </span>
            <p className="text-[15px] font-semibold text-abc-text">
              {status === 'denied' ? 'Camera access is blocked' : 'No camera available'}
            </p>
            <p className="mt-1.5 max-w-[32ch] text-[13px] leading-[1.55] text-abc-secondary">
              {status === 'denied'
                ? 'Allow camera access in your browser settings, or take a photo instead.'
                : 'Take a photo with your device camera or upload an existing image.'}
            </p>
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              <Button variant="surface" onClick={() => fallbackCameraRef.current?.click()}>
                <IconCamera size={18} stroke={1.8} />
                Take photo
              </Button>
              <Button variant="surface" onClick={() => uploadRef.current?.click()}>
                <IconPhoto size={18} stroke={1.8} />
                Upload image
              </Button>
            </div>
          </Overlay>
        ) : null}

        {/* Status pill */}
        {live ? (
          <div className="pointer-events-none absolute inset-x-0 bottom-4 flex justify-center px-4">
            <span
              className="rounded-full px-3.5 py-2 text-[12.5px] font-medium text-abc-text backdrop-blur-md"
              style={{ background: 'rgba(10,10,11,0.72)', border: '1px solid var(--abc-border)' }}
            >
              {statusText}
            </span>
          </div>
        ) : null}
      </div>

      {/* Capture modes */}
      <div className="abc-scroll-x mt-4 shrink-0">
        <div className="flex gap-2">
          {CAPTURE_MODES.map((item) => {
            const active = item.id === mode
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onModeChange(item.id)}
                aria-pressed={active}
                className={`shrink-0 whitespace-nowrap rounded-full border px-3.5 py-2 text-[12.5px] font-medium transition-colors duration-200 ease-abc abc-focus-ring ${
                  active
                    ? 'border-transparent text-[#1a1205]'
                    : 'border-abc-border bg-abc-raised text-abc-secondary hover:border-abc-border-strong hover:text-abc-text'
                }`}
                style={active ? { background: 'var(--abc-gold)' } : undefined}
              >
                {item.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Controls */}
      <div className="mt-4 flex shrink-0 items-center gap-3">
        <button
          type="button"
          onClick={() => uploadRef.current?.click()}
          disabled={busy || blocked}
          aria-label="Upload image"
          className="flex h-[60px] w-[60px] shrink-0 items-center justify-center rounded-full border border-abc-border bg-abc-raised text-abc-secondary transition-colors duration-200 ease-abc hover:border-abc-border-strong hover:text-abc-text disabled:opacity-40 abc-focus-ring"
        >
          <IconPhoto size={22} stroke={1.7} />
        </button>

        <button
          type="button"
          onClick={live ? onCapture : () => fallbackCameraRef.current?.click()}
          disabled={busy || blocked}
          aria-label="Capture"
          className="relative mx-auto flex h-[72px] w-[72px] items-center justify-center rounded-full transition-transform duration-200 ease-abc active:scale-95 disabled:opacity-40 abc-focus-ring"
          style={{ border: '3px solid var(--abc-gold)' }}
        >
          <span
            className="h-[56px] w-[56px] rounded-full transition-transform duration-200 ease-abc"
            style={{ background: 'var(--abc-gold)' }}
          />
        </button>

        {/* Balances the shutter; keeps it centred */}
        <span className="h-[60px] w-[60px] shrink-0" aria-hidden="true" />
      </div>

      {blocked ? (
        <p className="mt-3 flex items-center justify-center gap-1.5 text-[12.5px] text-abc-secondary">
          <IconAlertTriangle size={15} stroke={1.8} style={{ color: 'var(--abc-overdue)' }} />
          Scan limit reached on your plan.
        </p>
      ) : null}

      <input
        ref={uploadRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFile}
      />
      <input
        ref={fallbackCameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleFile}
      />
    </div>
  )
}

function Overlay({ children }: { children: React.ReactNode }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
      {children}
    </div>
  )
}

/** Thin gold corner guides — no HUD, no sweep animation. */
function Guides() {
  const base =
    'pointer-events-none absolute h-7 w-7 border-abc-gold-accent/80 transition-opacity duration-300'
  return (
    <div className="pointer-events-none absolute inset-6 sm:inset-10">
      <span className={`${base} left-0 top-0 rounded-tl-lg border-l-2 border-t-2`} />
      <span className={`${base} right-0 top-0 rounded-tr-lg border-r-2 border-t-2`} />
      <span className={`${base} bottom-0 left-0 rounded-bl-lg border-b-2 border-l-2`} />
      <span className={`${base} bottom-0 right-0 rounded-br-lg border-b-2 border-r-2`} />
    </div>
  )
}
