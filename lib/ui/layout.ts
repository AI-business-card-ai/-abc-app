/**
 * The app's fixed chrome, measured once.
 *
 * The mobile navigation is fixed to the bottom and the editor's save bar sticks
 * just above it. Both need the same number, and both used to carry their own
 * copy of it — `calc(72px + env(safe-area-inset-bottom))`, written out in four
 * places. A number repeated is a number that drifts, and when it drifts here
 * the save button ends up underneath the navigation.
 *
 * Plain strings rather than Tailwind classes because these are `env()`
 * expressions, which have to reach the browser as CSS values.
 */

/** Height of the mobile bottom navigation, excluding the home-indicator inset. */
export const MOBILE_NAV_HEIGHT = 72

/** Bottom offset for anything that must sit directly above the navigation. */
export const ABOVE_MOBILE_NAV = `calc(${MOBILE_NAV_HEIGHT}px + env(safe-area-inset-bottom))`

/**
 * Bottom padding for a scroll container so its last element clears the
 * navigation. Slightly more than the bar itself, so the final control has air
 * beneath it instead of touching the divider.
 */
export const CLEARS_MOBILE_NAV = `calc(${MOBILE_NAV_HEIGHT + 16}px + env(safe-area-inset-bottom))`

/**
 * Height of the card editor's sticky save bar, including its own padding.
 *
 * The editor needs this much clear space *on top of* whatever the app shell
 * already pads for the navigation. It used to carry a single flat 160px plus
 * its own safe-area inset, which was measured back when the shell padded
 * nothing — once the shell started clearing the navigation too, the two added
 * up and left a screen-and-a-bit of dead space under the last field.
 */
export const SAVE_BAR_HEIGHT = 78

/**
 * The status bar / Dynamic Island inset.
 *
 * The app declares `viewport-fit: cover` and installs as a standalone PWA, so
 * on an iPhone the viewport genuinely extends underneath the status bar. The
 * bottom navigation always accounted for its inset; the header never did, which
 * is why the first heading on a page appeared to sit under the notch.
 */
export const SAFE_TOP = 'env(safe-area-inset-top)'
