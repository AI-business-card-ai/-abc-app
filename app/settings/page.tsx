import { redirect } from 'next/navigation'

/**
 * Settings used to render a second copy of the account screen, reachable from
 * an "Integrations" nav item. The integrations there were not functional, so
 * this now points at the one account screen and keeps old links working.
 */
export default function SettingsPage() {
  redirect('/profile')
}
