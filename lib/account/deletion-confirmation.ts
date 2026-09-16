/**
 * The confirmation an account deletion request must carry, and the words the
 * screens use for each outcome.
 *
 * Shared by the route and the Settings screen, and free of server imports so
 * the browser can use it. The typed phrase is proof of intent, never of
 * identity: who is deleting is decided by the verified session alone.
 */

export const ACCOUNT_DELETION_PHRASE = 'DELETE'

/**
 * `{ confirm: 'DELETE' }`, allowing the surrounding whitespace a phone keyboard
 * adds. Anything else — lowercase, a boolean, a missing field — is not a
 * confirmation.
 */
export function isAccountDeletionConfirmed(body: unknown): boolean {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return false
  const value = (body as { confirm?: unknown }).confirm
  return typeof value === 'string' && value.trim() === ACCOUNT_DELETION_PHRASE
}

export type AccountDeletionErrorCode =
  | 'unauthorized'
  | 'invalid_request'
  | 'confirmation_required'
  | 'active_subscription'
  | 'deletion_incomplete'

export const ACCOUNT_DELETION_ERROR_CODES: readonly AccountDeletionErrorCode[] = [
  'unauthorized',
  'invalid_request',
  'confirmation_required',
  'active_subscription',
  'deletion_incomplete',
]

/** What the owner is told. Each is true whatever step the server stopped at. */
export function accountDeletionMessage(code: string | null | undefined): string {
  switch (code) {
    case 'unauthorized':
      return 'Your session has ended. Sign in again, then delete your account.'
    case 'confirmation_required':
      return `Type ${ACCOUNT_DELETION_PHRASE} to confirm.`
    case 'active_subscription':
      return 'You have an ABC Pro subscription that will still renew. Cancel it in Plan & Billing first, then delete your account.'
    case 'network':
      return 'ABC could not be reached. Check your connection and try again.'
    case 'deletion_incomplete':
    case 'invalid_request':
    default:
      return 'Your account was not fully deleted. Nothing was charged or refunded. Try again — if it keeps happening, contact support@abccard.io.'
  }
}
