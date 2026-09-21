'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  IconArrowLeft,
  IconBrandWhatsapp,
  IconCheck,
  IconCopy,
  IconMail,
  IconMapPin,
  IconShare,
} from '@tabler/icons-react'
import Button from '@/components/ui/abc/Button'
import { SectionLabel } from '@/components/ui/abc/Bits'
import { MATCH_TYPE_LABEL, locationLabel } from '@/lib/event-intelligence/view'
import {
  BRIEF_STATUS_HINT,
  BRIEF_STATUS_LABEL,
  MEDIA_KIND_LABEL,
  buildShareText,
  canMarkReady,
  emailHandoffUrl,
  firstPartyNotice,
  whatsappHandoffUrl,
  type EventMaterial,
  type EventProduct,
  type MeetingBrief,
} from '@/lib/event-intelligence/profile'
import type {
  IntelCompany,
  IntelEvent,
  IntelPresence,
  MeetingTarget,
  StoredMatch,
} from '@/lib/event-intelligence/types'

/**
 * Preparing one meeting.
 *
 * The screen keeps the three kinds of claim apart, which is the same rule the
 * match detail follows and matters more here because the owner is about to put
 * all three in front of somebody:
 *
 *   **From their listing** — quoted, theirs.
 *   **Why ABC suggested them** — inference, ABC's.
 *   **What you will show** — first-party, the owner's own material.
 *
 * Nothing is sent. ABC has no transport and no address for these companies.
 * Every way out is the owner's own: the device's share sheet, their mail app,
 * WhatsApp, or the clipboard — each opens something they then finish (or
 * abandon) themselves. ABC cannot see whether they pressed send, so it does
 * not guess: only a completed share sheet, or the owner saying so, records the
 * brief as shared. A shared brief still does not mean anybody replied, and it
 * still does not mean a meeting happened.
 */

type Props = {
  event: IntelEvent
  match: StoredMatch
  presence: IntelPresence
  company: IntelCompany | undefined
  target: MeetingTarget
  products: EventProduct[]
  materials: EventMaterial[]
  brief: MeetingBrief | null
  /** `cardUrl` is set only for a published card. */
  me: { name: string | null; company: string | null; cardUrl: string | null }
}

export default function PrepareMeetingView({
  event,
  match,
  presence,
  company,
  target,
  products,
  materials,
  brief,
  me,
}: Props) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  /** The owner took the note out of ABC by a route ABC cannot see the end of. */
  const [handedOff, setHandedOff] = useState(false)
  // Known only in the browser; deciding it after mount keeps the server render identical.
  const [canShareSheet, setCanShareSheet] = useState(false)
  useEffect(() => setCanShareSheet(typeof navigator.share === 'function'), [])

  const [topic, setTopic] = useState(brief?.topic ?? '')
  const [message, setMessage] = useState(brief?.message ?? '')
  const [productId, setProductId] = useState(brief?.productId ?? '')
  const [attached, setAttached] = useState<string[]>(brief?.materialIds ?? [])

  const name = presence.exhibitorDisplayName ?? company?.displayName ?? 'this company'
  const status = brief?.status ?? 'draft'
  const product = products.find((entry) => entry.id === productId) ?? null
  const chosen = useMemo(
    () => attached.map((id) => materials.find((m) => m.id === id)).filter((m): m is EventMaterial => Boolean(m)),
    [attached, materials]
  )

  const ready = canMarkReady({ topic: topic.trim() || null, productId: productId || null, materialIds: attached })

  /**
   * The note the owner would actually send. `buildShareText` is handed only
   * what is meant to leave — never the private note, priority, target status,
   * score or ABC's reasoning — so none of it can end up in here.
   */
  const shareText = useMemo(
    () =>
      buildShareText({
        topic,
        message,
        product,
        material: chosen,
        event: { name: event.name },
        me,
      }),
    [topic, message, product, chosen, event.name, me]
  )
  const subject = topic.trim() || event.name

  async function save(patch?: { status?: string; materialIds?: string[] }) {
    setBusy(true)
    setError(null)
    try {
      const saved = await fetch('/api/event-intelligence/brief', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetId: target.id, topic, message, productId: productId || null }),
      })
      const savedBody = await saved.json().catch(() => null)
      if (!saved.ok) {
        setError(savedBody?.error || 'That could not be saved.')
        return false
      }

      const response = await fetch('/api/event-intelligence/brief', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetId: target.id, materialIds: patch?.materialIds ?? attached, ...(patch?.status ? { status: patch.status } : {}) }),
      })
      const body = await response.json().catch(() => null)
      if (!response.ok) {
        setError(body?.error || 'That could not be saved.')
        return false
      }
      router.refresh()
      return true
    } catch {
      setError('ABC could not be reached. Check your connection and try again.')
      return false
    } finally {
      setBusy(false)
    }
  }

  /**
   * The device's own share sheet. It resolves only when the owner picked where
   * the note goes, so that — and only that — is recorded as shared. Called
   * straight from the click so the browser still counts it as the owner's
   * gesture; the save happens after.
   */
  async function share() {
    setCopied(false)
    try {
      await navigator.share({ title: `${event.name} — ${name}`, text: shareText })
    } catch {
      // Cancelled. Nothing left ABC, so nothing is recorded.
      return
    }
    await save({ status: 'shared' })
  }

  /** Opens the owner's mail app with the note filled in and no recipient. */
  function openEmail() {
    window.location.href = emailHandoffUrl(subject, shareText)
    setHandedOff(true)
    void save()
  }

  /** Opens WhatsApp's chat picker with the note filled in. */
  function openWhatsApp() {
    window.open(whatsappHandoffUrl(shareText), '_blank', 'noopener,noreferrer')
    setHandedOff(true)
    void save()
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(shareText)
      setCopied(true)
      setHandedOff(true)
    } catch {
      setError('Copying is blocked in this browser. Select the note above and copy it yourself.')
      return
    }
    void save()
  }


  const input = 'abc-input min-h-[44px] w-full px-3 py-2.5 text-[14px]'

  return (
    <div className="mx-auto w-full max-w-[760px] abc-page-top px-4 pb-16 sm:px-6 lg:px-8">
      <Link
        href={`/events/intelligence/${event.eventKey}/m/${match.id}`}
        className="-my-3 inline-flex min-h-[44px] items-center gap-1.5 text-[13px] text-abc-secondary transition-colors hover:text-abc-text abc-focus-ring"
      >
        <IconArrowLeft size={16} stroke={1.8} aria-hidden="true" />
        {name}
      </Link>

      <header className="mt-4">
        <SectionLabel>Prepare the meeting</SectionLabel>
        <h1 className="mt-2 text-[26px] font-bold leading-tight tracking-tight text-abc-text lg:text-[32px]">
          {name}
        </h1>
        <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-abc-secondary">
          <span className="text-[11px] font-semibold uppercase tracking-[0.06em]">
            {MATCH_TYPE_LABEL[match.matchType]}
          </span>
          <span className="inline-flex items-center gap-1">
            <IconMapPin size={14} stroke={1.7} aria-hidden="true" />
            {locationLabel(presence)}
          </span>
        </p>
      </header>

      {/* ── Why, in ABC's words, with the listing behind it ── */}
      {match.reasons.length > 0 ? (
        <section className="abc-surface mt-6 p-4 sm:p-5">
          <SectionLabel>Why ABC suggested them</SectionLabel>
          <p className="mt-1.5 text-[12px] leading-[1.5] text-abc-muted">
            ABC&rsquo;s reading of their listing against what you said you want. Not published by the
            event, and not a claim about what they will do.
          </p>
          <p className="mt-3 text-[14px] leading-[1.55] text-abc-text">{match.reasons[0].statement}</p>
          <Link
            href={`/events/intelligence/${event.eventKey}/m/${match.id}`}
            className="touch-target mt-2 inline-flex min-h-[44px] items-center text-[13px] font-medium text-abc-secondary transition-colors hover:text-abc-text abc-focus-ring"
          >
            See their listing and the full reasoning
          </Link>
        </section>
      ) : null}

      {/* ── What to discuss ── */}
      <section className="abc-surface mt-4 p-4 sm:p-5">
        <SectionLabel>What you want to discuss</SectionLabel>

        <label className="mt-3 block">
          <span className="block text-[13px] font-semibold text-abc-text">Topic</span>
          <input
            className={`${input} mt-2`}
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="Lightweight aluminium housings for electric motors"
          />
        </label>

        {products.length > 0 ? (
          <label className="mt-4 block">
            <span className="block text-[13px] font-semibold text-abc-text">Product or solution</span>
            <select className={`${input} mt-2`} value={productId} onChange={(e) => setProductId(e.target.value)}>
              <option value="">Not tied to one product</option>
              {products.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.name}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <p className="mt-4 text-[12.5px] leading-[1.55] text-abc-muted">
            You have not added any products yet.{' '}
            <Link
              href={`/events/intelligence/${event.eventKey}/profile`}
              className="font-medium text-abc-secondary underline transition-colors hover:text-abc-text abc-focus-ring"
            >
              Add what you want to talk about
            </Link>
            .
          </p>
        )}

        <label className="mt-4 block">
          <span className="block text-[13px] font-semibold text-abc-text">A short note</span>
          <span className="mt-0.5 block text-[12px] leading-[1.5] text-abc-muted">
            In your words. ABC writes nothing for you.
          </span>
          <textarea
            className="abc-input mt-2 w-full px-3 py-2.5 text-[14px] leading-[1.55]"
            rows={4}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="We machine aluminium housings for automation companies. Would a short conversation at your stand be useful?"
          />
        </label>
      </section>

      {/* ── What to show ── */}
      <section className="abc-surface mt-4 p-4 sm:p-5">
        <SectionLabel>What you will show</SectionLabel>
        <p className="mt-1.5 text-[12px] leading-[1.55] text-abc-muted">{firstPartyNotice}</p>

        {materials.length === 0 ? (
          <p className="mt-3 text-[13.5px] leading-[1.55] text-abc-secondary">
            No material for {event.name} yet.{' '}
            <Link
              href={`/events/intelligence/${event.eventKey}/profile`}
              className="font-medium text-abc-secondary underline transition-colors hover:text-abc-text abc-focus-ring"
            >
              Add a video, brochure or offer
            </Link>
            .
          </p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {materials.map((material) => {
              const on = attached.includes(material.id)
              return (
                <li key={material.id}>
                  <button
                    type="button"
                    onClick={() =>
                      setAttached((current) =>
                        current.includes(material.id)
                          ? current.filter((id) => id !== material.id)
                          : [...current, material.id]
                      )
                    }
                    aria-pressed={on}
                    className={`flex min-h-[44px] w-full items-start justify-between gap-3 rounded-btn border px-3 py-2.5 text-left transition-colors duration-200 ease-abc abc-focus-ring ${
                      on ? 'border-abc-border-strong bg-abc-raised' : 'border-abc-border hover:border-abc-border-strong'
                    }`}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-[14px] font-medium text-abc-text">
                        {material.title}
                      </span>
                      <span className="block text-[12px] text-abc-muted">
                        {MEDIA_KIND_LABEL[material.mediaKind]}
                      </span>
                    </span>
                    {on ? (
                      <IconCheck size={18} stroke={2} style={{ color: 'var(--abc-gold)' }} aria-hidden="true" />
                    ) : null}
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {/* ── The note, as they would receive it ── */}
      <section className="abc-surface mt-4 p-4 sm:p-5">
        <SectionLabel>What you would send</SectionLabel>
        <p className="mt-1.5 text-[12px] leading-[1.55] text-abc-muted">
          Assembled from what you wrote above. ABC does not send it — you do.
        </p>
        <pre className="mt-3 whitespace-pre-wrap break-words rounded-btn border border-abc-border p-3 text-[13px] leading-[1.6] text-abc-text">
          {shareText || 'Add a topic to see what this would say.'}
        </pre>
      </section>

      {/* ── State, and the one action ── */}
      <section className="abc-surface mt-4 p-4 sm:p-5">
        <SectionLabel>State</SectionLabel>
        <p className="mt-3 text-[14px] font-medium text-abc-text">{BRIEF_STATUS_LABEL[status]}</p>
        <p className="mt-1 text-[12.5px] leading-[1.55] text-abc-muted">{BRIEF_STATUS_HINT[status]}</p>
        {brief?.sharedAt ? (
          <p className="mt-1 text-[12px] text-abc-muted">
            Shared on{' '}
            {new Date(brief.sharedAt).toLocaleDateString(undefined, {
              day: 'numeric',
              month: 'short',
              year: 'numeric',
            })}
            .
          </p>
        ) : null}

        <div className="mt-4 flex flex-wrap gap-2">
          <Button onClick={() => save()} disabled={busy} variant="surface">
            {busy ? 'Saving…' : 'Save draft'}
          </Button>
          <Button onClick={() => save({ status: 'ready' })} disabled={busy || !ready} variant="surface">
            Mark ready
          </Button>
        </div>

        <p className="mt-5 text-[13px] font-semibold text-abc-text">Send it yourself</p>
        <p className="mt-0.5 text-[12px] leading-[1.5] text-abc-muted">
          Each of these opens your own app with the note filled in. You choose who it goes to, and
          you press send — ABC does not.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {canShareSheet ? (
            <Button onClick={share} disabled={busy || !ready}>
              <IconShare size={16} stroke={1.8} aria-hidden="true" />
              Share…
            </Button>
          ) : null}
          <Button onClick={openEmail} disabled={busy || !ready} variant="surface">
            <IconMail size={16} stroke={1.8} aria-hidden="true" />
            Email
          </Button>
          <Button onClick={openWhatsApp} disabled={busy || !ready} variant="surface">
            <IconBrandWhatsapp size={16} stroke={1.8} aria-hidden="true" />
            WhatsApp
          </Button>
          <Button onClick={copy} disabled={busy || !ready} variant="surface">
            <IconCopy size={16} stroke={1.8} aria-hidden="true" />
            Copy
          </Button>
        </div>

        {!ready ? (
          <p className="mt-2 text-[12.5px] leading-[1.55] text-abc-muted">
            Add a topic and either a product or some material before marking this ready.
          </p>
        ) : null}

        {copied ? (
          <p className="mt-2 inline-flex items-center gap-1.5 text-[12.5px] text-abc-secondary" role="status">
            <IconCopy size={14} stroke={1.8} aria-hidden="true" />
            Copied. Paste it wherever you are talking to them.
          </p>
        ) : null}

        {handedOff && status !== 'shared' ? (
          <div className="mt-3 rounded-btn border border-abc-border p-3">
            <p className="text-[12.5px] leading-[1.55] text-abc-secondary">
              ABC cannot see whether you sent it. If you did, record it here.
            </p>
            <Button onClick={() => save({ status: 'shared' })} disabled={busy} variant="surface" className="mt-2">
              I sent it
            </Button>
          </div>
        ) : null}
      </section>

      {error ? (
        <p className="mt-4 text-[13px] leading-[1.55]" style={{ color: 'var(--abc-overdue)' }} role="alert">
          {error}
        </p>
      ) : null}

      <p className="mt-8 text-[12px] leading-[1.6] text-abc-muted">
        Preparing or sharing this does not mean you have met. {name} becomes a meeting in ABC only
        when you record one — by scanning their card, exchanging ABC, or saving the contact.
      </p>
    </div>
  )
}
