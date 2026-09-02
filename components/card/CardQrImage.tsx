import { CARD_PUBLIC_BASE } from '@/lib/card/types'

/**
 * The card's QR, on its white plate.
 *
 * There is one QR generator and it is the server: `/api/card/qr/[slug]` encodes
 * the public card URL with a fixed margin, near-black on white, at whatever
 * pixel size is asked for. Nothing on the client draws a QR, and this component
 * exists so nothing starts to — the fullscreen modal and the inline preview in
 * presentation mode are the same picture of the same value at two sizes.
 *
 * The white plate is not decoration. It is the quiet zone a scanner needs, and
 * it is why the plate stays pure white and the modules stay dark whatever the
 * surrounding surface is doing: a gold-tinted QR reads worse, and reading is
 * the entire job.
 */

/** The one place a QR URL is built. */
export function cardQrSrc(slug: string, size: number): string {
  return `/api/card/qr/${encodeURIComponent(slug)}?size=${size}`
}

/** Where that QR points — the same address the server encodes. */
export function cardPublicUrl(slug: string): string {
  return `${CARD_PUBLIC_BASE}/${slug}`
}

export default function CardQrImage({
  slug,
  /** Rendered width. `size` is what the server is asked to draw, in pixels. */
  width,
  size = 1024,
  className,
}: {
  slug: string
  width: string
  size?: number
  className?: string
}) {
  if (!slug) return null

  return (
    <div
      className={`rounded-[20px] bg-white p-4 sm:p-5 ${className ?? ''}`}
      style={{ lineHeight: 0, width }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={cardQrSrc(slug, size)}
        alt={`QR code linking to ${cardPublicUrl(slug)}`}
        width={size}
        height={size}
        className="block h-auto w-full"
        style={{ aspectRatio: '1 / 1' }}
      />
    </div>
  )
}
