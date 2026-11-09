'use client'

import { useEffect, useState } from 'react'
import { createClientComponent } from '@/lib/supabase'
import { attentionCount, bucketFollowUps } from '@/lib/followups'
import { useAccountEpoch } from '@/lib/hooks/useAppProfile'

/*
  Home mounts the badge twice at once — the desktop bell and the app header —
  and each used to ask Supabase for the user and the follow-ups separately.
  Mounts that overlap now share one request, within one signed-in account.
  Nothing is cached once it answers, so the next visit still gets a fresh count.
*/
let inFlight: { epoch: number; request: Promise<number | null> } | null = null

function loadAttentionCount(epoch: number): Promise<number | null> {
  if (inFlight?.epoch === epoch) return inFlight.request

  const request: Promise<number | null> = (async () => {
    const supabase = createClientComponent()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return null

    const { data } = await supabase
      .from('scanned_contacts')
      .select('next_action_date')
      .eq('user_id', user.id)
      .not('next_action_date', 'is', null)

    if (!data) return null
    return attentionCount(bucketFollowUps(data))
  })().finally(() => {
    if (inFlight?.request === request) inFlight = null
  })

  inFlight = { epoch, request }
  return request
}

/**
 * Real count of follow-ups that are overdue or due today.
 * Returns 0 (badge hidden) until the query resolves — never a placeholder number.
 */
export function useFollowUpBadge() {
  const [count, setCount] = useState(0)
  const accountEpoch = useAccountEpoch()

  useEffect(() => {
    let active = true
    setCount(0)
    loadAttentionCount(accountEpoch).then((next) => {
      if (active && next !== null) setCount(next)
    })

    return () => {
      active = false
    }
  }, [accountEpoch])

  return count
}
