'use client'

import { useEffect, useState } from 'react'
import { createClientComponent } from '@/lib/supabase'
import { attentionCount, bucketFollowUps } from '@/lib/followups'

/**
 * Real count of follow-ups that are overdue or due today.
 * Returns 0 (badge hidden) until the query resolves — never a placeholder number.
 */
export function useFollowUpBadge() {
  const [count, setCount] = useState(0)

  useEffect(() => {
    let active = true
    ;(async () => {
      const supabase = createClientComponent()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return

      const { data } = await supabase
        .from('scanned_contacts')
        .select('next_action_date')
        .eq('user_id', user.id)
        .not('next_action_date', 'is', null)

      if (!active || !data) return
      setCount(attentionCount(bucketFollowUps(data)))
    })()

    return () => {
      active = false
    }
  }, [])

  return count
}
