'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  IconAddressBook,
  IconAlertCircle,
  IconCheck,
  IconCopy,
  IconDownload,
  IconExternalLink,
  IconPencil,
  IconQrcode,
  IconShare,
  IconWallet,
} from '@tabler/icons-react'
import CardQrModal from '@/components/card/CardQrModal'
import CardPreview from '@/components/my-card/CardPreview'
import Button from '@/components/ui/abc/Button'
import { EmptyState, SectionLabel } from '@/components/ui/abc/Bits'
import { createClientComponent } from '@/lib/supabase'
import type { CardAnalytics } from '@/lib/card/types'
import type { MyCardData } from '@/lib/my-card-data'

/** Identity fields a card needs before it is worth handing to someone. */
function missingEssentials(data: MyCardData): string[] {
  const { card } = data
  const missing: string[] = []
  if (!card.jobTitle) missing.push('role')
  if (!card.companyName) missing.push('company')
  if (!card.email) missing.push('email')
  if (!card.phone) missing.push('phone')
  return missing
}

export default function MyCardView({ data }: { data: MyCardData }) {
  const router = useRouter()
  const { card, slug, publicUrl, published } = data

  const [qrOpen, setQrOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const [shareNote, setShareNote] = useState<string | null>(null)
  const [publishing, setPublishing] = useState(false)
  const [publishError, setPublishError] = useState<string | null>(null)
  const [stats, setStats] = useState<CardAnalytics | null>(null)

  const live = Boolean(slug && published && publicUrl)
  const missing = missingEssentials(data)

  useEffect(() => {
    if (!live) return
    let cancelled = false

    fetch('/api/card/analytics')
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (!cancelled && json && typeof json.views === 'number') setStats(json as CardAnalytics)
      })
      .catch((err) => console.error('[my-card] analytics load failed:', err))

    return () => {
      cancelled = true
    }
  }, [live])

  const copyLink = useCallback(async () => {
    if (!publicUrl) return
    try {
      await navigator.clipboard.writeText(publicUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('[my-card] copy failed:', err)
      setShareNote('Could not copy the link.')
      setTimeout(() => setShareNote(null), 2500)
    }
  }, [publicUrl])

  const share = useCallback(async () => {
    if (!publicUrl) return
    const payload = {
      title: `${card.fullName} — ABC Card`,
      text: 'My digital business card',
      url: publicUrl,
    }
    try {
      if (typeof navigator !== 'undefined' && navigator.share) {
        await navigator.share(payload)
        return
      }
      await copyLink()
    } catch (err) {
      // A cancelled share sheet is not an error worth surfacing.
      if ((err as Error)?.name !== 'AbortError') {
        console.error('[my-card] share failed:', err)
      }
    }
  }, [card.fullName, copyLink, publicUrl])

  const publish = useCallback(async () => {
    if (!slug) return
    setPublishing(true)
    setPublishError(null)
    try {
      const supabase = createClientComponent()
      const { error } = await supabase
        .from('abc_profiles')
        .update({ card_published: true })
        .eq('id', data.userId)
      if (error) throw new Error(error.message)
      router.refresh()
    } catch (err) {
      console.error('[my-card] publish failed:', err)
      setPublishError('Could not publish the card. Try again.')
    } finally {
      setPublishing(false)
    }
  }, [data.userId, router, slug])

  return (
    <div className="mx-auto w-full max-w-[560px] px-4 pb-10 pt-5 sm:px-6 lg:pt-8">
      <SectionLabel>My card</SectionLabel>
      <h1 className="mt-2.5 text-[26px] font-bold leading-tight tracking-tight text-abc-text sm:text-[30px]">
        {card.fullName}
      </h1>
      <p className="mt-2 text-[14px] leading-[1.55] text-abc-secondary">
        This is what someone receives when they scan you.
      </p>

      <div className="mt-6">
        <CardPreview card={card} />
      </div>

      {/* ── No slug: the card has never been set up ── */}
      {!slug ? (
        <div className="mt-6 abc-surface">
          <EmptyState
            icon={IconAddressBook}
            title="Your card has no public link yet"
            description="Pick a card address and publish it, and your QR becomes scannable anywhere."
            action={
              <Button href="/profile/card" size="lg">
                <IconPencil size={18} stroke={1.8} />
                Set up my card
              </Button>
            }
          />
        </div>
      ) : null}

      {/* ── Slug but unpublished: no QR, because the URL would 404 ── */}
      {slug && !published ? (
        <div className="mt-6 rounded-card border border-abc-border bg-abc-card p-5">
          <div className="flex gap-3">
            <IconAlertCircle
              size={20}
              stroke={1.8}
              className="mt-0.5 shrink-0"
              style={{ color: 'var(--abc-upcoming)' }}
            />
            <div className="min-w-0">
              <p className="text-[15px] font-semibold text-abc-text">Not published yet</p>
              <p className="mt-1.5 text-[13.5px] leading-[1.55] text-abc-secondary">
                Only you can see this card. Publish it to make{' '}
                <span className="break-all text-abc-text">
                  {publicUrl?.replace(/^https?:\/\//, '')}
                </span>{' '}
                live and get a scannable QR.
              </p>
            </div>
          </div>

          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <Button onClick={() => void publish()} size="lg" fullWidth disabled={publishing}>
              {publishing ? 'Publishing…' : 'Publish my card'}
            </Button>
            <Button href="/profile/card" variant="surface" size="lg" fullWidth>
              Edit card
            </Button>
          </div>

          {publishError ? (
            <p className="mt-3 text-[13px]" style={{ color: 'var(--abc-overdue)' }} role="alert">
              {publishError}
            </p>
          ) : null}
        </div>
      ) : null}

      {/* ── Live: QR is the hero ── */}
      {live && slug ? (
        <>
          <section className="mt-6 rounded-card border border-abc-border bg-abc-card p-5 sm:p-6">
            <div className="flex flex-col items-center">
              <div
                className="rounded-[18px] bg-white p-3.5"
                style={{ lineHeight: 0, width: 'min(62vw, 236px)' }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/api/card/qr/${encodeURIComponent(slug)}?size=512`}
                  alt={`QR code linking to your public card at ${publicUrl}`}
                  width={512}
                  height={512}
                  className="block h-auto w-full"
                  style={{ aspectRatio: '1 / 1' }}
                />
              </div>

              <p className="mt-4 text-center text-[13px] leading-[1.5] text-abc-secondary">
                Anyone can scan this with a phone camera — no app needed.
              </p>

              <div className="mt-5 w-full">
                <Button onClick={() => setQrOpen(true)} size="lg" fullWidth>
                  <IconQrcode size={19} stroke={1.8} />
                  Show QR
                </Button>
              </div>

              <div className="mt-2.5 grid w-full grid-cols-2 gap-2.5">
                <Button onClick={() => void share()} variant="surface" size="lg" fullWidth>
                  <IconShare size={18} stroke={1.8} />
                  Share
                </Button>
                <Button onClick={() => void copyLink()} variant="surface" size="lg" fullWidth>
                  {copied ? <IconCheck size={18} stroke={1.9} /> : <IconCopy size={18} stroke={1.8} />}
                  {copied ? 'Copied' : 'Copy link'}
                </Button>
              </div>

              {shareNote ? (
                <p className="mt-3 text-center text-[12.5px] text-abc-muted" role="status">
                  {shareNote}
                </p>
              ) : null}
            </div>
          </section>

          <section className="mt-4 rounded-card border border-abc-border bg-abc-card p-5">
            <SectionLabel>Public link</SectionLabel>
            <a
              href={publicUrl!}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2.5 flex items-center gap-2.5 break-all text-[14px] font-medium text-abc-text transition-colors hover:text-abc-gold-accent abc-focus-ring"
            >
              {publicUrl!.replace(/^https?:\/\//, '')}
              <IconExternalLink size={16} stroke={1.8} className="shrink-0 text-abc-muted" />
            </a>
            <p className="mt-2 text-[12.5px] leading-[1.5] text-abc-muted">
              This address stays the same — safe to print on a badge, a roll-up or an NFC tag.
            </p>

            <div className="mt-4 grid grid-cols-2 gap-2.5">
              <Button href="/profile/card" variant="surface" size="md" fullWidth>
                <IconPencil size={17} stroke={1.8} />
                Edit card
              </Button>
              <a
                href={`/api/card/vcard/${encodeURIComponent(slug)}`}
                className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-btn border border-abc-border bg-abc-raised px-4 text-[14px] font-medium text-abc-text transition-colors duration-200 ease-abc hover:border-abc-border-strong abc-focus-ring"
              >
                <IconDownload size={17} stroke={1.8} />
                My vCard
              </a>
            </div>
          </section>

          {stats ? (
            <section className="mt-4 rounded-card border border-abc-border bg-abc-card p-5">
              <SectionLabel>Last 30 days</SectionLabel>
              <dl className="mt-3 grid grid-cols-3 gap-3">
                {[
                  { label: 'Views', value: stats.views },
                  { label: 'Contact saves', value: stats.vcardSaves },
                  { label: 'Link taps', value: stats.linkClicks },
                ].map((stat) => (
                  <div key={stat.label} className="rounded-inner border border-abc-border bg-abc-raised px-3 py-3">
                    <dt className="text-[11.5px] leading-tight text-abc-muted">{stat.label}</dt>
                    <dd className="mt-1.5 text-[20px] font-bold leading-none text-abc-text">
                      {stat.value}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ) : null}
        </>
      ) : null}

      {/* ── Incomplete identity: guide to the editor, never invent values ── */}
      {slug && missing.length > 0 ? (
        <div className="mt-4 rounded-card border border-abc-border bg-abc-card p-5">
          <p className="text-[14.5px] font-semibold text-abc-text">Your card is missing details</p>
          <p className="mt-1.5 text-[13.5px] leading-[1.55] text-abc-secondary">
            No {missing.join(', ')} saved yet — those rows stay hidden on your public card.
          </p>
          <div className="mt-4">
            <Button href="/profile/card" variant="surface" size="md">
              <IconPencil size={17} stroke={1.8} />
              Edit card
            </Button>
          </div>
        </div>
      ) : null}

      <section className="mt-4 rounded-card border border-abc-border bg-abc-card p-5">
        <div className="flex gap-3">
          <IconWallet size={19} stroke={1.7} className="mt-0.5 shrink-0 text-abc-muted" />
          <div>
            <p className="text-[14px] font-semibold text-abc-text">Wallet passes</p>
            <p className="mt-1.5 text-[13px] leading-[1.55] text-abc-secondary">
              Apple Wallet and Google Wallet are not connected yet, so there is nothing to add.
              Until then, <span className="text-abc-text">Show QR</span> is the fastest way to be
              scanned.
            </p>
          </div>
        </div>
      </section>

      <p className="mt-6 text-center text-[12.5px] text-abc-muted">
        Scanning someone else?{' '}
        <Link href="/scan" className="text-abc-gold-accent abc-focus-ring">
          Open the scanner
        </Link>
      </p>

      {slug ? (
        <CardQrModal
          slug={slug}
          open={qrOpen}
          onClose={() => setQrOpen(false)}
          name={card.fullName}
          company={card.companyName}
        />
      ) : null}
    </div>
  )
}
