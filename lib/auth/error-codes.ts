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
