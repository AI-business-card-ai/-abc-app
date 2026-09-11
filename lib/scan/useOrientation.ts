'use client'

import { useEffect, useState } from 'react'

/**
 * Whether the viewer is holding a phone upright.
 *
 * "Mobile" is a touch-first device with no hover, not a narrow window: a
 * desktop browser dragged thin is still a desktop, and has nothing to rotate.
 * Both answers come from media queries rather than from `screen.orientation`,
 * which some mobile browsers still do not implement, and both update as the
 * device turns — so guidance that asks the owner to rotate goes away the
 * moment they do.
 *
 * Starts as `false` on both counts, which is also what the server renders:
 * a hint that appears once the client knows is better than one that flashes
 * on a desktop during hydration.
 */
export type OrientationState = { mobile: boolean; portrait: boolean }

/**
 * Whether to suggest turning the phone sideways for a multi-card photo.
 *
 * Only on a phone that is upright, only while the viewfinder is live — the
 * suggestion is about framing a live shot, and says nothing to someone
 * uploading a photo they already took — and never again once dismissed. A
 * suggestion, not a gate: nothing here can stop a capture.
 */
export function shouldSuggestLandscape(
  orientation: OrientationState,
  { live, dismissed }: { live: boolean; dismissed: boolean }
): boolean {
  return orientation.mobile && orientation.portrait && live && !dismissed
}

/**
 * Whether the multi-card camera should take over the whole screen.
 *
 * A phone held sideways with the camera live is the one moment the owner is
 * framing a table of cards, and every pixel of height the app keeps for its
 * own chrome is a pixel the cards do not get. So exactly then — a touch phone,
 * landscape, the multi-card capture stage, a live camera and room to capture —
 * the camera becomes the screen. Back opts out until the phone goes upright
 * again or a new capture begins; anything else keeps the ordinary page.
 */
export function shouldEnterImmersive(
  orientation: OrientationState,
  {
    capturing,
    live,
    canCapture,
    exited,
  }: { capturing: boolean; live: boolean; canCapture: boolean; exited: boolean }
): boolean {
  return orientation.mobile && !orientation.portrait && capturing && live && canCapture && !exited
}

/**
 * Where the full-screen multi-card frame sits, as CSS lengths from each edge.
 *
 * The camera itself runs edge to edge; only the guide and the two controls
 * keep clear of the phone's own shape. The frame stays a thin 10–12px off
 * every edge. Top and bottom it also clears the safe area (the home indicator
 * sits there). On the sides it reaches into the landscape safe area to within
 * 16px of its inner line — past the notch or island, which is narrower than
 * the inset iOS reports — because width is what lets the owner bring the phone
 * closer to a row of cards. The controls, by contrast, sit wholly inside it.
 */
export const IMMERSIVE_FRAME_INSETS = {
  top: 'max(10px, calc(env(safe-area-inset-top) + 8px))',
  bottom: 'max(10px, calc(env(safe-area-inset-bottom) + 4px))',
  left: 'max(12px, calc(env(safe-area-inset-left) - 16px))',
  right: 'max(12px, calc(env(safe-area-inset-right) - 16px))',
} as const

export function useOrientation(): OrientationState {
  const [state, setState] = useState({ mobile: false, portrait: false })

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return

    const touch = window.matchMedia('(hover: none) and (pointer: coarse)')
    const upright = window.matchMedia('(orientation: portrait)')

    const read = () => setState({ mobile: touch.matches, portrait: upright.matches })
    read()

    touch.addEventListener?.('change', read)
    upright.addEventListener?.('change', read)
    return () => {
      touch.removeEventListener?.('change', read)
      upright.removeEventListener?.('change', read)
    }
  }, [])

  return state
}
