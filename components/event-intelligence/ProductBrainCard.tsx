'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Button from '@/components/ui/abc/Button'
import { SectionLabel } from '@/components/ui/abc/Bits'
import type { BrainSummary } from '@/lib/event-intelligence/product-brain'

/**
 * THIS IS HOW ABC UNDERSTANDS YOUR BUSINESS — one card, two decisions.
 *
 * Maximum intelligence underneath, maximum simplicity on top: the owner sees
 * what ABC understood, in five plain groups, each item saying whose words it
 * is — theirs, their website's, or ABC's reading — and answers "Looks right"
 * or "Edit". No taxonomy, no sources, no crawl report.
 *
 * Edit removes what is wrong. It does not rewrite ABC's reading into
 * something it never was: to say something new, the owner changes their own
 * answers in the form below, which is where their own words live.
 *
 * The card's buttons are secondary on purpose. The screen's one primary
 * action is still "Save and see matches".
 */

type Props = {
  summary: BrainSummary
  website: string | null
}

/** What to say when the website was not read. Silence would read as "ABC found nothing". */
const WEBSITE_NOTE: Record<string, string> = {
  refused_ai_opt_out:
    'Your website asks AI crawlers not to read it, so ABC did not. ABC goes on what you have written instead.',
  refused_robots: 'Your website does not allow automated reading of these pages, so ABC did not read them.',
  failed: 'ABC could not read your website this time. It goes on what you have written.',
}

const host = (website: string) => website.replace(/^https?:\/\//i, '').replace(/\/.*$/, '')

export default function ProductBrainCard({ summary: initial, website }: Props) {
  const router = useRouter()
  const [summary, setSummary] = useState(initial)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [site, setSite] = useState(website ?? '')
  const [note, setNote] = useState<string | null>(null)

  async function call(body: Record<string, unknown>, label: string) {
    setBusy(label)
    setError(null)
    try {
      const response = await fetch('/api/event-intelligence/brain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await response.json().catch(() => null)
      if (!response.ok) {
        setError(data?.error || 'That did not work. Nothing was changed.')
        return false
      }
      if (data?.summary) setSummary(data.summary as BrainSummary)
      setNote(typeof data?.websiteRead === 'string' ? WEBSITE_NOTE[data.websiteRead] ?? null : null)
      router.refresh()
      return true
    } catch {
      setError('ABC could not be reached. Check your connection and try again.')
      return false
    } finally {
      setBusy(null)
    }
  }

  const read = () => call({ action: 'analyze', website: site.trim() || null }, 'read')
  const confirm = async () => {
    if (await call({ action: 'confirm' }, 'confirm')) setEditing(false)
  }
  const reject = (factId: string) => call({ action: 'reject', factId }, `reject:${factId}`)

  const reading = busy === 'read'

  return (
    <section aria-labelledby="brain-title" className="abc-surface mt-6 flex flex-col gap-4 p-4 sm:p-5">
      <div>
        <SectionLabel>Your business</SectionLabel>
        <h2 id="brain-title" className="mt-1.5 text-[18px] font-semibold leading-snug text-abc-text">
          This is how ABC understands your business
        </h2>
      </div>

      {!summary.hasReading ? (
        <div className="flex flex-col gap-3">
          <p className="text-[13.5px] leading-[1.6] text-abc-secondary">
            ABC can read your company website to understand what you make, who you sell to and where. You check it
            before it is used.
          </p>
          {website ? null : (
            <label className="block">
              <span className="block text-[13px] font-semibold text-abc-text">Company website</span>
              <input
                className="abc-input mt-2 w-full px-3 py-2.5 text-[14px]"
                value={site}
                onChange={(e) => setSite(e.target.value)}
                placeholder="example.com"
                inputMode="url"
                autoComplete="url"
              />
            </label>
          )}
          <div>
            <Button variant="surface" onClick={read} disabled={Boolean(busy) || !site.trim()}>
              {reading ? 'Reading your website…' : website ? `Read ${host(website)}` : 'Read my website'}
            </Button>
          </div>
        </div>
      ) : (
        <>
          {summary.summary ? <p className="text-[13.5px] leading-[1.6] text-abc-secondary">{summary.summary}</p> : null}

          <dl className="flex flex-col gap-4">
            {summary.sections.map((section) => (
              <div key={section.id}>
                <dt className="text-[12px] font-semibold uppercase tracking-[0.06em] text-abc-muted">{section.label}</dt>
                <dd className="mt-1.5">
                  <ul className="flex flex-col gap-1">
                    {section.items.map((item) => (
                      <li key={`${section.id}:${item.value}`} className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
                        <span className="min-w-0 break-words text-[14px] leading-[1.5] text-abc-text">{item.value}</span>
                        <span className="text-[11.5px] text-abc-muted">{item.label}</span>
                        {editing && item.origin !== 'owner' && item.id ? (
                          <button
                            type="button"
                            onClick={() => reject(item.id as string)}
                            disabled={Boolean(busy)}
                            className="touch-target ml-auto inline-flex items-center text-[12.5px] font-medium text-abc-secondary transition-colors hover:text-abc-text abc-focus-ring disabled:opacity-45"
                            aria-label={`${item.value} is not right — remove it`}
                          >
                            {busy === `reject:${item.id}` ? 'Removing…' : 'Not right'}
                          </button>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                  {section.more > 0 ? <p className="mt-1 text-[12px] text-abc-muted">and {section.more} more</p> : null}
                </dd>
              </div>
            ))}
          </dl>

          {editing ? (
            <div className="flex flex-col gap-3">
              <p className="text-[12.5px] leading-[1.55] text-abc-muted">
                Remove what is wrong. To add or change something, edit your answers below — ABC treats those as your
                own words.
              </p>
              <div className="flex flex-wrap gap-2">
                {summary.pending > 0 ? (
                  <Button variant="surface" onClick={confirm} disabled={Boolean(busy)}>
                    {busy === 'confirm' ? 'Saving…' : 'The rest looks right'}
                  </Button>
                ) : null}
                <Button variant="ghost" onClick={() => setEditing(false)} disabled={Boolean(busy)}>
                  Done
                </Button>
              </div>
            </div>
          ) : summary.pending > 0 ? (
            <div className="flex flex-wrap gap-2">
              <Button variant="surface" onClick={confirm} disabled={Boolean(busy)}>
                {busy === 'confirm' ? 'Saving…' : 'Looks right'}
              </Button>
              <Button variant="ghost" onClick={() => setEditing(true)} disabled={Boolean(busy)}>
                Edit
              </Button>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <p className="text-[12.5px] leading-[1.55] text-abc-muted">
                You confirmed this. ABC uses it to find who is worth meeting and what to show them.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button variant="ghost" onClick={() => setEditing(true)} disabled={Boolean(busy)}>
                  Edit
                </Button>
                {website ? (
                  <Button variant="ghost" onClick={read} disabled={Boolean(busy)}>
                    {reading ? 'Reading your website…' : 'Read my website again'}
                  </Button>
                ) : null}
              </div>
            </div>
          )}
        </>
      )}

      {note ? <p className="text-[12.5px] leading-[1.55] text-abc-muted">{note}</p> : null}

      <p className="sr-only" aria-live="polite">
        {reading ? 'Reading your website. This can take up to a minute.' : busy === 'confirm' ? 'Saving.' : ''}
      </p>
      {error ? (
        <p className="text-[13px] leading-[1.55]" style={{ color: 'var(--abc-overdue)' }} role="alert">
          {error}
        </p>
      ) : null}
    </section>
  )
}
