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

export async function extractBusinessCardFromImage(
  imageBase64: string,
  mediaType: ImageMediaType
): Promise<CardExtract> {
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 600,
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
          {
            type: 'text',
            text: `Extract from this business card image. Return ONLY JSON, no markdown:
{
  "name": null,
  "company": null,
  "role": null,
  "email": null,
  "phone": null,
  "website": null,
  "linkedin_url": null
}`,
          },
        ],
      },
    ],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : ''
  const clean = text.replace(/```json|```/g, '').trim()
  return JSON.parse(clean) as CardExtract
}

export async function analyzeBusinessCard(
  imageBase64: string,
  userProfile: ABCProfile,
  mediaType: ImageMediaType,
  enrichedContext: string = ''
): Promise<ScanResult> {
  const researchBlock = enrichedContext.trim()
    ? `Additional research about this contact: ${enrichedContext}

Research context: ${enrichedContext}
Use this to write highly personalized messages that reference specific details.`
    : ''

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 1500,
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
          {
            type: 'text',
            text: `Analyze this business card image.

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

Calculate match_score (0-100) and match_reason (1 sentence).

Generate personalized messages:
- message_linkedin: max 300 chars, casual, mention something specific
- message_email: 3-4 sentences + email_subject line
- message_whatsapp: max 160 chars, friendly

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
}`,
          },
        ],
      },
    ],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : ''
  const clean = text.replace(/```json|```/g, '').trim()
  return JSON.parse(clean) as ScanResult
}
