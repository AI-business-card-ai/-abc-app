import { isNativeApp } from '@/lib/native/runtime'

/**
 * Opens an ABC response that is a file.
 *
 * On the web and in the PWA the browser saves it, exactly as before. Inside the
 * native app the WebView would do nothing with it, so the file is handed to the
 * system instead. For the places that start a download from code rather than
 * from a link, which the shell's link handling cannot see.
 */
export function openDownload(path: string): void {
  if (!isNativeApp()) {
    window.location.href = path
    return
  }
  void import('@/lib/native/downloads').then(({ nativeDownload }) => nativeDownload(path))
}
