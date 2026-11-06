'use client'

import dynamic from 'next/dynamic'
import { useEffect, useRef, type ReactNode } from 'react'
import { REDUCED_MOTION_QUERY, matches, observe, supportsObserver } from '@/components/landing/cinema/observe'
import { MEDIA, hasMedia, isVideo, type MediaSlotId } from '@/lib/landing/media'

/* Fetched only when a slot has an image: an empty slot costs the page nothing. */
const SlotImage = dynamic(() => import('@/components/landing/SlotImage'))

/**
 * One media slot, rendered only once an approved asset exists.
 *
 * Until then it renders `fallback` — the composition the section already has —
 * so a section can sit in a slot today and switch to the real asset by a data
 * edit in lib/landing/media.ts, with no redesign and no placeholder frame on
 * the live page.
 *
 * Images go through next/image at their intrinsic size, so their space is
 * reserved and nothing shifts; an SVG (the logo) is served as it is. A video
 * plays muted and inline only while it is on screen, and never under reduced
 * motion, where its poster stands in.
 */
export default function MediaSlot({
  id,
  className,
  sizes,
  priority = false,
  fallback = null,
}: {
  id: MediaSlotId
  className?: string
  /** The rendered width at each breakpoint, for responsive images. */
  sizes?: string
  /** Only for an asset above the fold, such as the hero. */
  priority?: boolean
  fallback?: ReactNode
}) {
  if (!hasMedia(id)) return <>{fallback}</>

  const asset = MEDIA[id]
  const src = asset.src as string
  const width = asset.width as number
  const height = asset.height as number
  const alt = asset.alt as string

  if (isVideo(src)) {
    return (
      <SlotVideo
        src={src}
        poster={asset.poster as string}
        width={width}
        height={height}
        label={alt}
        className={className}
      />
    )
  }

  return (
    <SlotImage
      src={src}
      width={width}
      height={height}
      alt={alt}
      sizes={sizes}
      priority={priority}
      className={className}
    />
  )
}

function SlotVideo({
  src,
  poster,
  width,
  height,
  label,
  className,
}: {
  src: string
  poster: string
  width: number
  height: number
  label: string
  className?: string
}) {
  const ref = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    const video = ref.current
    if (!video || matches(REDUCED_MOTION_QUERY)) return

    const play = () => {
      video.play().catch(() => undefined)
    }
    if (!supportsObserver()) {
      play()
      return
    }
    return observe(video, { threshold: [0, 0.25] }, (entry) => {
      if (entry.isIntersecting && entry.intersectionRatio >= 0.25) play()
      else video.pause()
    })
  }, [])

  return (
    <video
      ref={ref}
      src={src}
      poster={poster}
      width={width}
      height={height}
      className={className}
      aria-label={label}
      muted
      loop
      playsInline
      preload="metadata"
    />
  )
}
