import { Directory, Filesystem } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'
import { DOWNLOAD_FAILED_MESSAGE, downloadFilename, fallbackDownloadName } from '@/lib/native/files'

/**
 * Files inside the native app: fetched, written to the app's cache, and handed
 * to the system share sheet.
 *
 * A WebView does not save downloads (see NATIVE_DOWNLOAD_PATHS). The share sheet
 * is where iOS and Android let a person decide what a file becomes — a contact,
 * a note in Files, an attachment, a saved image — so every download goes the
 * same way rather than each type inventing its own.
 *
 * The fetch runs inside the WebView, with its session, so owner-only files such
 * as a Wallet pass need no second authentication. Only the cache directory is
 * written, which needs no storage permission on either platform.
 *
 * Imported only by the shell and by open-download.ts, both of which load it on
 * demand inside the native app. The web never downloads this module.
 */

export async function nativeDownload(path: string, suggestedName?: string | null): Promise<void> {
  try {
    const res = await fetch(path, { credentials: 'same-origin', cache: 'no-store' })
    if (!res.ok) throw new Error(`download failed with ${res.status}`)
    const blob = await res.blob()
    const name = downloadFilename(res.headers.get('content-disposition'), suggestedName || fallbackDownloadName(path))
    await handToSystem(blob, name)
  } catch (err) {
    reportFailure(err)
  }
}

/** A file the page already holds in memory — a generated CSV, say — behind a blob: or data: URL. */
export async function nativeSaveBlobUrl(href: string, suggestedName?: string | null): Promise<void> {
  try {
    const blob = await (await fetch(href)).blob()
    await handToSystem(blob, downloadFilename(null, suggestedName || 'download'))
  } catch (err) {
    reportFailure(err)
  }
}

async function handToSystem(blob: Blob, filename: string) {
  const written = await Filesystem.writeFile({
    path: `abc-files/${filename}`,
    data: await blobToBase64(blob),
    directory: Directory.Cache,
    recursive: true,
  })
  try {
    await Share.share({ title: filename, files: [written.uri], dialogTitle: filename })
  } catch (err) {
    // Dismissing the sheet is a choice, not a failure.
    if (!/cancel/i.test(err instanceof Error ? err.message : String(err))) throw err
  }
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error ?? new Error('could not read the file'))
    reader.onload = () => {
      const result = String(reader.result ?? '')
      resolve(result.slice(result.indexOf(',') + 1))
    }
    reader.readAsDataURL(blob)
  })
}

function reportFailure(err: unknown) {
  console.error('[native] file handoff failed:', err)
  window.alert(DOWNLOAD_FAILED_MESSAGE)
}
