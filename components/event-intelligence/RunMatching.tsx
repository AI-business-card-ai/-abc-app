'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Button from '@/components/ui/abc/Button'

/**
 * Compare what the owner said against the exhibitor list.
 *
 * Safe to run again whenever the listing or the objective changes. It says how
 * many companies came out rather than only that it finished, because "6
 * matches from 21 exhibitors" is the number that tells somebody the feature
 * did its job — a filter that kept everything would not have.
 */
export default function RunMatching({
  eventKey,
  again = false,
}: {
  eventKey: string
  again?: boolean
}) {
  const router = useRouter()
  const [state, setState] = useState<'idle' | 'working' | 'done' | 'failed'>('idle')
  const [message, setMessage] = useState<string | null>(null)

  async function run() {
    setState('working')
    setMessage(null)
    try {
      const response = await fetch('/api/event-intelligence/match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventKey }),
      })
      const body = await response.json().catch(() => null)

      if (!response.ok) {
        setState('failed')
        setMessage(body?.error || 'Matching could not be completed.')
        return
      }

      const matched = Number(body?.matched ?? 0)
      setState('done')
      setMessage(
        matched === 0
          ? 'Nothing in this exhibitor list lines up with what you told ABC. Try adding more detail about what you sell and need.'
          : `${matched} ${matched === 1 ? 'company' : 'companies'} worth a look.`
      )
      router.refresh()
    } catch {
      setState('failed')
      setMessage('Matching could not be reached. Check your connection and try again.')
    }
  }

  return (
    <div>
      <Button onClick={run} disabled={state === 'working'} variant={again ? 'ghost' : 'gold'} size={again ? 'md' : 'lg'}>
        {state === 'working' ? 'Matching…' : again ? 'Run matching again' : 'Find who is worth meeting'}
      </Button>

      {message ? (
        <p
          className="mt-2.5 max-w-[46ch] text-[12.5px] leading-[1.55]"
          style={{ color: state === 'failed' ? 'var(--abc-overdue)' : 'var(--text-muted)' }}
          role="status"
        >
          {message}
        </p>
      ) : null}
    </div>
  )
}
