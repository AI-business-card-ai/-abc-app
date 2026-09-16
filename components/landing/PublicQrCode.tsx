'use client'

import { useEffect, useState } from 'react'
import QRCode from 'qrcode'

/**
 * A real QR code, rendered in the public palette.
 *
 * The repository already had one of these for the old landing page, hard-coded
 * to a pink-and-cyan caption and the previous brand's near-black. This one
 * draws the same canonical demo URL with dark modules on white, because a QR
 * has to be high-contrast to actually scan — tinting the modules gold would be
 * a decorative choice that breaks the one thing the graphic is for.
 *
 * Painted as a background image rather than an <img>. The generated value is a
 * data: URL, which has no origin for next/image to optimise and would trip its
 * lint rule for nothing; a background also means the box is sized and reserved
 * by CSS before the code resolves, so the panel around it never reflows.
 *
 * Generated from the `qrcode` dependency the product already ships, and loaded
 * dynamically at the call site so it never blocks first paint.
 */
export default function PublicQrCode({
  value,
  size = 172,
  label,
}: {
  value: string
  size?: number
  /** Accessible name. Omit when the URL is also shown as text beside it. */
  label?: string
}) {
  const [dataUrl, setDataUrl] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    QRCode.toDataURL(value, {
      width: size * 2,
      margin: 1,
      errorCorrectionLevel: 'M',
      color: { dark: '#0a0a0b', light: '#ffffff' },
    })
      .then((url) => {
        if (active) setDataUrl(url)
      })
      .catch(() => {
        // A failed QR leaves a clean empty frame rather than a broken image or
        // a console error on a marketing page.
        if (active) setDataUrl(null)
      })
    return () => {
      active = false
    }
  }, [value, size])

  return (
    <div
      className="pub-qr"
      style={{
        width: size,
        height: size,
        backgroundImage: dataUrl ? `url(${dataUrl})` : undefined,
      }}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    />
  )
}
