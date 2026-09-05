'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import {
  IconAddressBook,
  IconAlertCircle,
  IconBrandApple,
  IconBrandGoogle,
  IconCheck,
  IconCopy,
  IconDownload,
  IconExternalLink,
  IconPencil,
  IconPresentation,
  IconQrcode,
  IconShare,
  IconWallet,
} from '@tabler/icons-react'
import type { TablerIcon } from '@tabler/icons-react'
import CardQrModal from '@/components/card/CardQrModal'
import CardPresentationMode from '@/components/my-card/CardPresentationMode'
import CompactCardPreview from '@/components/card/CompactCardPreview'
import Button from '@/components/ui/abc/Button'
import { EmptyState, SectionLabel } from '@/components/ui/abc/Bits'
import type { CardAnalytics } from '@/lib/card/types'
import type { MyCardData } from '@/lib/my-card-data'
import type { WalletAvailability } from '@/lib/card/wallet'
import { CARD_EDITOR_PATH } from '@/lib/settings/sections'

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

export default function MyCardView({
  data,
  wallet = { apple: false, google: false },
}: {
  data: MyCardData
  /** Which wallets this deployment can actually issue a pass for. */
  wallet?: WalletAvailability
}) {
  const { card, slug, publicUrl, published } = data

  const [qrOpen, setQrOpen] = useState(false)
  const [presenting, setPresenting] = useState(false)
  const [copied, setCopied] = useState(false)
  const [shareNote, setShareNote] = useState<string | null>(null)
  const [stats, setStats] = useState<CardAnalytics | null>(null)

  const live = Boolean(slug && published && publicUrl)
  const walletReady = wallet.apple || wallet.google
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

  /*
    Publishing is not here.

    This screen used to write `card_published: true` straight to the profile,
    which meant a second, weaker publish path: the card editor refuses to
    publish without a valid card address, and this one only checked that a slug
    existed at all. Two ways to publish, one of which could publish a card whose
    URL would not resolve. The editor keeps the one that validates; this screen
    links to it.
  */

  return (
    <div className="mx-auto w-full max-w-[560px] abc-page-top px-4 pb-10 sm:px-6">
      {/*
        The card is the hero. The page used to open with the owner's name at
        30px directly above a card that renders the same name at similar size —
        the tallest element on the screen was a duplicate, and on an iPhone it
        pushed the card itself below the fold.
      */}
      <h1 className="text-[15px] font-semibold leading-tight text-abc-text">My card</h1>
      <p className="mt-1 text-[13px] leading-[1.5] text-abc-secondary">
        This is what someone receives when they scan you.
      </p>

      {/* Same renderer the editor previews with, so the two cannot drift. */}
      <div className="mt-4">
        {live ? (
          <button
            type="button"
            onClick={() => setPresenting(true)}
            aria-label="Show your card full screen"
            className="block w-full rounded-card text-left abc-focus-ring"
          >
            <CompactCardPreview card={card} size="large" />
          </button>
        ) : (
          <CompactCardPreview card={card} size="large" />
        )}
      </div>

      {/* ── No slug: the card has never been set up ── */}
      {!slug ? (
        <div className="mt-6 abc-surface">
          <EmptyState
            icon={IconAddressBook}
            title="Your card has no public link yet"
            description="Pick a card address and publish it, and your QR becomes scannable anywhere."
            action={
              <Button href={CARD_EDITOR_PATH} size="lg">
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

          <div className="mt-4">
            <Button href={CARD_EDITOR_PATH} size="lg" fullWidth>
              <IconPencil size={18} stroke={1.8} />
              Publish in card settings
            </Button>
          </div>
        </div>
      ) : null}

      {/* ── Live: the card leads, the QR is one tap away ── */}
      {live && slug ? (
        <>
          <section className="mt-4">
            {/* Showing the card and showing its QR are the two things this
                screen exists for, so they share the top row. Only one of them
                is gold: two gold buttons side by side is not a hierarchy. */}
            <div className="grid grid-cols-2 gap-2.5">
              <Button onClick={() => setPresenting(true)} size="lg" fullWidth>
                <IconPresentation size={19} stroke={1.8} />
                Present card
              </Button>
              <Button onClick={() => setQrOpen(true)} variant="surface" size="lg" fullWidth>
                <IconQrcode size={19} stroke={1.8} />
                Show QR
              </Button>
            </div>

            <div className="mt-2.5 grid grid-cols-2 gap-2.5">
              <Button onClick={() => void share()} variant="surface" size="md" fullWidth>
                <IconShare size={17} stroke={1.8} />
                Share
              </Button>
              <Button onClick={() => void copyLink()} variant="surface" size="md" fullWidth>
                {copied ? <IconCheck size={17} stroke={1.9} /> : <IconCopy size={17} stroke={1.8} />}
                {copied ? 'Copied' : 'Copy link'}
              </Button>
            </div>

            {shareNote ? (
              <p className="mt-3 text-center text-[12.5px] text-abc-muted" role="status">
                {shareNote}
              </p>
            ) : null}
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
              <Button href={CARD_EDITOR_PATH} variant="surface" size="md" fullWidth>
                <IconPencil size={17} stroke={1.8} />
                Edit card settings
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
            <Button href={CARD_EDITOR_PATH} variant="surface" size="md">
              <IconPencil size={17} stroke={1.8} />
              Edit card settings
            </Button>
          </div>
        </div>
      ) : null}

      <section
        id="wallet"
        className="mt-4 scroll-mt-24 rounded-card border border-abc-border bg-abc-card p-5"
      >
        <div className="flex gap-3">
          <IconWallet size={19} stroke={1.7} className="mt-0.5 shrink-0 text-abc-muted" />
          <div className="min-w-0 flex-1">
            <p className="text-[14px] font-semibold text-abc-text">Wallet passes</p>
            <p className="mt-1.5 text-[13px] leading-[1.55] text-abc-secondary">
              {walletReady
                ? 'Keep your card in the phone you already hold at the door. The QR on the pass opens your live card, so it keeps working after you edit anything.'
                : 'Apple Wallet and Google Wallet are not connected yet, so there is nothing to add.'}{' '}
              {live ? (
                <>
                  <span className="text-abc-text">Show QR</span> works either way.
                </>
              ) : null}
            </p>

            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <WalletAction
                label="Add to Apple Wallet"
                href="/api/card/wallet/apple"
                Icon={IconBrandApple}
                available={wallet.apple && live}
              />
              <WalletAction
                label="Add to Google Wallet"
                href="/api/card/wallet/google"
                Icon={IconBrandGoogle}
                available={wallet.google && live}
              />
            </div>

            {!live ? (
              <p className="mt-2 text-[12px] leading-[1.5] text-abc-muted">
                Publish your card first — a pass points at your public card address.
              </p>
            ) : null}
          </div>
        </div>
      </section>

      <p className="mt-6 text-center text-[12.5px] text-abc-muted">
        Scanning someone else?{' '}
        <Link href="/scan" className="text-abc-gold-accent abc-focus-ring">
          Open the scanner
        </Link>
      </p>

      {/*
        Presentation sits under the QR in the stack, so tapping "Show QR code"
        from inside it puts the QR on top rather than replacing it — closing the
        QR returns to the presented card, which is what somebody holding the
        phone out expects.
      */}
      {live ? (
        <CardPresentationMode
          card={card}
          open={presenting}
          covered={qrOpen}
          onClose={() => setPresenting(false)}
          onShowQr={() => setQrOpen(true)}
        />
      ) : null}

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

/**
 * One wallet action, rendered only as honestly as it can behave.
 *
 * When the deployment has no credentials — or the card is not published — the
 * control is a non-interactive element with `aria-disabled`, not a link that
 * leads to an error. It never says "Added" or "Saved": the pass is handed to
 * the operating system, and whether the owner then confirms the save happens
 * somewhere this app cannot see. Claiming otherwise would be a guess presented
 * as a fact.
 */
function WalletAction({
  label,
  href,
  Icon,
  available,
}: {
  label: string
  href: string
  Icon: TablerIcon
  available: boolean
}) {
  const shared =
    'flex flex-1 items-center justify-center gap-2 rounded-btn border px-4 py-3 text-[13.5px] font-semibold transition-colors duration-200 ease-abc'

  if (!available) {
    return (
      <span
        aria-disabled="true"
        title={`${label} is not available yet`}
        className={`${shared} cursor-not-allowed border-abc-border text-abc-muted opacity-65`}
      >
        <Icon size={17} stroke={1.8} />
        {label}
      </span>
    )
  }

  return (
    <a
      href={href}
      className={`${shared} border-abc-border bg-abc-raised text-abc-text hover:border-abc-border-strong abc-focus-ring`}
    >
      <Icon size={17} stroke={1.8} />
      {label}
    </a>
  )
}
