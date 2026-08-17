'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { IconChevronLeft, IconChevronRight, IconX } from '@tabler/icons-react'
import type { ShowcaseItem } from '@/lib/card/showcase'

/**
 * Full-screen image viewer for the public Showcase.
 *
 * No authentication, no chrome from the signed-in app — a visitor who scanned
 * a QR code gets the photograph and nothing else. object-contain because a
 * booth panorama and a portrait screenshot must both survive the same frame.
 */
export default function ShowcaseViewer({
  items,
  index,
  onClose,
  onIndex,
}: {
  items: ShowcaseItem[]
  index: number
  onClose: () => void
  onIndex: (next: number) => void
}) {
  const touchStart = useRef<{ x: number; y: number } | null>(null)
  const [loaded, setLoaded] = useState(false)

  const go = useCallback(
    (delta: number) => {
      const next = (index + delta + items.length) % items.length
      setLoaded(false)
      onIndex(next)
    },
    [index, items.length, onIndex]
  )

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowRight') go(1)
      else if (e.key === 'ArrowLeft') go(-1)
    }
    window.addEventListener('keydown', onKey)

    // The page behind must not scroll while the viewer owns the screen.
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = previous
    }
  }, [go, onClose])

  const item = items[index]
  if (!item) return null

  const single = items.length < 2

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Image ${index + 1} of ${items.length}`}
      onClick={onClose}
      onTouchStart={(e) => {
        const t = e.touches[0]
        touchStart.current = { x: t.clientX, y: t.clientY }
      }}
      onTouchEnd={(e) => {
        const start = touchStart.current
        touchStart.current = null
        if (!start || single) return
        const t = e.changedTouches[0]
        const dx = t.clientX - start.x
        const dy = t.clientY - start.y
        // Horizontal intent only — a vertical flick should not change image.
        if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) go(dx < 0 ? 1 : -1)
      }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        background: 'rgba(0,0,0,0.94)',
        display: 'flex',
        flexDirection: 'column',
        touchAction: 'pan-y',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '14px 16px',
          gap: 12,
        }}
      >
        <span
          style={{
            fontSize: 13,
            color: 'rgba(255,255,255,0.7)',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {index + 1} / {items.length}
        </span>
        <button
          type="button"
          aria-label="Close"
          onClick={(e) => {
            e.stopPropagation()
            onClose()
          }}
          style={{
            width: 44,
            height: 44,
            borderRadius: '50%',
            border: '1px solid rgba(255,255,255,0.18)',
            background: 'rgba(255,255,255,0.06)',
            color: '#fff',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
          }}
        >
          <IconX size={20} stroke={1.9} />
        </button>
      </div>

      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '0 12px',
          position: 'relative',
        }}
      >
        {!single ? (
          <ViewerArrow side="left" onClick={() => go(-1)} />
        ) : null}

        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          key={item.image_url}
          src={item.image_url}
          alt={item.caption || ''}
          onClick={(e) => e.stopPropagation()}
          onLoad={() => setLoaded(true)}
          style={{
            maxWidth: '100%',
            maxHeight: '100%',
            objectFit: 'contain',
            borderRadius: 8,
            opacity: loaded ? 1 : 0,
            transition: 'opacity 160ms ease-out',
          }}
        />

        {!single ? <ViewerArrow side="right" onClick={() => go(1)} /> : null}
      </div>

      <div style={{ minHeight: 56, padding: '14px 20px 22px', textAlign: 'center' }}>
        {item.caption ? (
          <p
            style={{
              margin: 0,
              fontSize: 13.5,
              lineHeight: 1.5,
              color: 'rgba(255,255,255,0.82)',
              maxWidth: 560,
              marginInline: 'auto',
            }}
          >
            {item.caption}
          </p>
        ) : null}
      </div>
    </div>
  )
}

function ViewerArrow({ side, onClick }: { side: 'left' | 'right'; onClick: () => void }) {
  const Icon = side === 'left' ? IconChevronLeft : IconChevronRight
  return (
    <button
      type="button"
      aria-label={side === 'left' ? 'Previous image' : 'Next image'}
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      style={{
        position: 'absolute',
        [side]: 8,
        top: '50%',
        transform: 'translateY(-50%)',
        width: 44,
        height: 44,
        borderRadius: '50%',
        border: '1px solid rgba(255,255,255,0.18)',
        background: 'rgba(0,0,0,0.45)',
        color: '#fff',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
      }}
    >
      <Icon size={22} stroke={1.9} />
    </button>
  )
}
