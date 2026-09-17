'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Button from '@/components/ui/abc/Button'

/**
 * Load the synthetic demo fair.
 *
 * Safe to press twice: the import is idempotent, so a second run writes
 * nothing. The button says what happened rather than only that it finished,
 * because "21 exhibitors, nothing changed" is the answer that tells somebody
 * the re-import behaved.
 */
export default function ImportDemoData({ subtle = false }: { subtle?: boolean }) {
  const router = useRouter()
  const [state, setState] = useState<'idle' | 'working' | 'done' | 'failed'>('idle')
  const [message, setMessage] = useState<string | null>(null)

  async function run() {
    setState('working')
    setMessage(null)
    try {
      const response = await fetch('/api/event-intelligence/import', { method: 'POST' })
      const body = await response.json().catch(() => null)

      if (!response.ok) {
        setState('failed')
        setMessage(body?.error || 'The import could not be completed.')
        return
      }

      const report = body?.report ?? {}
      const created = Number(report.presencesCreated ?? 0)
      const updated = Number(report.presencesUpdated ?? 0)
      const seen = Number(report.exhibitorsSeen ?? 0)

      setState('done')
      setMessage(
        created === 0 && updated === 0
          ? `Already up to date — ${seen} exhibitors, nothing changed.`
          : `${seen} exhibitors read · ${created} added${updated > 0 ? ` · ${updated} updated` : ''}.`
      )
      router.refresh()
    } catch {
      setState('failed')
      setMessage('The import could not be reached. Check your connection and try again.')
    }
  }

  return (
    <div className={subtle ? '' : 'flex flex-col items-center'}>
      <Button
        onClick={run}
        disabled={state === 'working'}
        variant={subtle ? 'ghost' : 'gold'}
        size={subtle ? 'md' : 'lg'}
      >
        {state === 'working' ? 'Loading…' : subtle ? 'Reload demo data' : 'Load the demo fair'}
      </Button>

      {message ? (
        <p
          className="mt-2.5 max-w-[42ch] text-[12.5px] leading-[1.55]"
          style={{ color: state === 'failed' ? 'var(--abc-overdue)' : 'var(--text-muted)' }}
          role="status"
        >
          {message}
        </p>
      ) : null}
    </div>
  )
}
