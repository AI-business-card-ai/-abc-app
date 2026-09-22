/**
 * robots.txt, read the way RFC 9309 says to read it.
 *
 * Pure: text in, a decision out. The fetching, caching and what to do when the
 * file cannot be read live in `http.ts`; this only answers "may this agent
 * fetch this path, and how slowly".
 *
 * The rules that matter:
 *
 *   * The group for the most specific matching user-agent applies, and only
 *     that group — a `*` group is the fallback, never merged in.
 *   * The longest matching rule wins; on a tie, Allow wins.
 *   * `*` matches any run of characters and a trailing `$` anchors the end.
 *   * An empty Disallow allows everything.
 *
 * ABC reads this file to obey it. There is no mode that reads it to route
 * around it.
 */

export type RobotsRule = { allow: boolean; pattern: string }

export type RobotsGroup = {
  agents: string[]
  rules: RobotsRule[]
  crawlDelaySeconds: number | null
}

export type RobotsPolicy = {
  groups: RobotsGroup[]
}

/** A policy that allows everything: what a missing robots.txt means. */
export const ALLOW_ALL: RobotsPolicy = { groups: [] }

/** A policy that allows nothing: what an unreadable or forbidden robots.txt means here. */
export const DISALLOW_ALL: RobotsPolicy = {
  groups: [{ agents: ['*'], rules: [{ allow: false, pattern: '/' }], crawlDelaySeconds: null }],
}

export function parseRobots(text: string): RobotsPolicy {
  const groups: RobotsGroup[] = []
  let current: RobotsGroup | null = null
  // A run of user-agent lines opens one group; the first rule line closes the run.
  let collectingAgents = false

  for (const rawLine of text.replace(/^﻿/, '').split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, '').trim()
    if (!line) continue
    const colon = line.indexOf(':')
    if (colon < 0) continue
    const key = line.slice(0, colon).trim().toLowerCase()
    const value = line.slice(colon + 1).trim()

    if (key === 'user-agent') {
      if (!current || !collectingAgents) {
        current = { agents: [], rules: [], crawlDelaySeconds: null }
        groups.push(current)
      }
      current.agents.push(value.toLowerCase())
      collectingAgents = true
      continue
    }

    if (!current) continue
    collectingAgents = false

    if (key === 'allow' || key === 'disallow') {
      // "Disallow:" with no path disallows nothing.
      if (!value) continue
      current.rules.push({ allow: key === 'allow', pattern: value })
    } else if (key === 'crawl-delay') {
      const seconds = Number(value)
      if (Number.isFinite(seconds) && seconds >= 0) current.crawlDelaySeconds = seconds
    }
  }

  return { groups }
}

/**
 * The group that governs this agent.
 *
 * `productToken` is the name before the slash in a User-Agent header. A group
 * applies when its agent value is a case-insensitive prefix of the token (so a
 * group for `abceventintelligence` applies to `ABCEventIntelligence`); the most
 * specific such agent wins, and `*` is used only when none matches.
 *
 * Every group naming that agent is merged into one (RFC 9309 §2.2.1). Real
 * files repeat `User-agent: *` — medica-tradefair.com does, with a second
 * `*` group further down that disallows its exhibitor search — and reading
 * only the first group silently drops the rules in the second.
 */
export function groupFor(policy: RobotsPolicy, productToken: string): RobotsGroup | null {
  const token = productToken.toLowerCase()
  let bestAgent: string | null = null

  for (const group of policy.groups) {
    for (const agent of group.agents) {
      if (agent === '*') continue
      if (token.startsWith(agent) && agent.length > (bestAgent?.length ?? -1)) bestAgent = agent
    }
  }

  const chosen = bestAgent ?? '*'
  const matching = policy.groups.filter((group) => group.agents.includes(chosen))
  if (matching.length === 0) return null

  const delays = matching.map((g) => g.crawlDelaySeconds).filter((d): d is number => d !== null)
  return {
    agents: [chosen],
    rules: matching.flatMap((g) => g.rules),
    // Where two groups disagree, the slower one is the one to honour.
    crawlDelaySeconds: delays.length > 0 ? Math.max(...delays) : null,
  }
}

function patternToRegExp(pattern: string): RegExp {
  const anchored = pattern.endsWith('$')
  const body = anchored ? pattern.slice(0, -1) : pattern
  const escaped = body
    .split('*')
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*')
  return new RegExp(`^${escaped}${anchored ? '$' : ''}`)
}

/** The path and query robots rules are matched against. */
function matchTarget(url: URL): string {
  return `${url.pathname || '/'}${url.search}`
}

export type RobotsDecision = {
  allowed: boolean
  crawlDelaySeconds: number | null
  rule: string | null
  /** Refused because the site opted this path out for AI crawlers, not for ABC by name. */
  aiOptOut?: boolean
}

/**
 * Crawlers that exist to gather material for AI systems. A site that
 * disallows a path for these by name has said, in the machine-readable way it
 * has available, that it does not want that content collected for AI use.
 */
export const AI_CRAWLER_TOKENS = [
  'gptbot',
  'chatgpt-user',
  'oai-searchbot',
  'claudebot',
  'claude-web',
  'anthropic-ai',
  'google-extended',
  'ccbot',
  'perplexitybot',
  'applebot-extended',
  'bytespider',
  'meta-externalagent',
  'cohere-ai',
] as const

function decideFor(group: RobotsGroup | null, url: URL): { allowed: boolean; rule: string | null } {
  if (!group) return { allowed: true, rule: null }
  const target = matchTarget(url)
  let winner: RobotsRule | null = null
  for (const rule of group.rules) {
    if (!patternToRegExp(rule.pattern).test(target)) continue
    if (
      !winner ||
      rule.pattern.length > winner.pattern.length ||
      (rule.pattern.length === winner.pattern.length && rule.allow && !winner.allow)
    ) {
      winner = rule
    }
  }
  return { allowed: winner ? winner.allow : true, rule: winner ? `${winner.allow ? 'Allow' : 'Disallow'}: ${winner.pattern}` : null }
}

/**
 * May this agent fetch this URL.
 *
 * By default ABC also honours an **AI opt-out**: if the site disallows the
 * path for a named AI crawler, ABC treats it as disallowed for itself too.
 * ABC is an AI product, and a site that has told AI crawlers to stay out of
 * its exhibitor directory has not invited a differently named one in. Only
 * groups that name an AI crawler explicitly count — the `*` group is not an
 * opt-out, it is the rule for everyone and is already applied above.
 *
 * `honourAiOptOut: false` exists for a source whose owner has agreed terms
 * with ABC; nothing sets it by default.
 */
export function robotsDecision(
  policy: RobotsPolicy,
  productToken: string,
  url: URL,
  options: { honourAiOptOut?: boolean } = {}
): RobotsDecision {
  const group = groupFor(policy, productToken)
  const crawlDelaySeconds = group?.crawlDelaySeconds ?? null

  // /robots.txt itself is always fetchable.
  if (url.pathname === '/robots.txt') return { allowed: true, crawlDelaySeconds, rule: null }

  const own = decideFor(group, url)
  if (!own.allowed) return { allowed: false, crawlDelaySeconds, rule: own.rule }

  if (options.honourAiOptOut !== false) {
    for (const bot of AI_CRAWLER_TOKENS) {
      const named = policy.groups.filter((g) => g.agents.includes(bot))
      if (named.length === 0) continue
      const decision = decideFor({ agents: [bot], rules: named.flatMap((g) => g.rules), crawlDelaySeconds: null }, url)
      if (!decision.allowed) {
        return { allowed: false, crawlDelaySeconds, rule: `AI opt-out (${bot}) ${decision.rule}`, aiOptOut: true }
      }
    }
  }

  return { allowed: true, crawlDelaySeconds, rule: own.rule }
}
