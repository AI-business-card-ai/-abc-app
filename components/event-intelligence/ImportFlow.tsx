'use client'

import { useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  IconAlertTriangle,
  IconArrowLeft,
  IconCheck,
  IconCircleX,
  IconFileText,
  IconUpload,
} from '@tabler/icons-react'
import Button from '@/components/ui/abc/Button'
import { SectionLabel } from '@/components/ui/abc/Bits'
import type { ImportPreview, PreviewRecord } from '@/lib/event-intelligence/import-preview'
import { MAX_IMPORT_BYTES } from '@/lib/event-intelligence/import-request'

/**
 * Import an exhibitor list: pick the fair, hand ABC the file, look at what it
 * found, then commit.
 *
 * Four steps in one screen rather than four routes, because it is one decision
 * with one back button, and because a half-finished import has nothing worth
 * deep-linking to. The step is the state; nothing is written until the last one.
 *
 * Deliberately not an admin console. There is no grid of raw cells, no column
 * mapper and no schema editor — ABC reads the common header names itself, and
 * what the person is shown is what ABC understood, in the same cards the rest
 * of the feature uses.
 */

type KnownEvent = {
  eventKey: string
  name: string
  editionYear: number | null
  city: string | null
  country: string | null
  exhibitors: number
}

type Step = 'event' | 'file' | 'preview' | 'done'

type CommitResult = {
  eventKey: string
  report: { exhibitorsSeen: number; companiesCreated: number; presencesCreated: number; presencesUpdated: number; presencesUnchanged: number }
  skipped: { invalid: number; duplicateInFile: number }
}

const STATE_TONE: Record<PreviewRecord['state'], { label: string; color: string }> = {
  valid: { label: 'Ready', color: 'var(--accent-turquoise)' },
  warning: { label: 'Check', color: 'var(--abc-gold)' },
  invalid: { label: 'Cannot import', color: 'var(--abc-overdue)' },
}

export default function ImportFlow({ events }: { events: KnownEvent[] }) {
  const router = useRouter()
  const fileInput = useRef<HTMLInputElement>(null)

  const [step, setStep] = useState<Step>('event')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Step 1 — which fair
  const [mode, setMode] = useState<'existing' | 'new'>(events.length > 0 ? 'existing' : 'new')
  const [existingKey, setExistingKey] = useState(events[0]?.eventKey ?? '')
  const [name, setName] = useState('')
  const [year, setYear] = useState(String(new Date().getFullYear()))
  const [city, setCity] = useState('')
  const [country, setCountry] = useState('')

  // Step 2 — the file
  const [format, setFormat] = useState<'csv' | 'json'>('csv')
  const [fileName, setFileName] = useState<string | null>(null)
  const [text, setText] = useState('')

  // Step 3 — what ABC found
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [eventName, setEventName] = useState('')
  const [eventKey, setEventKey] = useState('')
  const [filter, setFilter] = useState<'all' | PreviewRecord['state']>('all')
  const [showAll, setShowAll] = useState(false)

  // Step 4 — what happened
  const [result, setResult] = useState<CommitResult | null>(null)

  const chosen = events.find((event) => event.eventKey === existingKey)

  /** The event, in the shape both API routes read. */
  function eventPayload() {
    if (mode === 'existing' && chosen) {
      return {
        name: chosen.name,
        editionYear: chosen.editionYear ?? (Number(year) || new Date().getFullYear()),
        city: chosen.city,
        country: chosen.country,
      }
    }
    return { name, editionYear: Number(year), city, country }
  }

  async function onFile(file: File | undefined) {
    setError(null)
    if (!file) return
    if (file.size > MAX_IMPORT_BYTES) {
      setError(`That file is ${(file.size / (1024 * 1024)).toFixed(1)} MB. ABC reads files up to ${MAX_IMPORT_BYTES / (1024 * 1024)} MB.`)
      return
    }
    const lowered = file.name.toLowerCase()
    if (lowered.endsWith('.json')) setFormat('json')
    else if (lowered.endsWith('.csv') || lowered.endsWith('.tsv') || lowered.endsWith('.txt')) setFormat('csv')

    setFileName(file.name)
    setText(await file.text())
  }

  async function runPreview() {
    setBusy(true)
    setError(null)
    try {
      const response = await fetch('/api/event-intelligence/import/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ format, text, event: eventPayload() }),
      })
      const body = await response.json().catch(() => null)
      if (!response.ok) {
        setError(body?.error || 'ABC could not read that file.')
        return
      }
      setPreview(body.preview)
      setEventName(body.eventName)
      setEventKey(body.eventKey)
      setFilter('all')
      setShowAll(false)
      setStep('preview')
    } catch {
      setError('ABC could not be reached. Check your connection and try again.')
    } finally {
      setBusy(false)
    }
  }

  async function commit() {
    setBusy(true)
    setError(null)
    try {
      const response = await fetch('/api/event-intelligence/import/commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ format, text, event: eventPayload() }),
      })
      const body = await response.json().catch(() => null)
      if (!response.ok) {
        setError(body?.error || 'The import could not be completed.')
        return
      }
      setResult(body)
      setStep('done')
      router.refresh()
    } catch {
      setError('ABC could not be reached. Check your connection and try again.')
    } finally {
      setBusy(false)
    }
  }

  const visible = useMemo(() => {
    if (!preview) return []
    const rows = filter === 'all' ? preview.records : preview.records.filter((r) => r.state === filter)
    return showAll ? rows : rows.slice(0, 50)
  }, [preview, filter, showAll])

  const input = 'abc-input w-full px-3 py-2.5 text-[14px]'

  return (
    <div className="mx-auto w-full max-w-[760px] abc-page-top px-4 pb-16 sm:px-6 lg:px-8">
      <Link
        href="/events/intelligence"
        className="-my-3 inline-flex min-h-[44px] items-center gap-1.5 text-[13px] text-abc-secondary transition-colors hover:text-abc-text abc-focus-ring"
      >
        <IconArrowLeft size={16} stroke={1.8} aria-hidden="true" />
        Event Intelligence
      </Link>

      <header className="mt-4">
        <SectionLabel>Event Intelligence</SectionLabel>
        <h1 className="mt-2 text-[26px] font-bold leading-tight tracking-tight text-abc-text lg:text-[32px]">
          Import an exhibitor list
        </h1>
        <p className="mt-1.5 max-w-[56ch] text-[14px] leading-[1.6] text-abc-secondary">
          A CSV or JSON list from the organiser. ABC reads the usual column names, shows you what it
          understood, and writes nothing until you say so.
        </p>
      </header>

      {/* ── 1. Which fair ── */}
      <section className="abc-surface mt-6 p-4 sm:p-5">
        <SectionLabel>1 · Which event</SectionLabel>

        {step !== 'event' ? (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <p className="text-[14px] text-abc-text">{eventName || eventPayload().name}</p>
            <button
              type="button"
              onClick={() => setStep('event')}
              className="touch-target inline-flex items-center text-[13px] font-medium text-abc-secondary transition-colors hover:text-abc-text abc-focus-ring"
            >
              Change
            </button>
          </div>
        ) : (
          <div className="mt-3 flex flex-col gap-4">
            {events.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {(['existing', 'new'] as const).map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setMode(option)}
                    aria-pressed={mode === option}
                    className={`inline-flex min-h-[44px] items-center rounded-btn border px-3 py-2 text-[13px] font-medium transition-colors duration-200 ease-abc abc-focus-ring ${
                      mode === option
                        ? 'border-abc-border-strong bg-abc-raised text-abc-text'
                        : 'border-abc-border text-abc-secondary hover:text-abc-text'
                    }`}
                  >
                    {option === 'existing' ? 'An event ABC knows' : 'A new edition'}
                  </button>
                ))}
              </div>
            ) : null}

            {mode === 'existing' && events.length > 0 ? (
              <ul className="flex flex-col gap-2">
                {events.map((event) => (
                  <li key={event.eventKey}>
                    <button
                      type="button"
                      onClick={() => setExistingKey(event.eventKey)}
                      aria-pressed={existingKey === event.eventKey}
                      className={`flex min-h-[44px] w-full items-center justify-between gap-3 rounded-btn border px-3 py-2.5 text-left transition-colors duration-200 ease-abc abc-focus-ring ${
                        existingKey === event.eventKey
                          ? 'border-abc-border-strong bg-abc-raised'
                          : 'border-abc-border hover:border-abc-border-strong'
                      }`}
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-[14px] font-medium text-abc-text">{event.name}</span>
                        <span className="block text-[12px] text-abc-muted">
                          {event.exhibitors} {event.exhibitors === 1 ? 'exhibitor' : 'exhibitors'}
                          {event.city ? ` · ${event.city}` : ''}
                        </span>
                      </span>
                      {existingKey === event.eventKey ? (
                        <IconCheck size={18} stroke={2} style={{ color: 'var(--abc-gold)' }} aria-hidden="true" />
                      ) : null}
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="flex flex-col gap-3">
                <label className="block">
                  <span className="block text-[13px] font-semibold text-abc-text">Event name</span>
                  <input className={`${input} mt-2`} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ambiente" />
                </label>
                <div className="flex gap-3">
                  <label className="block w-32">
                    <span className="block text-[13px] font-semibold text-abc-text">Year</span>
                    <input
                      className={`${input} mt-2`}
                      value={year}
                      onChange={(e) => setYear(e.target.value)}
                      inputMode="numeric"
                      placeholder="2027"
                    />
                  </label>
                  <label className="block min-w-0 flex-1">
                    <span className="block text-[13px] font-semibold text-abc-text">City</span>
                    <input className={`${input} mt-2`} value={city} onChange={(e) => setCity(e.target.value)} placeholder="Frankfurt" />
                  </label>
                </div>
                <label className="block">
                  <span className="block text-[13px] font-semibold text-abc-text">Country</span>
                  <input className={`${input} mt-2`} value={country} onChange={(e) => setCountry(e.target.value)} placeholder="DE" />
                </label>
                <p className="text-[12px] leading-[1.5] text-abc-muted">
                  The year keeps editions apart. Ambiente 2026 and Ambiente 2027 are two different
                  events with two different exhibitor lists, and ABC will not merge them.
                </p>
              </div>
            )}

            <div>
              <Button
                onClick={() => {
                  setError(null)
                  if (mode === 'new' && !name.trim()) {
                    setError('What is the event called?')
                    return
                  }
                  setStep('file')
                }}
              >
                Continue
              </Button>
            </div>
          </div>
        )}
      </section>

      {/* ── 2. The file ── */}
      {step === 'file' || step === 'preview' || step === 'done' ? (
        <section className="abc-surface mt-4 p-4 sm:p-5">
          <SectionLabel>2 · The file</SectionLabel>

          {step === 'file' ? (
            <div className="mt-3 flex flex-col gap-4">
              <div className="flex flex-wrap gap-2">
                {(['csv', 'json'] as const).map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setFormat(option)}
                    aria-pressed={format === option}
                    className={`inline-flex min-h-[44px] items-center rounded-btn border px-3 py-2 text-[13px] font-medium uppercase transition-colors duration-200 ease-abc abc-focus-ring ${
                      format === option
                        ? 'border-abc-border-strong bg-abc-raised text-abc-text'
                        : 'border-abc-border text-abc-secondary hover:text-abc-text'
                    }`}
                  >
                    {option}
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={() => fileInput.current?.click()}
                className="flex min-h-[112px] w-full flex-col items-center justify-center gap-2 rounded-btn border border-dashed border-abc-border px-4 py-6 text-center transition-colors duration-200 ease-abc hover:border-abc-border-strong abc-focus-ring"
              >
                <IconUpload size={22} stroke={1.6} className="text-abc-muted" aria-hidden="true" />
                <span className="text-[14px] font-medium text-abc-text">
                  {fileName ?? 'Choose a file'}
                </span>
                <span className="text-[12px] text-abc-muted">
                  {fileName ? 'Tap to choose a different one' : `CSV or JSON, up to ${MAX_IMPORT_BYTES / (1024 * 1024)} MB`}
                </span>
              </button>

              <input
                ref={fileInput}
                type="file"
                accept=".csv,.tsv,.txt,.json,text/csv,application/json"
                className="sr-only"
                onChange={(e) => onFile(e.target.files?.[0])}
              />

              <div>
                <Button onClick={runPreview} disabled={busy || !text.trim()}>
                  {busy ? 'Reading…' : 'See what ABC found'}
                </Button>
              </div>
            </div>
          ) : (
            <p className="mt-3 flex items-center gap-2 text-[14px] text-abc-text">
              <IconFileText size={16} stroke={1.7} className="text-abc-muted" aria-hidden="true" />
              {fileName ?? `${format.toUpperCase()} data`}
            </p>
          )}
        </section>
      ) : null}

      {/* ── 3. What ABC found ── */}
      {step === 'preview' && preview ? (
        <section className="abc-surface mt-4 p-4 sm:p-5">
          <SectionLabel>3 · What ABC found</SectionLabel>

          <p className="mt-3 text-[14px] text-abc-text">
            {preview.counts.total} {preview.counts.total === 1 ? 'row' : 'rows'} in {fileName ?? 'the file'} ·{' '}
            <strong className="font-semibold">{preview.counts.importable}</strong> will be imported into {eventName}.
          </p>

          <div className="abc-scroll-x -mx-4 mt-3 flex gap-2 px-4 sm:mx-0 sm:px-0">
            {([
              ['all', `All ${preview.counts.total}`],
              ['valid', `Ready ${preview.counts.valid}`],
              ['warning', `Check ${preview.counts.warning}`],
              ['invalid', `Cannot import ${preview.counts.invalid}`],
            ] as const).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => {
                  setFilter(value)
                  setShowAll(false)
                }}
                aria-pressed={filter === value}
                className={`inline-flex min-h-[44px] shrink-0 items-center rounded-btn border px-3 py-2 text-[13px] font-medium transition-colors duration-200 ease-abc abc-focus-ring ${
                  filter === value
                    ? 'border-abc-border-strong bg-abc-raised text-abc-text'
                    : 'border-abc-border text-abc-secondary hover:text-abc-text'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {preview.counts.alreadyImported > 0 ? (
            <p className="mt-3 text-[12.5px] leading-[1.55] text-abc-muted">
              {preview.counts.alreadyImported} of these are already in ABC for this event. They will be
              updated where the listing changed, not duplicated.
            </p>
          ) : null}
          {preview.counts.duplicateInFile > 0 ? (
            <p className="mt-1.5 text-[12.5px] leading-[1.55] text-abc-muted">
              {preview.counts.duplicateInFile} row(s) repeat a company that appears earlier in the file.
              Only the first is imported.
            </p>
          ) : null}
          {preview.parserWarnings.map((warning) => (
            <p key={warning} className="mt-1.5 text-[12.5px] leading-[1.55] text-abc-muted">
              {warning}
            </p>
          ))}

          {visible.length === 0 ? (
            <p className="mt-4 text-[13.5px] text-abc-secondary">Nothing in this group.</p>
          ) : (
            <ul className="mt-4 flex flex-col gap-2.5">
              {visible.map((record) => {
                const tone = STATE_TONE[record.state]
                return (
                  <li key={record.row} className="rounded-btn border border-abc-border p-3">
                    <div className="flex items-start justify-between gap-3">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[14px] font-semibold text-abc-text">
                          {record.companyName ?? `Row ${record.row} — no company name`}
                        </span>
                        <span className="mt-0.5 block text-[12px] text-abc-muted">
                          {record.hall || record.stand
                            ? `${record.hall ? `Hall ${record.hall}` : 'Hall not listed'} · ${record.stand ? `Stand ${record.stand}` : 'Stand not listed'}`
                            : 'Location not listed'}
                          {record.website ? ` · ${record.website}` : ''}
                        </span>
                      </span>
                      <span
                        className="inline-flex shrink-0 items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.05em]"
                        style={{ color: tone.color }}
                      >
                        {record.state === 'invalid' ? (
                          <IconCircleX size={13} stroke={2} aria-hidden="true" />
                        ) : record.state === 'warning' ? (
                          <IconAlertTriangle size={13} stroke={2} aria-hidden="true" />
                        ) : (
                          <IconCheck size={13} stroke={2} aria-hidden="true" />
                        )}
                        {tone.label}
                      </span>
                    </div>

                    {record.description ? (
                      <p className="mt-1.5 line-clamp-2 text-[12.5px] leading-[1.5] text-abc-secondary">
                        {record.description}
                      </p>
                    ) : null}

                    {record.categories.length > 0 ? (
                      <p className="mt-1.5 text-[12px] text-abc-muted">{record.categories.join(' · ')}</p>
                    ) : null}

                    {record.issues.length > 0 ? (
                      <p className="mt-1.5 text-[12px] leading-[1.5] text-abc-muted">
                        {record.issues.map((entry) => entry.message).join(' ')}
                      </p>
                    ) : null}
                  </li>
                )
              })}
            </ul>
          )}

          {!showAll && (filter === 'all' ? preview.counts.total : visible.length) > 50 ? (
            <button
              type="button"
              onClick={() => setShowAll(true)}
              className="touch-target mt-3 inline-flex items-center text-[13px] font-medium text-abc-secondary transition-colors hover:text-abc-text abc-focus-ring"
            >
              Show all
            </button>
          ) : null}

          <div className="mt-5 flex flex-wrap gap-2">
            <Button onClick={commit} disabled={busy || preview.counts.importable === 0}>
              {busy ? 'Importing…' : `Import ${preview.counts.importable} ${preview.counts.importable === 1 ? 'company' : 'companies'}`}
            </Button>
            <Button onClick={() => setStep('file')} variant="ghost" disabled={busy}>
              Choose another file
            </Button>
          </div>

          {preview.counts.importable === 0 ? (
            <p className="mt-3 text-[12.5px] leading-[1.55]" style={{ color: 'var(--abc-overdue)' }}>
              Nothing in this file can be imported. Every row is missing a company name, or anything
              to identify the company by.
            </p>
          ) : null}
        </section>
      ) : null}

      {/* ── 4. Done, and straight on to the point ── */}
      {step === 'done' && result ? (
        <section className="abc-surface mt-4 p-4 sm:p-5">
          <SectionLabel>4 · Imported</SectionLabel>

          <p className="mt-3 text-[14px] leading-[1.6] text-abc-text">
            {result.report.presencesCreated > 0
              ? `${result.report.presencesCreated} ${result.report.presencesCreated === 1 ? 'exhibitor' : 'exhibitors'} added`
              : 'Nothing new to add'}
            {result.report.presencesUpdated > 0 ? ` · ${result.report.presencesUpdated} updated` : ''}
            {result.report.presencesUnchanged > 0 ? ` · ${result.report.presencesUnchanged} unchanged` : ''}.
          </p>

          {result.skipped.invalid > 0 || result.skipped.duplicateInFile > 0 ? (
            <p className="mt-1.5 text-[12.5px] leading-[1.55] text-abc-muted">
              {result.skipped.invalid > 0 ? `${result.skipped.invalid} row(s) could not be imported. ` : ''}
              {result.skipped.duplicateInFile > 0 ? `${result.skipped.duplicateInFile} duplicate row(s) collapsed.` : ''}
            </p>
          ) : null}

          <p className="mt-3 text-[13px] leading-[1.6] text-abc-secondary">
            Next, ABC can compare this list against what your company does and needs.
          </p>

          <div className="mt-4 flex flex-wrap gap-2">
            <Button href={`/events/intelligence/${result.eventKey}`}>Find who is worth meeting</Button>
            <Button
              href={`/events/intelligence/${result.eventKey}/setup`}
              variant="surface"
            >
              Edit what you told ABC
            </Button>
          </div>
        </section>
      ) : null}

      {error ? (
        <p className="mt-4 text-[13px] leading-[1.55]" style={{ color: 'var(--abc-overdue)' }} role="alert">
          {error}
        </p>
      ) : null}

      <p className="mt-8 text-[12px] leading-[1.6] text-abc-muted">
        ABC keeps no copy of the file. It reads the rows, records where each fact came from, and
        stores the exhibitor list — nothing else.
      </p>
    </div>
  )
}
