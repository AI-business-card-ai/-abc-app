'use client'

/**
 * Retries the page that failed, not a fixed one.
 *
 * The service worker shows the offline page at the address the person was
 * trying to open, so reloading asks for that address again. The old link went
 * to /scan, which dropped somebody who had been opening a contact onto a screen
 * they had not asked for. Only when /offline itself is the address is there
 * nothing to retry, and then Home is the sensible place to go.
 */
export default function RetryButton() {
  function retry() {
    if (window.location.pathname === '/offline') window.location.assign('/home')
    else window.location.reload()
  }

  return (
    <button
      type="button"
      onClick={retry}
      className="interactive-primary rounded-xl px-5 py-3 text-sm font-semibold text-white"
      style={{ background: 'var(--accent-gradient)' }}
    >
      Try again
    </button>
  )
}
