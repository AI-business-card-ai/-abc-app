'use client'

import { useEffect, useRef } from 'react'
import jsQR from 'jsqr'

type BarcodeDetectorLike = {
  detect: (source: CanvasImageSource) => Promise<{ rawValue: string }[]>
}

type BarcodeDetectorCtor = new (options?: { formats?: string[] }) => BarcodeDetectorLike

/**
 * Continuous QR detection over a live <video>.
 *
 * Uses the native BarcodeDetector where it exists (Chrome / Edge / Android) and
 * falls back to jsQR everywhere else — notably Safari on iOS, which has no
 * BarcodeDetector and is the most common device at an event.
 */
export function useQrScanner(
  videoRef: React.RefObject<HTMLVideoElement>,
  enabled: boolean,
  onDetected: (value: string) => void
) {
  const callbackRef = useRef(onDetected)
  callbackRef.current = onDetected

  useEffect(() => {
    if (!enabled) return
    if (typeof window === 'undefined') return

    let cancelled = false
    let rafId = 0
    let detector: BarcodeDetectorLike | null = null
    let lastRun = 0

    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d', { willReadFrequently: true })

    const Ctor = (window as unknown as { BarcodeDetector?: BarcodeDetectorCtor })
      .BarcodeDetector
    if (Ctor) {
      try {
        detector = new Ctor({ formats: ['qr_code'] })
      } catch {
        detector = null
      }
    }

    async function tick(timestamp: number) {
      if (cancelled) return

      // ~8 scans/second is responsive without pinning the main thread.
      if (timestamp - lastRun < 120) {
        rafId = requestAnimationFrame(tick)
        return
      }
      lastRun = timestamp

      const video = videoRef.current
      if (!video || video.readyState < 2 || !video.videoWidth) {
        rafId = requestAnimationFrame(tick)
        return
      }

      try {
        if (detector) {
          const codes = await detector.detect(video)
          const value = codes[0]?.rawValue
          if (value && !cancelled) {
            callbackRef.current(value)
            // Keep looping: the consumer debounces repeats and disables us via
            // `enabled` when it acts. Returning here would kill detection for
            // good whenever a debounced repeat swallowed the result.
            rafId = requestAnimationFrame(tick)
            return
          }
        } else if (ctx) {
          // Downscale: jsQR is CPU-bound and does not need full resolution.
          const scale = Math.min(1, 640 / video.videoWidth)
          canvas.width = Math.round(video.videoWidth * scale)
          canvas.height = Math.round(video.videoHeight * scale)
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
          const image = ctx.getImageData(0, 0, canvas.width, canvas.height)
          const found = jsQR(image.data, image.width, image.height, {
            inversionAttempts: 'dontInvert',
          })
          if (found?.data && !cancelled) {
            callbackRef.current(found.data)
            rafId = requestAnimationFrame(tick)
            return
          }
        }
      } catch {
        /* a failed frame is not fatal — keep scanning */
      }

      rafId = requestAnimationFrame(tick)
    }

    rafId = requestAnimationFrame(tick)

    return () => {
      cancelled = true
      cancelAnimationFrame(rafId)
    }
  }, [enabled, videoRef])
}

/** True when this browser can decode QR codes at all (always true — jsQR fallback). */
export function qrScanningSupported(): boolean {
  return typeof window !== 'undefined'
}
