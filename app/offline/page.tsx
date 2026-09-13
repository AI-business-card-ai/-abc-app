import { IconWifiOff } from '@tabler/icons-react'
import OfflineRetryButton from '@/components/pwa/OfflineRetryButton'

export const metadata = {
  title: 'Offline — ABC Card',
}

/**
 * What ABC shows when a page cannot load.
 *
 * The service worker precaches this and serves it in place of any page whose
 * request fails. An installed app has no address bar and no browser error page
 * to fall back on, so without it a lost connection is a dead end.
 *
 * It promises nothing ABC does not do. Nothing is stored or queued on the
 * device while offline: scans, notes and contacts are saved to the account
 * when their request succeeds, and not before. The previous copy said scanned
 * cards would be sent once the connection returned, which nothing in the app
 * has ever done.
 */
export default function OfflinePage() {
  return (
    <main
      className="flex min-h-[100dvh] flex-col items-center justify-center bg-abc-bg px-6 text-center"
      style={{
        paddingTop: 'max(24px, env(safe-area-inset-top))',
        paddingBottom: 'max(24px, env(safe-area-inset-bottom))',
      }}
    >
      <IconWifiOff size={40} stroke={1.6} aria-hidden="true" className="text-abc-muted" />
      <h1 className="mt-5 text-[20px] font-semibold text-abc-text">You&apos;re offline</h1>
      <p className="mt-3 max-w-sm text-[14px] leading-[1.6] text-abc-secondary">
        ABC Card needs an internet connection to open this page. Your card and the contacts you
        have saved live in your account, not on this device, so they will be here when you
        reconnect.
      </p>
      <div className="mt-8">
        <OfflineRetryButton />
      </div>
    </main>
  )
}
