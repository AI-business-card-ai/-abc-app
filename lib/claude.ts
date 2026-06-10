import Anthropic from '@anthropic-ai/sdk'
import { ABCProfile, ScanResult } from './types'

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

export async function analyzeBusinessCard(
  imageBase64: string,
  userProfile: ABCProfile,
  enrichedContext: string = '',
  mediaType: ImageMediaType = 'image/jpeg'
): Promise<ScanResult> {
  const researchBlock = enrichedContext.trim()
    ? `Additional research about this contact:
${enrichedContext}

Use this research to:
- Write highly personalized messages referencing specific details
- Mention specific company news, products or achievements in messages
- Apply the match_score rubric below using facts from this research`
    : ''

  const prompt = `Analyze this business card image.

Extract (null if not visible):
name, company, role, email, phone, website, linkedin_url

Analyze company:
industry (1-2 words), company_size (startup/SME/enterprise/unknown), company_summary (max 1 sentence)

User context:
- Name: ${userProfile.full_name}
- Company: ${userProfile.company}
- Role: ${userProfile.role}
- Goals: ${userProfile.goals}
- Style: ${userProfile.communication_style}
- Language: ${userProfile.outreach_language}

${researchBlock}

Calculate match_score (0-100):
- Alignment with user goals (40 points)
- Company size and revenue fit (20 points)
- Person seniority and decision power (20 points)
- Industry relevance (10 points)
- Reputation risk - penalize for negative news (10 points)

match_reason: 2-3 sentences with specific facts from research.

Generate personalized messages:
- message_linkedin: max 300 chars, casual, mention something specific
- message_email: 3-4 sentences + email_subject line
- message_whatsapp: max 160 chars, friendly

IMPORTANT: Write ALL messages in English only.
LinkedIn message in English.
Email in English.
WhatsApp in English.
All analysis in English.

Return ONLY this JSON, no markdown:
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
}`

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const text = await callClaudeVision(imageBase64, mediaType, prompt, 1500)
      const parsed = parseClaudeJson<ScanResult>(text)
      if (parsed) return parsed
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
