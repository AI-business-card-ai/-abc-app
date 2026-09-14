import { App } from '@capacitor/app'
import { Browser } from '@capacitor/browser'
import { Share } from '@capacitor/share'
import { StatusBar, Style } from '@capacitor/status-bar'
import { handleNativeAuthLink } from '@/lib/native/auth-client'
import { parseNativeDeepLink } from '@/lib/native/deep-link'
import { nativeDownload, nativeSaveBlobUrl } from '@/lib/native/downloads'
import { classifyNavigation } from '@/lib/native/navigation'
import { getNativePlatform } from '@/lib/native/runtime'

/**
 * Everything ABC does differently inside the iOS and Android apps, installed once
 * per page.
 *
 * Loaded only after lib/native/runtime.ts has found the native bridge, so none of
 * this — and none of the Capacitor plugin code — reaches the web or the PWA.
 *
 * - Web Share goes to the native share sheet, keeping the Web Share contract, so
 *   every existing share button works unchanged.
 * - Links and window.open follow lib/native/navigation.ts: ABC pages stay in the
 *   app, other sites open in the system browser, mail and phone go to the OS,
 *   files go to the share sheet.
 * - Deep links finish sign-ins and open verified ABC addresses.
 * - Android's back button walks the page history before leaving the app.
 *
 * What it deliberately does not do is reload — on resume, on reconnect, on
 * anything. The WebView keeps the page across backgrounding: a half-captured
 * Multi-Card batch, an unsaved note, an edit to the card. The PWA already
 * learned what reloading on an event costs.
 */
export async function startNativeShell(): Promise<() => void> {
  const platform = getNativePlatform()
  if (!platform) return () => undefined

  const origin = window.location.origin
  const cleanups: Array<() => void> = []

  // Light status-bar content over ABC's near-black ground. Safe areas are already
  // handled by the page's own env(safe-area-inset-*) CSS.
  StatusBar.setStyle({ style: Style.Dark }).catch(() => undefined)

  cleanups.push(routeWebShareToNativeSheet())
  cleanups.push(routeLinksThroughPolicy(origin))
  cleanups.push(routeWindowOpenThroughPolicy(origin))

  const urlOpen = await App.addListener('appUrlOpen', ({ url }) => void openDeepLink(url))
  cleanups.push(() => void urlOpen.remove())

  // A link that launched the app from cold. Handled like any other: a sign-in
  // return is acted on only while a sign-in is pending, so seeing the same launch
  // URL again on a later page does nothing.
  const launch = await App.getLaunchUrl().catch(() => undefined)
  if (launch?.url) void openDeepLink(launch.url)

  if (platform === 'android') {
    const back = await App.addListener('backButton', ({ canGoBack }) => {
      if (canGoBack) window.history.back()
      else void App.minimizeApp()
    })
    cleanups.push(() => void back.remove())
  }

  return () => cleanups.forEach((cleanup) => cleanup())
}

async function openDeepLink(raw: string) {
  const link = parseNativeDeepLink(raw)
  if (!link) return
  if (link.kind === 'open-path') {
    if (`${window.location.pathname}${window.location.search}` !== link.path) window.location.assign(link.path)
    return
  }
  await handleNativeAuthLink(link)
}

function routeWebShareToNativeSheet(): () => void {
  const nativeShare = async (data?: ShareData) => {
    try {
      await Share.share({ title: data?.title, text: data?.text, url: data?.url, dialogTitle: data?.title })
    } catch (err) {
      // The Web Share contract: a dismissed sheet is an AbortError, which every caller already ignores.
      if (/cancel/i.test(err instanceof Error ? err.message : String(err))) {
        throw new DOMException('Share canceled', 'AbortError')
      }
      throw err
    }
  }
  Object.defineProperty(navigator, 'share', { configurable: true, writable: true, value: nativeShare })
  return () => {
    delete (navigator as unknown as Record<string, unknown>).share
  }
}

function routeLinksThroughPolicy(origin: string): () => void {
  const onClick = (event: MouseEvent) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return
    }
    const anchor = event.target instanceof Element ? event.target.closest('a[href]') : null
    if (!(anchor instanceof HTMLAnchorElement)) return

    const download = anchor.getAttribute('download')
    if (download !== null && /^(blob|data):/i.test(anchor.href)) {
      event.preventDefault()
      void nativeSaveBlobUrl(anchor.href, download)
      return
    }

    const decision = classifyNavigation(anchor.href, origin)
    switch (decision.kind) {
      case 'external':
        event.preventDefault()
        void Browser.open({ url: decision.url })
        return
      case 'download':
        event.preventDefault()
        void nativeDownload(decision.path, download)
        return
      case 'internal':
        if (download !== null) {
          event.preventDefault()
          void nativeDownload(decision.path, download)
        } else if (anchor.target === '_blank') {
          event.preventDefault()
          window.location.assign(decision.path)
        }
        // An ordinary same-window ABC link is left to the app's own router.
        return
      case 'blocked':
        event.preventDefault()
        return
      case 'system':
        // mailto:, tel: and sms: are passed to the operating system by the WebView itself.
        return
    }
  }
  document.addEventListener('click', onClick, true)
  return () => document.removeEventListener('click', onClick, true)
}

function routeWindowOpenThroughPolicy(origin: string): () => void {
  const original = window.open
  window.open = ((url?: string | URL) => {
    if (url === undefined || url === null || String(url) === '') return null
    const decision = classifyNavigation(String(url), origin)
    switch (decision.kind) {
      case 'external':
        void Browser.open({ url: decision.url })
        break
      case 'system':
        window.location.href = decision.url
        break
      case 'download':
        void nativeDownload(decision.path)
        break
      case 'internal':
        window.location.assign(decision.path)
        break
      case 'blocked':
        break
    }
    return null
  }) as typeof window.open
  return () => {
    window.open = original
  }
}
