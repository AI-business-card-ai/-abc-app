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
