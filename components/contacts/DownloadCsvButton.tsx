'use client'

import { useCallback, useRef, useState } from 'react'
import { IconDownload } from '@tabler/icons-react'
import Button from '@/components/ui/abc/Button'
import { runCsvDownload } from '@/lib/export/download-csv'

/**
 * Download this owner's contacts and meetings as a CSV file.
 *
 * One control, one route. CSV is not a CRM here: there is no Connect, no
 * Disconnect and no connected state to render, because there is nothing to
 * connect to — this is ABC's own data leaving in a format any spreadsheet or
 * importer can read.
 *
 * The file is built by `/api/export/csv` and never in the browser. All this
 * component owns is the two states a download has that a link cannot show:
 * that it is running, and that it failed.
 *
 * Failure is reported through `onError` rather than a panel of its own, so the
 * screen that hosts the button says it the way that screen already says things.
 */

/**
 * Hand a finished file to the browser.
 *
 * The same shape as the vCard download already in the app, for the same
 * reason: iOS Safari will not open a blob URL, so the bytes go through a data
 * URL there and an object URL everywhere else.
 *
 * No byte-order mark is added. The route already emits one, and a second would
 * land in the first cell.
 */
function saveBlob(blob: Blob, filename: string) {
  const isIOS =
    typeof navigator !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent)

  const click = (href: string, revoke?: () => void) => {
    const link = document.createElement('a')
    link.href = href
    link.setAttribute('download', filename)
    document.body.appendChild(link)
    link.click()
    setTimeout(() => {
      document.body.removeChild(link)
      revoke?.()
    }, 100)
  }

  if (isIOS) {
    const reader = new FileReader()
    reader.onload = () => click(String(reader.result))
    reader.readAsDataURL(blob)
    return
  }

  const url = URL.createObjectURL(blob)
  click(url, () => URL.revokeObjectURL(url))
}

export default function DownloadCsvButton({
  onError,
}: {
  onError?: (message: string) => void
}) {
  const [busy, setBusy] = useState(false)

  /*
    The guard is a ref rather than the state above because two clicks in the
    same frame both read the old state. A download writes nothing, so a second
    request would be harmless — but it would also produce a second file the
    person did not ask for.
  */
  const running = useRef(false)

  const download = useCallback(async () => {
    if (running.current) return
    running.current = true
    setBusy(true)

    const result = await runCsvDownload({
      // Wrapped rather than passed by reference: a bare `fetch` loses its
      // receiver in some environments.
      fetchImpl: (url, init) => fetch(url, init),
      save: saveBlob,
    })

    running.current = false
    setBusy(false)
    if (!result.ok) onError?.(result.message)
  }, [onError])

  return (
    <Button
      variant="surface"
      size="md"
      onClick={() => void download()}
      disabled={busy}
      className="shrink-0"
    >
      <IconDownload size={18} stroke={1.9} />
      {busy ? 'Downloading…' : 'Download CSV'}
    </Button>
  )
}
