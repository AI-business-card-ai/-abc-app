'use client'

import { IconRefresh } from '@tabler/icons-react'
import Button from '@/components/ui/abc/Button'

/**
 * Retries the page that failed, not a fixed one.
 *
 * The service worker shows the offline page at the address the person was
 * trying to open, so reloading asks for that address again. The old button
 * linked to /scan, which dropped somebody who had been opening a contact onto
 * a screen they had not asked for. Only when /offline itself is the address is
 * there nothing to retry, and then Home is the sensible place to go.
 */
export default function OfflineRetryButton() {
  function retry() {
    if (window.location.pathname === '/offline') window.location.assign('/home')
    else window.location.reload()
  }

  return (
    <Button onClick={retry} size="lg">
      <IconRefresh size={18} stroke={1.8} aria-hidden="true" />
      Try again
    </Button>
  )
}
