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
 *
 * Module state outlives sign-out: /login is a client-side navigation away, so
 * the next account in this tab would inherit it. accountEpoch moves on every
 * change of account, and a request only publishes while its epoch is current.
 */
let cached: AppProfile | null = null
let inFlight: Promise<AppProfile | null> | null = null
let accountEpoch = 0
// undefined until Supabase has reported the session for the first time.
let sessionUserId: string | null | undefined
let watchingAuth = false
const listeners = new Set<() => void>()

function subscribe(listener: () => void) {
  watchAuth()
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function setCached(next: AppProfile | null) {
  cached = next
  listeners.forEach((listener) => listener())
}

/**
 * Abandons a document that has shown the previous account's pages.
 *
 * Only a full document load removes all of it at once: the server-rendered page
 * on screen, Next's router cache (which replays visited routes, Back and
 * Forward without asking the server), and any route payload still on its way.
 * router.refresh() and a client-side redirect each left some of that behind when
 * measured. Hidden first, because the old page stays up until the next one lands.
 */
function leaveAccount(userId: string | null) {
  document.documentElement.style.visibility = 'hidden'
  window.location.replace(userId ? '/home' : '/login')
}

function watchAuth() {
  if (watchingAuth) return
  watchingAuth = true

  const supabase = createClientComponent()

  const applySession = (userId: string | null, signedOut = false) => {
    const accountChanged =
      signedOut ||
      (cached !== null && cached.id !== userId) ||
      (sessionUserId !== undefined && sessionUserId !== userId)
    sessionUserId = userId
    if (!accountChanged) return

    accountEpoch += 1
    inFlight = null
    setCached(null)
    leaveAccount(userId)
  }

  supabase.auth.onAuthStateChange((event, session) => {
    // A first report with no session can be a refresh that failed on the
    // network, and that account may still be signed in.
    if (event === 'INITIAL_SESSION' && !session) return
    applySession(session?.user?.id ?? null, event === 'SIGNED_OUT')
  })

  // A suspended tab, or a browser without BroadcastChannel, never hears those
  // events. The cookie is still the truth when the tab is shown again.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return
    void supabase.auth.getSession().then(({ data: { session }, error }) => {
      if (!error) applySession(session?.user?.id ?? null)
    })
  })
}

/**
 * For the login screen. The server can turn a session away without the browser
 * hearing about it, and the redirect arrives as a client-side navigation.
 */
export function leavePrivateDocument() {
  if (watchingAuth) leaveAccount(null)
}

function loadProfile(): Promise<AppProfile | null> {
  if (inFlight) return inFlight

  const epoch = accountEpoch
  const supabase = createClientComponent()
  const request: Promise<AppProfile | null> = (async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user || epoch !== accountEpoch) return null

    const { data } = await supabase
      .from('abc_profiles')
      .select('full_name, avatar_url, card_photo_url, job_title, role, company_name, company')
      .eq('id', user.id)
      .maybeSingle()

    if (epoch !== accountEpoch) return null

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
    if (inFlight === request) inFlight = null
  })

  inFlight = request
  return request
}

const getSnapshot = () => cached
const getServerSnapshot = () => null
const getAccountEpoch = () => accountEpoch
const getServerAccountEpoch = () => 0

export function useAppProfile() {
  const profile = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
  // Set once this component's fetch has answered, profile or not.
  const [settled, setSettled] = useState(false)

  useEffect(() => {
    if (cached) return
    let active = true

    loadProfile().then(() => {
      if (!active) return
      setSettled(true)
    })

    return () => {
      active = false
    }
  }, [])

  return { profile, loading: !profile && !settled }
}

/** Changes whenever the signed-in account does, for state that must not outlive one. */
export function useAccountEpoch() {
  return useSyncExternalStore(subscribe, getAccountEpoch, getServerAccountEpoch)
}

/** Call after the user edits their profile so the shell picks up new values. */
export function clearAppProfileCache() {
  setCached(null)
}
