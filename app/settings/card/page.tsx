import CardEditorShell from '@/components/card/CardEditorShell'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'My Card Settings — ABC',
}

/**
 * The card editor, at its address.
 *
 * This renders the same CardEditorShell that /profile/card used to render —
 * moved, not copied. There is one card editor, and /profile/card now redirects
 * here so that no link points at a second one.
 */
export default function CardSettingsPage() {
  return <CardEditorShell />
}
