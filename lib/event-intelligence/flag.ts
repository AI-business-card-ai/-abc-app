/**
 * Whether Event & Expo Intelligence exists at all, for this deployment.
 *
 * The feature is built on a branch, off by default, and must stay invisible in
 * production until somebody decides otherwise. That decision is a server
 * decision, so this reads a server-only variable:
 *
 *   ABC_EVENT_INTELLIGENCE=1
 *
 * Deliberately **not** prefixed `NEXT_PUBLIC_`. Next.js inlines those into the
 * client bundle, which would both publish the fact that the feature exists and
 * put the switch somewhere a browser can see. Nothing here reaches the client:
 * pages and route handlers read it on the server and either serve the feature
 * or answer as though the route does not exist.
 *
 * Off is the default in the strongest sense — unset, empty, misspelt, `0`,
 * `false`, `maybe` are all off. Only the four affirmatives below turn it on, so
 * a typo in an environment variable can never accidentally ship a feature.
 */

const ON = new Set(['1', 'true', 'on', 'yes'])

export const EVENT_INTELLIGENCE_FLAG = 'ABC_EVENT_INTELLIGENCE'

export function eventIntelligenceEnabled(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env
): boolean {
  const raw = env[EVENT_INTELLIGENCE_FLAG]
  if (typeof raw !== 'string') return false
  return ON.has(raw.trim().toLowerCase())
}

/**
 * What a disabled route says.
 *
 * 404, never 403. A 403 tells anyone who asks that there is something here to
 * be let into, which is a product announcement made by an error code. When the
 * feature is off the honest answer is that the address is not a thing.
 */
export const EVENT_INTELLIGENCE_DISABLED = { error: 'Not found' } as const
