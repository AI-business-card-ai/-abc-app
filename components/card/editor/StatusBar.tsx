'use client'

import { IconCheck, IconCopy, IconExternalLink, IconQrcode } from '@tabler/icons-react'

/**
 * Draft / Live status and the public address, kept at the top of the editor —
 * in the old build this lived at the very bottom, so most people never found
 * out whether their card was actually live.
 */
export default function StatusBar({
  published,
  slug,
  publicUrl,
  copied,
  onCopy,
  onShowQr,
}: {
  published: boolean
  slug: string
  publicUrl: string
  copied: boolean
  onCopy: () => void
  onShowQr: () => void
}) {
  const live = published && Boolean(slug)

  return (
    <div className="rounded-card border border-abc-border bg-abc-card p-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span
          className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11.5px] font-semibold uppercase tracking-[0.1em]"
          style={{
            background: live ? 'var(--abc-gold-soft)' : 'var(--abc-raised)',
            borderColor: live ? 'var(--abc-gold-border)' : 'var(--abc-border)',
            color: live ? 'var(--abc-gold-accent)' : 'var(--abc-text-muted)',
          }}
        >
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{ background: live ? 'var(--abc-gold-accent)' : 'var(--abc-text-muted)' }}
            aria-hidden="true"
          />
          {live ? 'Live' : 'Draft'}
        </span>

        {slug ? (
          <span className="min-w-0 flex-1 truncate text-[12.5px] text-abc-secondary">
            {publicUrl.replace(/^https?:\/\//, '')}
          </span>
        ) : (
          <span className="min-w-0 flex-1 text-[12.5px] text-abc-muted">
            Pick a card address below
          </span>
        )}
      </div>

      {slug ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onCopy}
            className="inline-flex h-[44px] items-center gap-1.5 rounded-btn border border-abc-border bg-abc-raised px-3 text-[13px] font-medium text-abc-text transition-colors hover:border-abc-border-strong abc-focus-ring"
          >
            {copied ? <IconCheck size={15} stroke={2.1} /> : <IconCopy size={15} stroke={1.8} />}
            {copied ? 'Copied' : 'Copy link'}
          </button>

          <button
            type="button"
            onClick={onShowQr}
            disabled={!live}
            title={live ? undefined : 'Publish your card to get a scannable QR'}
            className="inline-flex h-[44px] items-center gap-1.5 rounded-btn border border-abc-border bg-abc-raised px-3 text-[13px] font-medium text-abc-text transition-colors hover:border-abc-border-strong disabled:opacity-45 abc-focus-ring"
          >
            <IconQrcode size={15} stroke={1.8} />
            Show QR
          </button>

          {live ? (
            <a
              href={publicUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-[44px] items-center gap-1.5 rounded-btn border border-abc-border bg-abc-raised px-3 text-[13px] font-medium text-abc-text transition-colors hover:border-abc-border-strong abc-focus-ring"
            >
              <IconExternalLink size={15} stroke={1.8} />
              Open
            </a>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
