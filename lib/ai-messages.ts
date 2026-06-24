import Anthropic from '@anthropic-ai/sdk'
import type { ABCProfile, ScannedContact } from './types'
import type { EnrichedLinkedInProfile } from './enrichlayer'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
})

export type GeneratedMessages = {
  message_linkedin: string
  message_email: string
  email_subject: string
  message_whatsapp: string
}

function formatJsonField(value: unknown): string {
  if (!value) return '—'
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      return JSON.stringify(parsed, null, 2)
    } catch {
      return value
    }
  }
  return JSON.stringify(value, null, 2)
}

function buildSystemPrompt(
  userProfile: ABCProfile,
  contact: Partial<ScannedContact> & { meeting_context?: string | null },
  linkedin?: EnrichedLinkedInProfile | null
): string {
  const posts = linkedin?.recentPosts?.length
    ? linkedin.recentPosts
    : contact.linkedin_posts

  const experiences = linkedin?.experiences?.length
    ? linkedin.experiences
    : contact.linkedin_experience

  const skills = linkedin?.skills?.length ? linkedin.skills : contact.linkedin_skills

  return `Jsi expert na personalizovanou B2B komunikaci.
Píšeš jménem: ${userProfile.full_name || 'Unknown'} z ${userProfile.company || 'Unknown'}
Cíl: ${userProfile.goals || 'Build meaningful business relationships'}
Styl: ${userProfile.communication_style || 'direct'}

O příjemci víš:
- Jméno: ${contact.name || '—'}
- Firma: ${contact.company || '—'}
- Pozice: ${contact.role || '—'}
- LinkedIn headline: ${contact.linkedin_headline || linkedin?.headline || '—'}
- Co dělá: ${contact.linkedin_summary || linkedin?.summary || contact.company_summary || '—'}
- Poslední posty: ${formatJsonField(posts)}
- Dovednosti: ${Array.isArray(skills) ? skills.join(', ') : formatJsonField(skills)}
- Kariéra: ${formatJsonField(experiences)}
- Kde jsme se potkali: ${contact.meeting_context || contact.event_name || '—'}
- Poznámka: ${contact.notes || '—'}
- Perplexity research: ${contact.enriched_context ? contact.enriched_context.slice(0, 1500) : '—'}

Napiš 3 varianty zprávy:
1. LinkedIn (max 300 znaků, přátelská, zmiň konkrétní detail z jeho profilu)
2. Email (s předmětem, profesionální, 3-4 věty)
3. WhatsApp (krátká, neformální, max 2 věty)

Pro každou zprávu uveď [ZDROJ] odkud data pochází.
Zprávy musí být tak relevantní že příjemce žasne.

Write ALL messages in ${userProfile.outreach_language || 'English'}.

Return ONLY valid JSON:
{
  "message_linkedin": "",
  "message_email": "",
  "email_subject": "",
  "message_whatsapp": ""
}`
}

function parseMessages(text: string): GeneratedMessages | null {
  const clean = text.replace(/```json|```/g, '').trim()
  try {
    return JSON.parse(clean) as GeneratedMessages
  } catch {
    const match = clean.match(/\{[\s\S]*\}/)
    if (!match) return null
    try {
      return JSON.parse(match[0]) as GeneratedMessages
    } catch {
      return null
    }
  }
}

export async function generatePersonalizedMessages(
  contact: Partial<ScannedContact> & { meeting_context?: string | null },
  userProfile: ABCProfile,
  linkedin?: EnrichedLinkedInProfile | null
): Promise<GeneratedMessages | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 1200,
      messages: [
        {
          role: 'user',
          content: buildSystemPrompt(userProfile, contact, linkedin),
        },
      ],
    })

    const text = response.content[0].type === 'text' ? response.content[0].text : ''
    return parseMessages(text)
  } catch (error) {
    console.error('generatePersonalizedMessages error:', error)
    return null
  }
}
