import type { CapacitorConfig } from '@capacitor/cli'
import {
  NATIVE_APP_ID,
  NATIVE_APP_NAME,
  NATIVE_START_PATH,
  NATIVE_USER_AGENT_MARKER,
  resolveNativeOrigin,
} from './lib/native/config'

/**
 * ABC Card's native shell for the App Store and Google Play.
 *
 * The app loads ABC from its canonical origin rather than from files bundled into
 * the binary. That is deliberate. ABC renders on the server, gates every screen
 * in middleware, keeps its session in HttpOnly cookies and answers through 74 API
 * routes; a static export would be a second, lesser ABC. One origin means one
 * product, one backend and one deploy for web, PWA, iOS and Android.
 *
 * Capacitor documents `server.url` as meant for live reload and not for
 * production. Using it anyway is a decision with consequences, recorded in
 * native-shell/README.md: the app needs the network to start (a local page
 * explains when it has none), a web deploy updates the apps too, and store review
 * weighs whether the native layer is more than a website. The native layer is
 * what answers that last question — system-browser sign-in, deep links, the share
 * sheet, file handoff, the Android back button — and is loaded by
 * components/native/NativeShellBridge.tsx.
 *
 * Nothing in this file, or in anything it imports, may be a secret.
 */

const origin = resolveNativeOrigin(process.env.ABC_NATIVE_ORIGIN)

const config: CapacitorConfig = {
  appId: NATIVE_APP_ID,
  appName: NATIVE_APP_NAME,
  webDir: 'native-shell/www',
  backgroundColor: '#0a0a0b',
  server: {
    url: origin,
    appStartPath: NATIVE_START_PATH,
    errorPath: 'error.html',
    androidScheme: 'https',
    cleartext: false,
  },
  ios: {
    // The page clears the notch and home indicator itself with env(safe-area-inset-*).
    contentInset: 'never',
    appendUserAgent: `${NATIVE_USER_AGENT_MARKER}/ios`,
    // Not needed: the app runs no service worker on iOS and navigates nowhere but
    // ABC. Turning it on would also restrict script injection to listed domains.
    limitsNavigationsToAppBoundDomains: false,
  },
  android: {
    appendUserAgent: `${NATIVE_USER_AGENT_MARKER}/android`,
    allowMixedContent: false,
  },
  plugins: {
    SystemBars: {
      /*
        `native`: on current WebViews the page stays edge to edge and
        env(safe-area-inset-*) carries the real insets, which ABC's layout
        already uses; older WebViews are padded instead and read the insets as
        zero. Either way nothing is padded twice.
      */
      insetsHandling: 'native',
      initialViewportFitValueHint: 'cover',
      style: 'DARK',
    },
    // The page's own fetch and cookies, not a native re-implementation of them.
    CapacitorHttp: { enabled: false },
    CapacitorCookies: { enabled: false },
  },
}

export default config
