import { redirect } from 'next/navigation'

/**
 * /profile was the single account screen: identity, plan, follow-up
 * preferences and sign-out on one page with one Save button that applied to
 * some of them. Those are four separate concerns and now live at four separate
 * addresses under /settings.
 *
 * This redirect is what keeps the old links, bookmarks and the browser's
 * history working. It is deliberately not a second settings screen — one
 * settings surface, reachable from every address that ever pointed at one.
 */
export default function ProfilePage() {
  redirect('/settings')
}
