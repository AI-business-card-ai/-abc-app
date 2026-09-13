/**
 * Telling "the connection failed" apart from "the server said no".
 *
 * When fetch cannot reach the server at all it rejects with a TypeError worded
 * by the browser: "Load failed" in Safari, "Failed to fetch" in Chrome,
 * "NetworkError when attempting to fetch resource." in Firefox. Shown as it
 * is, an iPhone at a fair with no signal reports that a scan "Load failed",
 * which reads like a verdict on the card rather than on the Wi-Fi.
 *
 * Matched whole, not by substring: these are the exact messages that mean the
 * request never got an answer. A server error that happens to contain the
 * words is still the server's error and is shown unchanged.
 */
const NETWORK_FAILURE_MESSAGES = [
  'failed to fetch',
  'load failed',
  'networkerror when attempting to fetch resource',
  'network request failed',
  'the internet connection appears to be offline',
  'the network connection was lost',
]

export const NETWORK_FAILURE_MESSAGE = 'Could not reach ABC. Check your connection and try again.'

export function isNetworkFailure(message: string): boolean {
  const normalized = message.trim().toLowerCase().replace(/\.$/, '')
  return NETWORK_FAILURE_MESSAGES.includes(normalized)
}

/** A caught error, worded for the screen: a lost connection in plain words, anything else as it was. */
export function userFacingRequestError(err: unknown, fallback: string): string {
  if (!(err instanceof Error)) return fallback
  return isNetworkFailure(err.message) ? NETWORK_FAILURE_MESSAGE : err.message
}
