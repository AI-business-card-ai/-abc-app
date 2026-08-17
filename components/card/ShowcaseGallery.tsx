'use client'

import { useState } from 'react'
import ShowcaseViewer from '@/components/card/ShowcaseViewer'
import type { ShowcaseItem } from '@/lib/card/showcase'
import type { CardThemeTokens } from '@/lib/card/theme'

/**
 * The public Showcase.
 *
 * Compact by design: a business card that opens into eight full-width photos
 * has stopped being a business card. The layout adapts to how many images
 * exist — one gets a feature frame, two share a row, three lead with a feature
 * — and beyond five the grid stops growing and hands the rest to the viewer,
 * which is where all eight are always reachable.
 *
 * Grid tiles are object-cover so the mosaic stays even; the viewer is
 * object-contain so nothing is ever cropped away from the actual work.
 */
export default function ShowcaseGallery({
  title,
  items,
  tokens,
  accent,
}: {
  title: string
  items: ShowcaseItem[]
  tokens: CardThemeTokens
  accent: string
}) {
  const [viewerAt, setViewerAt] = useState<number | null>(null)

  if (items.length === 0) return null

  const count = items.length
  // Five tiles is the point where a phone still reads the section as one
  // glance rather than a feed.
  const visible = count <= 3 ? count : Math.min(count, 5)
  const hidden = count - visible
  const shown = items.slice(0, visible)

  const featureFirst = count === 1 || count === 3 || count >= 4
  const feature = featureFirst ? shown[0] : null
  const rest = featureFirst ? shown.slice(1) : shown

  return (
    <section style={{ marginTop: 26 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
        <h2
          style={{
            margin: 0,
            fontSize: 11,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            color: tokens.muted,
            fontWeight: 600,
          }}
        >
          {title}
        </h2>
        {count > 1 ? (
          <span style={{ fontSize: 11.5, color: tokens.muted, fontVariantNumeric: 'tabular-nums' }}>
            {count}
          </span>
        ) : null}
      </div>

      <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {feature ? (
          <Tile
            item={feature}
            index={0}
            ratio={count === 1 ? '4 / 3' : '16 / 10'}
            priority
            tokens={tokens}
            onOpen={setViewerAt}
          />
        ) : null}

        {rest.length > 0 ? (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {rest.map((item, i) => {
              const index = featureFirst ? i + 1 : i
              const isLastVisible = index === visible - 1
              return (
                <Tile
                  key={item.id}
                  item={item}
                  index={index}
                  ratio="1 / 1"
                  tokens={tokens}
                  overlayCount={isLastVisible && hidden > 0 ? hidden : 0}
                  onOpen={setViewerAt}
                />
              )
            })}
          </div>
        ) : null}
      </div>

      {hidden > 0 ? (
        <button
          type="button"
          className="interactive"
          onClick={() => setViewerAt(0)}
          style={{
            width: '100%',
            minHeight: 46,
            marginTop: 10,
            borderRadius: 12,
            border: `1px solid ${tokens.border}`,
            background: tokens.surface,
            color: accent,
            fontWeight: 600,
            fontSize: 13.5,
            cursor: 'pointer',
          }}
        >
          View all {count}
        </button>
      ) : null}

      {viewerAt !== null ? (
        <ShowcaseViewer
          items={items}
          index={viewerAt}
          onIndex={setViewerAt}
          onClose={() => setViewerAt(null)}
        />
      ) : null}
    </section>
  )
}

function Tile({
  item,
  index,
  ratio,
  tokens,
  priority = false,
  overlayCount = 0,
  onOpen,
}: {
  item: ShowcaseItem
  index: number
  ratio: string
  tokens: CardThemeTokens
  priority?: boolean
  overlayCount?: number
  onOpen: (index: number) => void
}) {
  return (
    <button
      type="button"
      onClick={() => onOpen(index)}
      aria-label={item.caption || `Open image ${index + 1}`}
      style={{
        position: 'relative',
        display: 'block',
        width: '100%',
        aspectRatio: ratio,
        padding: 0,
        overflow: 'hidden',
        borderRadius: 12,
        border: `1px solid ${tokens.border}`,
        background: tokens.surface,
        cursor: 'pointer',
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={item.image_url}
        alt={item.caption || ''}
        // The first tile is above the fold once someone scrolls to the
        // section; the rest wait until they are actually approached, so a
        // gallery never costs eight downloads on a fair's wifi.
        loading={priority ? 'eager' : 'lazy'}
        decoding="async"
        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
      />

      {overlayCount > 0 ? (
        <span
          style={{
            position: 'absolute',
            inset: 0,
            background: 'rgba(0,0,0,0.55)',
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 17,
            fontWeight: 600,
          }}
        >
          +{overlayCount}
        </span>
      ) : null}

      {item.caption && !overlayCount ? (
        <span
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            padding: '18px 10px 8px',
            background: 'linear-gradient(180deg, transparent, rgba(0,0,0,0.72))',
            color: '#fff',
            fontSize: 11.5,
            lineHeight: 1.35,
            textAlign: 'left',
            display: 'block',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {item.caption}
        </span>
      ) : null}
    </button>
  )
}
