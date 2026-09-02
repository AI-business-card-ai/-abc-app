import type { ReactNode } from 'react'

/**
 * Render something exactly as it is, but make it impossible to operate.
 *
 * The case this exists for: presentation mode shows the owner's real public
 * card — the same renderer `/d/<slug>` uses, links, Save contact and all — on a
 * phone that is being held out towards somebody else. Every one of those
 * controls is correct on the public card and wrong here, where a stray thumb
 * would download the owner's own vCard or navigate away mid-conversation. The
 * card has to look live and behave like a photograph of itself.
 *
 * Two mechanisms, deliberately:
 *
 * - `inert` is the standards answer. It takes the whole subtree out of the tab
 *   order, blocks activation from pointer and keyboard alike, and removes it
 *   from the accessibility tree. Supported in Safari 15.5+, Chrome 102+ and
 *   Firefox 112+, which covers the iPhone this is for.
 * - `pointer-events: none` is the floor. Where `inert` is not understood, taps
 *   still cannot reach anything inside.
 *
 * `pointer-events: none` is also what keeps scrolling working: touches pass
 * straight through to whatever scroll container this sits in, so a card taller
 * than the screen still scrolls under the finger.
 *
 * Nothing here knows about cards. It wraps the canonical renderer rather than
 * forking it, so the public card keeps every behaviour this one gives up.
 */
export default function InertContent({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div
      className={`pointer-events-none select-none ${className ?? ''}`}
      /*
        React 18's JSX types predate `inert`, and React passes an unknown
        attribute through to the DOM when its value is a string. `inert=""` is
        the present form of a boolean attribute, so this reaches the browser as
        a real `inert`, not as a stray prop.
      */
      {...({ inert: '' } as Record<string, unknown>)}
    >
      {children}
    </div>
  )
}
