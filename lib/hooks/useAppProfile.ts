'use client'

import { useEffect, useState, useSyncExternalStore } from 'react'
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
 *
 * Read through useSyncExternalStore rather than as initial state. The shell
 * hydrates first and can fill the cache before a streamed page such as Home
 * hydrates; a page that then started from the cache rendered the owner's
 * initials where its server HTML had the fallback, and React threw away the
 * whole boundary (#425, #422). The server snapshot is always "no profile", so
 * hydration matches the HTML and the cached profile follows a frame later.
 * A component mounted after hydration — every client-side navigation — reads
 * the cache straight away, as before.
 */
let cached: AppProfile | null = null
let inFlight: Promise<AppProfile | null> | null = null
const listeners = new Set<() => void>()

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function setCached(next: AppProfile | null) {
  cached = next
  listeners.forEach((listener) => listener())
}

const getSnapshot = () => cached
const getServerSnapshot = () => null

export function useAppProfile() {
  const profile = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
  // Set once this component's fetch has answered, profile or not.
  const [settled, setSettled] = useState(false)

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
        setCached(next)
        return next
      })().finally(() => {
        inFlight = null
      })
    }

    inFlight.then(() => {
      if (!active) return
      setSettled(true)
    })

    return () => {
      active = false
    }
  }, [])

  return { profile, loading: !profile && !settled }
}

/** Call after the user edits their profile so the shell picks up new values. */
export function clearAppProfileCache() {
  setCached(null)
}
