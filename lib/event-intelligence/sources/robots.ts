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
 * specific such group wins, and `*` is used only when none matches.
 */
export function groupFor(policy: RobotsPolicy, productToken: string): RobotsGroup | null {
  const token = productToken.toLowerCase()
  let best: RobotsGroup | null = null
  let bestLength = -1
  let star: RobotsGroup | null = null

  for (const group of policy.groups) {
    for (const agent of group.agents) {
      if (agent === '*') {
        star = star ?? group
        continue
      }
      if (token.startsWith(agent) && agent.length > bestLength) {
        best = group
        bestLength = agent.length
      }
    }
  }
  return best ?? star
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

export type RobotsDecision = { allowed: boolean; crawlDelaySeconds: number | null; rule: string | null }

export function robotsDecision(policy: RobotsPolicy, productToken: string, url: URL): RobotsDecision {
  const group = groupFor(policy, productToken)
  if (!group) return { allowed: true, crawlDelaySeconds: null, rule: null }

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

  // /robots.txt itself is always fetchable.
  if (url.pathname === '/robots.txt') return { allowed: true, crawlDelaySeconds: group.crawlDelaySeconds, rule: null }

  return {
    allowed: winner ? winner.allow : true,
    crawlDelaySeconds: group.crawlDelaySeconds,
    rule: winner ? `${winner.allow ? 'Allow' : 'Disallow'}: ${winner.pattern}` : null,
  }
}
