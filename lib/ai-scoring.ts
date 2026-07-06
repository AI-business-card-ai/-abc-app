import Anthropic from '@anthropic-ai/sdk'
import type { ABCProfile, ScannedContact } from './types'
import { PERSONAL_MEETING_SCORE_BONUS, getContactMeetingContext } from './event-tag'
import { isLinkedInDataTrusted, stripUntrustedLinkedInFields } from './linkedin-identity'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
})

export type AiMatchScoreResult = {
  score: number
  rating: string
  match_reason: string
  icp_fit: number
  intent_signals: number
  timing: number
  accessibility: number
  red_flags: string
  conversation_starters: string[]
}

export function scoreToRating(score: number): string {
  if (score >= 70) return 'Hot'
  if (score >= 40) return 'Warm'
  return 'Cold'
}

export function applyPersonalMeetingBonus(result: AiMatchScoreResult): AiMatchScoreResult {
  const intent = Math.min(100, Math.round(result.intent_signals) + PERSONAL_MEETING_SCORE_BONUS)
  const score = Math.round(
    result.icp_fit * 0.4 + intent * 0.3 + result.timing * 0.2 + result.accessibility * 0.1
  )
  const clamped = Math.max(0, Math.min(100, score))
  return {
    ...result,
    intent_signals: intent,
    score: clamped,
    rating: scoreToRating(clamped),
    match_reason: result.match_reason
      ? `${result.match_reason} In-person meeting context adds warmth (+${PERSONAL_MEETING_SCORE_BONUS} intent).`
      : `In-person meeting context adds warmth (+${PERSONAL_MEETING_SCORE_BONUS} intent).`,
  }
}

export function aiScoreToDbFields(result: AiMatchScoreResult) {
  const score = Math.max(0, Math.min(100, Math.round(result.score)))
  return {
    ai_lead_score: score,
    match_score: score,
    rating: result.rating || scoreToRating(score),
    match_reason: result.match_reason,
    icp_fit_score: Math.round(result.icp_fit),
    intent_score: Math.round(result.intent_signals),
    timing_score: Math.round(result.timing),
    accessibility_score: Math.round(result.accessibility),
    red_flags: result.red_flags || null,
    conversation_starters: result.conversation_starters?.length ? result.conversation_starters : null,
  }
}

function parseScoreJson(text: string): AiMatchScoreResult | null {
  const clean = text.replace(/```json|```/g, '').trim()
  try {
    return JSON.parse(clean) as AiMatchScoreResult
  } catch {
    const match = clean.match(/\{[\s\S]*\}/)
    if (!match) return null
    try {
      return JSON.parse(match[0]) as AiMatchScoreResult
    } catch {
      return null
    }
  }
}

function splitName(contact: ScannedContact): { first: string; last: string } {
  if (contact.first_name) {
    return { first: contact.first_name, last: contact.last_name || '' }
  }
  const parts = (contact.name || '').trim().split(/\s+/)
  return { first: parts[0] || '', last: parts.slice(1).join(' ') }
}

function buildScoringPrompt(contact: ScannedContact, userProfile: ABCProfile): string {
  const { first, last } = splitName(contact)
  const postsJson = JSON.stringify(contact.linkedin_posts)?.slice(0, 500) || '[]'
  const companyNews =
    contact.ai_summary ||
    contact.company_news_summary ||
    (contact.enriched_context ? contact.enriched_context.slice(0, 800) : '') ||
    'N/A'
  const meetingContext = getContactMeetingContext(contact)

  return `You are a B2B sales qualification expert.

SELLER PROFILE:
- Name: ${userProfile.full_name || 'N/A'}
- Company: ${userProfile.company || 'N/A'}
- Product/Service: ${userProfile.product_description || 'N/A'}
- Ideal Customer (ICP): ${userProfile.icp || 'N/A'}
- Goals: ${userProfile.goals || 'N/A'}
- Communication style: ${userProfile.communication_style || 'direct'}
- Outreach language: ${userProfile.outreach_language || 'EN'}

CONTACT TO EVALUATE:
- Name: ${first} ${last}
- Position: ${contact.role || 'N/A'}
- Company: ${contact.company || 'N/A'}
- Industry: ${contact.industry || 'N/A'}
- Company size: ${contact.no_of_employees ?? contact.company_size ?? 'N/A'}
- Revenue: ${contact.annual_revenue ?? contact.company_revenue ?? 'N/A'}
- Headquarters: ${[contact.billing_city, contact.billing_country].filter(Boolean).join(', ') || contact.meeting_location || 'N/A'}
- Where we met: ${contact.event_name || contact.notes || 'Not provided yet'}
- Events they attend: ${JSON.stringify(contact.events_past || [])}
- Events upcoming: ${JSON.stringify(contact.events_upcoming || [])}
- LinkedIn summary: ${contact.linkedin_summary || contact.linkedin_headline || 'N/A'}
- Recent LinkedIn posts: ${postsJson}
- Company news: ${companyNews}
- Where we met (in person): ${meetingContext || 'Not provided yet'}

SCORING CRITERIA (score each 0-100, then calculate weighted average):

1. ICP FIT (weight: 40%)
   Does this contact match the ideal customer profile?
   - Industry match
   - Company size match
   - Role/seniority match
   - Do they have the problem the seller solves?

2. INTENT SIGNALS (weight: 30%)
   Do they show buying intent?
   - Did we meet in person at an event or meeting? (strong warm intro)
   - Are they attending relevant trade shows?
   - Are they hiring in relevant areas?
   - Recent news suggesting they need this product?
   - LinkedIn posts showing relevant pain points?

3. TIMING (weight: 20%)
   Is now a good time to reach out?
   - Upcoming events where they'll be?
   - Recent company news (funding, expansion)?
   - Recent post engagement?

4. ACCESSIBILITY (weight: 10%)
   Can we actually reach them?
   - Do we have email/phone/LinkedIn?
   - Are they active on LinkedIn?
   - What's their seniority (decision maker)?

Return ONLY this JSON, nothing else:
{
  "score": 85,
  "rating": "Hot",
  "match_reason": "Brief explanation of why this is a good or poor fit",
  "icp_fit": 90,
  "intent_signals": 85,
  "timing": 80,
  "accessibility": 70,
  "red_flags": "Any concerns or empty string if none",
  "conversation_starters": [
    "Specific opener based on their data",
    "Second opener option"
  ]
}`
}

export async function calculateAiMatchScore(
  contact: ScannedContact,
  userProfile: ABCProfile
): Promise<AiMatchScoreResult | null> {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('calculateAiMatchScore: ANTHROPIC_API_KEY missing')
    return null
  }

  const safeContact = isLinkedInDataTrusted(contact) ? contact : stripUntrustedLinkedInFields(contact)

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 500,
      messages: [{ role: 'user', content: buildScoringPrompt(safeContact, userProfile) }],
    })

    const text = response.content[0].type === 'text' ? response.content[0].text : ''
    const parsed = parseScoreJson(text)
    if (!parsed || typeof parsed.score !== 'number') {
      console.error('calculateAiMatchScore: invalid JSON', text.slice(0, 200))
      return null
    }

    return {
      ...parsed,
      score: Math.max(0, Math.min(100, Math.round(parsed.score))),
      rating: parsed.rating || scoreToRating(parsed.score),
      conversation_starters: Array.isArray(parsed.conversation_starters)
        ? parsed.conversation_starters.filter((s) => typeof s === 'string')
        : [],
    }
  } catch (error) {
    console.error('calculateAiMatchScore error:', error)
    return null
  }
}
