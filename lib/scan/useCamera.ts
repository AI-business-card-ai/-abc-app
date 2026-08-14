'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

export type CameraStatus =
  | 'idle'
  | 'starting'
  | 'live'
  | 'denied'
  | 'unavailable'
  | 'error'

/**
 * Live rear-camera stream via getUserMedia.
 *
 * The previous scanner used <input capture="environment">, which hands off to
 * the OS camera app — that cannot show a viewfinder or detect a QR in real
 * time. This hook owns the stream; callers get a <video> ref plus a frame
 * grabber. If getUserMedia is unavailable or refused, status reports why and
 * the page falls back to file capture.
 */
export function useCamera(active: boolean) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [status, setStatus] = useState<CameraStatus>('idle')

  const stop = useCallback(() => {
    const stream = streamRef.current
    if (stream) {
      stream.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }
    if (videoRef.current) videoRef.current.srcObject = null
  }, [])

  useEffect(() => {
    if (!active) {
      stop()
      setStatus('idle')
      return
    }

    let cancelled = false

    async function start() {
      if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
        setStatus('unavailable')
        return
      }

      setStatus('starting')

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
          audio: false,
        })

        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop())
          return
        }

        streamRef.current = stream
        const video = videoRef.current
        if (video) {
          video.srcObject = stream
          // iOS Safari requires the inline attributes before play() resolves.
          video.setAttribute('playsinline', 'true')
          video.muted = true
          await video.play().catch(() => {
            /* autoplay rejection is recoverable — the frame still renders */
          })
        }
        if (!cancelled) setStatus('live')
      } catch (err) {
        if (cancelled) return
        const name = (err as Error)?.name
        if (name === 'NotAllowedError' || name === 'SecurityError') setStatus('denied')
        else if (name === 'NotFoundError' || name === 'OverconstrainedError') setStatus('unavailable')
        else setStatus('error')
      }
    }

    void start()

    return () => {
      cancelled = true
      stop()
    }
  }, [active, stop])

  /** Grab the current frame as a JPEG File, at native video resolution. */
  const captureFrame = useCallback(async (): Promise<File | null> => {
    const video = videoRef.current
    if (!video || !video.videoWidth) return null

    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.92)
    )
    if (!blob) return null

    return new File([blob], `scan-${Date.now()}.jpg`, { type: 'image/jpeg' })
  }, [])

  return { videoRef, status, captureFrame, stop }
}
