'use client'

import { IconExternalLink, IconId, IconQrcode, IconX } from '@tabler/icons-react'
import Button from '@/components/ui/abc/Button'
import type { QrResult } from '@/lib/scan/qr-parse'

/**
 * What we found in a QR code. External links are never followed automatically —
 * the destination host is shown first.
 */
export default function QrSheet({
  result,
  onDismiss,
}: {
  result: Exclude<QrResult, { kind: 'contact' }>
  onDismiss: () => void
}) {
  return (
    <div
      className="fixed inset-0 z-[110] flex items-end justify-center sm:items-center"
      style={{ background: 'rgba(4,4,5,0.72)' }}
      role="dialog"
      aria-modal="true"
      aria-label="QR code detected"
    >
      <div
        className="w-full max-w-[440px] rounded-t-card border border-abc-border bg-abc-card p-5 sm:rounded-card"
        style={{ paddingBottom: 'calc(1.25rem + env(safe-area-inset-bottom))' }}
      >
        <div className="flex items-start justify-between gap-3">
          <span
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full"
            style={{ background: 'var(--abc-gold-soft)' }}
          >
            {result.kind === 'abc_card' ? (
              <IconId size={22} stroke={1.7} style={{ color: 'var(--abc-gold-accent)' }} />
            ) : (
              <IconQrcode size={22} stroke={1.7} style={{ color: 'var(--abc-gold-accent)' }} />
            )}
          </span>
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Dismiss"
            className="flex h-9 w-9 items-center justify-center rounded-full text-abc-muted transition-colors hover:text-abc-text abc-focus-ring"
          >
            <IconX size={19} stroke={1.8} />
          </button>
        </div>

        {result.kind === 'abc_card' ? (
          <>
            <h2 className="mt-3.5 text-[19px] font-bold text-abc-text">ABC Card detected</h2>
            <p className="mt-1.5 text-[13.5px] leading-[1.55] text-abc-secondary">
              Their details could not be read automatically — the card may be unpublished. Open it
              to see what they share.
            </p>
            <p className="mt-3 truncate rounded-inner border border-abc-border bg-abc-raised px-3 py-2.5 text-[13px] text-abc-secondary">
              {result.url}
            </p>
            <div className="mt-4 flex flex-col gap-2">
              <Button href={result.url} size="lg" fullWidth>
                Open card
              </Button>
              <Button onClick={onDismiss} variant="surface" size="lg" fullWidth>
                Keep scanning
              </Button>
            </div>
          </>
        ) : null}

        {result.kind === 'url' ? (
          <>
            <h2 className="mt-3.5 text-[19px] font-bold text-abc-text">Link detected</h2>
            <p className="mt-1.5 text-[13.5px] leading-[1.55] text-abc-secondary">
              This QR points to an external site. Check the address before opening it.
            </p>
            <p className="mt-3 rounded-inner border border-abc-border bg-abc-raised px-3 py-2.5">
              <span className="block text-[12px] text-abc-muted">{result.host}</span>
              <span className="mt-0.5 block break-all text-[13px] text-abc-secondary">
                {result.url}
              </span>
            </p>
            <div className="mt-4 flex flex-col gap-2">
              <a
                href={result.url}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="inline-flex h-[52px] w-full items-center justify-center gap-2 rounded-btn bg-abc-gold text-[15px] font-semibold text-[#1a1205] transition-[filter] duration-200 ease-abc hover:brightness-[1.06] abc-focus-ring"
              >
                <IconExternalLink size={18} stroke={1.8} />
                Open link
              </a>
              <Button onClick={onDismiss} variant="surface" size="lg" fullWidth>
                Keep scanning
              </Button>
            </div>
          </>
        ) : null}

        {result.kind === 'text' ? (
          <>
            <h2 className="mt-3.5 text-[19px] font-bold text-abc-text">QR code read</h2>
            <p className="mt-1.5 text-[13.5px] leading-[1.55] text-abc-secondary">
              It does not contain contact details or a link.
            </p>
            <p className="mt-3 max-h-32 overflow-y-auto whitespace-pre-wrap break-all rounded-inner border border-abc-border bg-abc-raised px-3 py-2.5 text-[13px] text-abc-secondary">
              {result.text}
            </p>
            <div className="mt-4">
              <Button onClick={onDismiss} variant="surface" size="lg" fullWidth>
                Keep scanning
              </Button>
            </div>
          </>
        ) : null}
      </div>
    </div>
  )
}
