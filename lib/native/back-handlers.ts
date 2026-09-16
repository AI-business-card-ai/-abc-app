'use client'

import { useEffect, useRef } from 'react'

/**
 * What Android's Back button closes before it navigates.
 *
 * The app's back listener (lib/native/shell.ts) used to walk page history
 * straight away, so Back on the full-screen card or its QR code left the page
 * underneath instead of closing the thing on top. Screens that cover the page
 * register their own existing close action here while they are the top layer;
 * Back runs the most recent one and stops. With nothing registered, history and
 * then minimising the app work exactly as before.
 *
 * Nothing listens outside the store apps, so on the web and in the PWA
 * registering is inert.
 */

type BackHandler = () => void

const handlers: BackHandler[] = []

/** Register a handler; call the returned function to remove it. */
export function pushBackHandler(handler: BackHandler): () => void {
  handlers.push(handler)
  return () => {
    const index = handlers.lastIndexOf(handler)
    if (index >= 0) handlers.splice(index, 1)
  }
}

/** Run the topmost handler. True when one ran, so Back must do nothing else. */
export function runTopBackHandler(): boolean {
  const handler = handlers[handlers.length - 1]
  if (!handler) return false
  handler()
  return true
}

/**
 * Close with Back while `active`. The latest `onBack` is always used, but the
 * registration only changes with `active`, so a re-render never moves a layer
 * above one that opened after it.
 */
export function useNativeBackHandler(active: boolean, onBack: () => void): void {
  const latest = useRef(onBack)
  latest.current = onBack

  useEffect(() => {
    if (!active) return
    return pushBackHandler(() => latest.current())
  }, [active])
}
