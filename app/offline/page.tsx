import RetryButton from './RetryButton'

export const metadata = {
  title: 'Offline — ABC',
}

/**
 * What ABC shows when a page cannot load.
 *
 * The service worker precaches this and serves it in place of any page whose
 * request fails. It promises nothing ABC does not do: nothing is stored or
 * queued on the device while offline, and scans, notes and contacts reach the
 * account only when their request succeeds. The previous copy said scanned
 * cards would go out once the connection returned, which nothing in the app has
 * ever done.
 */
export default function OfflinePage() {
  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-6 text-center"
      style={{ background: '#0f0f0f' }}
    >
      <p className="text-4xl mb-4" aria-hidden>
        📡
      </p>
      <h1 className="text-xl font-bold mb-3" style={{ color: '#ffffff' }}>
        You&apos;re offline
      </h1>
      <p className="text-sm max-w-sm leading-relaxed mb-8" style={{ color: '#999999' }}>
        ABC Card needs an internet connection to open this page. Your card and the contacts you
        have saved live in your account, not on this device, so they will be here when you
        reconnect.
      </p>
      <RetryButton />
    </div>
  )
}
