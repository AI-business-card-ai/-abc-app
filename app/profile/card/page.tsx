import { redirect } from 'next/navigation'

/**
 * The card editor moved to /settings/card, where the rest of the card's
 * settings now live. The editor itself did not change and was not copied —
 * /settings/card renders the same CardEditorShell this page used to render.
 */
export default function ProfileCardPage() {
  redirect('/settings/card')
}
