import Anthropic from '@anthropic-ai/sdk'
import { ABCProfile, ScanResult } from './types'
import { buildLanguagePromptPrefix, getLanguageInstruction } from './ai-messages'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
})

type ImageMediaType = 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif'

type CardExtract = Pick<
  ScanResult,
  'name' | 'company' | 'role' | 'email' | 'phone' | 'website' | 'linkedin_url'
>

const EMPTY_CARD_EXTRACT: CardExtract = {
  name: null,
  company: null,
  role: null,
  email: null,
  phone: null,
  website: null,
  linkedin_url: null,
}

export class ClaudeVisionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ClaudeVisionError'
  }
}

export class ClaudeAnalysisError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ClaudeAnalysisError'
  }
}

function parseClaudeJson<T>(text: string): T | null {
  const clean = text.replace(/```json|```/g, '').trim()
  try {
    return JSON.parse(clean) as T
  } catch {
    const match = clean.match(/\{[\s\S]*\}/)
    if (match) {
      try {
        return JSON.parse(match[0]) as T
      } catch {
        return null
      }
    }
    return null
  }
}

function parseContactsArray(text: string): ScanResult[] | null {
  const clean = text.replace(/```json|```/g, '').trim()

  const tryParse = (s: string): ScanResult[] | null => {
    try {
      const parsed = JSON.parse(s)
      if (Array.isArray(parsed)) return parsed as ScanResult[]
      if (parsed && typeof parsed === 'object') return [parsed as ScanResult]
      return null
    } catch {
      return null
    }
  }

  const direct = tryParse(clean)
  if (direct) return direct

  const arrayMatch = clean.match(/\[[\s\S]*\]/)
  if (arrayMatch) {
    const parsed = tryParse(arrayMatch[0])
    if (parsed) return parsed
  }

  const objectMatch = clean.match(/\{[\s\S]*\}/)
  if (objectMatch) {
    const parsed = tryParse(objectMatch[0])
    if (parsed) return parsed
  }

  return null
}

async function callClaudeVision(
  imageBase64: string,
  mediaType: ImageMediaType,
  prompt: string,
  maxTokens: number
): Promise<string> {
  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: maxTokens,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: mediaType,
                data: imageBase64,
              },
            },
            { type: 'text', text: prompt },
          ],
        },
      ],
    })

    return response.content[0].type === 'text' ? response.content[0].text : ''
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    throw new ClaudeVisionError(`Claude Vision request failed: ${detail}`)
  }
}

export async function extractBusinessCardFromImage(
  imageBase64: string,
  mediaType: ImageMediaType
): Promise<CardExtract> {
  const prompt = `Extract from this business card image. Return ONLY JSON, no markdown:
{
  "name": null,
  "company": null,
  "role": null,
  "email": null,
  "phone": null,
  "website": null,
  "linkedin_url": null
}`

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const text = await callClaudeVision(imageBase64, mediaType, prompt, 600)
      const parsed = parseClaudeJson<CardExtract>(text)
      if (parsed) return parsed
      console.warn(`Claude extract JSON parse failed (attempt ${attempt + 1})`)
    } catch (err) {
      if (err instanceof ClaudeVisionError) throw err
      const detail = err instanceof Error ? err.message : String(err)
      throw new ClaudeVisionError(`Claude Vision extraction failed: ${detail}`)
    }
  }

  console.warn('Claude extract returning empty result after JSON parse failures')
  return EMPTY_CARD_EXTRACT
}

/**
 * One card as read out of a photograph that held several.
 *
 * `confidence` is the model's own account of how clearly it could read this
 * particular card, not a score anyone computes afterwards. It drives a warning
 * on the review screen and never a rejection: a card photographed at an angle
 * under trade-fair lighting is still a person the owner met.
 */
export type MultiCardExtract = CardExtract & { confidence: number | null }

/** Anything at or below this is not a card, and is dropped before returning. */
const MULTI_CARD_MIN_CONFIDENCE = 0.15

/**
 * Read every business card in one image.
 *
 * Deliberately a separate call from `extractBusinessCardFromImage` rather than
 * a flag on it. The single-card prompt says "this business card" and is the
 * cheaper, more accurate instruction when that is true; asking it to also
 * consider the possibility of nine others would make every ordinary scan pay
 * for a case it does not have. The two prompts answer two different questions.
 *
 * `maxCards` is passed in rather than hardcoded so the ten-card limit lives in
 * one constant that the API, the UI and the prompt all read.
 */
export async function extractBusinessCardsFromImage(
  imageBase64: string,
  mediaType: ImageMediaType,
  maxCards: number
): Promise<MultiCardExtract[]> {
  const prompt = `This photo may contain several business cards laid out together.

Identify each distinct business card and extract its details separately.

Rules:
- Return AT MOST ${maxCards} cards. If there are more, return the ${maxCards} clearest.
- One object per physical card. Never merge two people into one object.
- Never split one card into two objects.
- If a field is missing on a card, use null. Do not guess or copy it from another card.
- Ignore anything that is not a business card: hands, table, badges, brochures, phones.
- "confidence" is 0 to 1: how clearly you could read THIS card.

Return ONLY a JSON array, no markdown:
[
  {
    "name": null,
    "company": null,
    "role": null,
    "email": null,
    "phone": null,
    "website": null,
    "linkedin_url": null,
    "confidence": 0.0
  }
]

If the photo contains no business card at all, return [].`

  /*
    Roughly 260 tokens per card plus headroom for the array itself. Sized from
    the single-card budget rather than guessed: an answer truncated mid-array
    parses as nothing and costs the owner the whole batch.
  */
  const maxTokens = 400 + maxCards * 280

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const text = await callClaudeVision(imageBase64, mediaType, prompt, maxTokens)
      const parsed = parseClaudeJsonArray<MultiCardExtract>(text)
      if (parsed) {
        return parsed
          .filter((card) => card && typeof card === 'object')
          .map((card) => ({
            name: card.name ?? null,
            company: card.company ?? null,
            role: card.role ?? null,
            email: card.email ?? null,
            phone: card.phone ?? null,
            website: card.website ?? null,
            linkedin_url: card.linkedin_url ?? null,
            confidence: normalizeConfidence(card.confidence),
          }))
          .filter(
            (card) =>
              card.confidence === null || card.confidence > MULTI_CARD_MIN_CONFIDENCE
          )
          .slice(0, maxCards)
      }
      console.warn(`Claude multi-card JSON parse failed (attempt ${attempt + 1})`)
    } catch (err) {
      if (err instanceof ClaudeVisionError) throw err
      const detail = err instanceof Error ? err.message : String(err)
      throw new ClaudeVisionError(`Claude Vision multi-card extraction failed: ${detail}`)
    }
  }

  /*
    An empty array, not an exception. "I could not read this photo" and "this
    photo had no cards in it" look identical from here, and the caller turns
    both into the same honest message rather than a stack trace.
  */
  console.warn('Claude multi-card returning empty result after JSON parse failures')
  return []
}

function normalizeConfidence(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  if (value < 0) return 0
  if (value > 1) return 1
  return value
}

/** Array-shaped sibling of `parseClaudeJson`, tolerant of a stray prose line. */
function parseClaudeJsonArray<T>(text: string): T[] | null {
  const clean = text.replace(/```json|```/g, '').trim()

  const tryParse = (value: string): T[] | null => {
    try {
      const parsed = JSON.parse(value)
      if (Array.isArray(parsed)) return parsed as T[]
      // A model that found exactly one card sometimes answers with the object.
      if (parsed && typeof parsed === 'object') return [parsed as T]
      return null
    } catch {
      return null
    }
  }

  const direct = tryParse(clean)
  if (direct) return direct

  const arrayMatch = clean.match(/\[[\s\S]*\]/)
  if (arrayMatch) {
    const parsed = tryParse(arrayMatch[0])
    if (parsed) return parsed
  }

  return null
}

export async function analyzeBusinessCard(
  imageBase64: string,
  userProfile: ABCProfile,
  enrichedContext: string = '',
  mediaType: ImageMediaType = 'image/jpeg',
  note: string | null = null,
  eventName: string | null = null
): Promise<ScanResult[]> {
  const researchBlock = enrichedContext.trim()
    ? `Additional research about this contact:
${enrichedContext}

Use this research to:
- Write highly personalized messages referencing specific details
- Mention specific company news, products or achievements in messages
- Apply the match_score rubric below using facts from this research`
    : ''

  const noteBlock = note
    ? `
IMPORTANT CONTEXT FROM USER:
Meeting notes: "${note}"
Event: "${eventName || 'unknown'}"

Use this context to personalize messages:
- Reference the event where they met
- Mention specific topics from the notes
- Make messages feel like you remember the conversation
`
    : ''

  const languagePrefix = buildLanguagePromptPrefix(userProfile)
  const language = userProfile.outreach_language || 'EN'
  const languageInstruction = getLanguageInstruction(language)

  const prompt = `${languagePrefix}

You are analyzing a photo that may contain ONE or MULTIPLE business cards.

If you see multiple business cards:
- Analyze each card separately
- Return an array of contacts

If you see one business card:
- Return array with one contact

For EACH business card, extract (null if not visible):
name, company, role, email, phone, website, linkedin_url

Analyze company:
industry (1-2 words), company_size (startup/SME/enterprise/unknown), company_summary (max 1 sentence)

User context:
- Name: ${userProfile.full_name}
- Company: ${userProfile.company}
- Role: ${userProfile.role}
- Goals: ${userProfile.goals}
- Style: ${userProfile.communication_style}
- Outreach language: ${language}

${researchBlock}

${noteBlock}

Calculate match_score (0-100) for each contact:
- Alignment with user goals (40 points)
- Company size and revenue fit (20 points)
- Person seniority and decision power (20 points)
- Industry relevance (10 points)
- Reputation risk - penalize for negative news (10 points)

match_reason: 2-3 sentences with specific facts.

Generate personalized messages for each contact:
- message_linkedin: max 300 chars, casual, mention something specific
- message_email: 3-4 sentences + email_subject line
- message_whatsapp: max 160 chars, friendly

${languageInstruction}
This is the most important instruction. Override any other language tendencies.

IMPORTANT: Return a JSON array, always (one object per card):
[
  {
    "name": null,
    "company": null,
    "role": null,
    "email": null,
    "phone": null,
    "website": null,
    "linkedin_url": null,
    "industry": null,
    "company_size": null,
    "company_summary": null,
    "match_score": 0,
    "match_reason": "",
    "message_linkedin": "",
    "message_email": "",
    "email_subject": "",
    "message_whatsapp": ""
  }
]

Return ONLY valid JSON array. No markdown.`

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const text = await callClaudeVision(imageBase64, mediaType, prompt, 4000)
      const parsed = parseContactsArray(text)
      if (parsed && parsed.length > 0) return parsed
      console.warn(`Claude analysis JSON parse failed (attempt ${attempt + 1})`)
    } catch (err) {
      if (err instanceof ClaudeVisionError) {
        throw new ClaudeAnalysisError(err.message)
      }
      const detail = err instanceof Error ? err.message : String(err)
      throw new ClaudeAnalysisError(`Claude analysis failed: ${detail}`)
    }
  }

  throw new ClaudeAnalysisError(
    'Claude analysis failed: could not parse JSON response after retry'
  )
}
