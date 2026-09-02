/**
 * Where an identity provider sends the browser back to.
 *
 * One builder for every provider. Google had its own, and when Apple arrived
 * the choice was to copy it or to share it — and a second copy of redirect
 * construction is a second place for the next-path handling to drift, which is
 * the part that decides where somebody lands after authenticating.
 *
 * The origin comes from the browser rather than configuration because the PKCE
 * cookies are written on whatever origin started the flow: a callback on a
 * different host cannot read them, and the exchange fails. On the server, where
 * there is no browser origin, the app's configured URL stands in.
 *
 * Note that `next` is only carried here, not trusted here — the callback runs
 * it through its own local-path check before honouring it.
 */
export function getOAuthCallbackUrl(nextPath = '/dashboard', connectUserId?: string, flow?: string) {
  const query =
    `next=${encodeURIComponent(nextPath)}` +
    (connectUserId ? `&connect=${encodeURIComponent(connectUserId)}` : '') +
    (flow ? `&flow=${encodeURIComponent(flow)}` : '')

  if (typeof window !== 'undefined') {
    return `${window.location.origin}/auth/callback?${query}`
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL
  return `${appUrl || ''}/auth/callback?${query}`
}
