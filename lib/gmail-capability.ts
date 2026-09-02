/**
 * One answer to "can this account send Gmail".
 *
 * The column is `abc_profiles.google_connected`, and it is the only part of the
 * Gmail grant a browser is allowed to see — the tokens themselves are in
 * `PROFILE_SECRET_FIELDS` and are stripped before a profile ever becomes a
 * client prop. So screens ask this, not the tokens.
 *
 * What the flag means changed when signing in stopped asking for the mailbox.
 * It used to be set by any Google login, because any Google login also carried
 * `gmail.send`. Now a sign-in asks for identity alone, and the flag is written
 * only when a refresh token actually arrives — see `saveGoogleOAuthTokens`.
 * Reading it therefore answers "was a mailbox granted", not "did they use the
 * Google button".
 *
 * The server has a stricter check of its own: `getGoogleAccessTokenForUser`
 * refuses to send unless the flag *and* a refresh token are both present, so a
 * flag left true by older data still cannot produce a broken send — it produces
 * a reconnect prompt. This helper is for deciding what to offer; that one is
 * for deciding what to do.
 */
export function hasGmailGrant(profile: { google_connected?: boolean | null } | null | undefined): boolean {
  return Boolean(profile?.google_connected)
}

/** Where the Gmail grant should return somebody to, for a given contact. */
export function gmailReturnPath(contactId: string): string {
  return `/chat/${encodeURIComponent(contactId)}`
}
