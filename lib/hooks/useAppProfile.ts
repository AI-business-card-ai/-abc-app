'use client'

import { useEffect, useState } from 'react'
import { createClientComponent } from '@/lib/supabase'

export type AppProfile = {
  id: string
  fullName: string
  jobTitle: string | null
  companyName: string | null
  avatarUrl: string | null
}

/**
 * Shared identity for the app shell (sidebar user block, mobile header avatar).
 * Cached at module scope so navigating between routes does not refetch.
 */
let cached: AppProfile | null = null
let inFlight: Promise<AppProfile | null> | null = null

export function useAppProfile() {
  const [profile, setProfile] = useState<AppProfile | null>(cached)
  const [loading, setLoading] = useState(!cached)

  useEffect(() => {
    if (cached) return
    let active = true

    if (!inFlight) {
      const supabase = createClientComponent()
      inFlight = (async () => {
        const {
          data: { user },
        } = await supabase.auth.getUser()
        if (!user) return null

        const { data } = await supabase
          .from('abc_profiles')
          .select('full_name, avatar_url, card_photo_url, job_title, role, company_name, company')
          .eq('id', user.id)
          .maybeSingle()

        const next: AppProfile = {
          id: user.id,
          fullName: data?.full_name || user.email?.split('@')[0] || 'ABC',
          jobTitle: data?.job_title || data?.role || null,
          companyName: data?.company_name || data?.company || null,
          avatarUrl: data?.card_photo_url || data?.avatar_url || null,
        }
        cached = next
        return next
      })().finally(() => {
        inFlight = null
      })
    }

    inFlight.then((value) => {
      if (!active) return
      setProfile(value)
      setLoading(false)
    })

    return () => {
      active = false
    }
  }, [])

  return { profile, loading }
}

/** Call after the user edits their profile so the shell picks up new values. */
export function clearAppProfileCache() {
  cached = null
}
