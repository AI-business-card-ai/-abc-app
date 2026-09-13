/**
 * What a failed sign-in is allowed to say out loud.
 *
 * The auth callback used to append the provider's own message to the redirect —
 * `reason=exchange_failed:<whatever Supabase or Google said>`. The login page
 * never rendered it, so nothing was reflected into the page, but it still
 * reached the address bar, the browser's history, and the logs of anything the
 * browser talked to next. A stable code tells a stranger as much as they need
 * and nothing they should not have.
 *
 * These are part of the URL contract, so they are worth keeping stable: change
 * a value and any bookmark, log filter or support script that recognises it
 * stops recognising it. The detail behind each one stays server-side, in the
 * callback's own console.error.
 */
export const AUTH_ERROR_CODES = {
  /** No `code` came back — usually the person cancelled at the provider. */
  missingCode: 'oauth_missing_code',
  exchangeFailed: 'oauth_exchange_failed',
  userFailed: 'oauth_user_failed',
  sessionFailed: 'oauth_session_failed',
  profileFailed: 'oauth_profile_failed',
  tokenSaveFailed: 'oauth_token_save_failed',
  unexpected: 'oauth_unexpected',
} as const

export type AuthErrorCode = (typeof AUTH_ERROR_CODES)[keyof typeof AUTH_ERROR_CODES]

const GENERIC_AUTH_ERROR = 'We could not finish signing you in. Please try again.'

/**
 * The sentence the login page shows for each code — chosen here, never read
 * from the URL. An unrecognised reason gets the generic line, so a crafted
 * link can only make the page say something this file already says.
 *
 * These existed as codes before they had words: a failed callback landed on
 * the login page and the page said nothing, which looks exactly like the
 * button not working. The exchange failure names its commonest real cause. A
 * reset link opens in whatever the mail app hands it to, and an installed
 * iPhone app keeps its cookies apart from Safari's, so the browser that opens
 * the link does not hold the half of the handshake the app started.
 */
export const AUTH_ERROR_MESSAGES: Record<AuthErrorCode, string> = {
  oauth_missing_code: 'Sign-in was cancelled before it finished. Please try again.',
  oauth_exchange_failed:
    'We could not finish signing you in. If you opened a link from an email, it has to be opened in the same browser or app you requested it from — request a new one here and try again.',
  oauth_user_failed: GENERIC_AUTH_ERROR,
  oauth_session_failed: GENERIC_AUTH_ERROR,
  oauth_profile_failed: GENERIC_AUTH_ERROR,
  oauth_token_save_failed: GENERIC_AUTH_ERROR,
  oauth_unexpected: GENERIC_AUTH_ERROR,
}

export function authErrorMessage(reason: string | null | undefined): string {
  const known = Object.values(AUTH_ERROR_CODES) as string[]
  return reason && known.includes(reason) ? AUTH_ERROR_MESSAGES[reason as AuthErrorCode] : GENERIC_AUTH_ERROR
}
