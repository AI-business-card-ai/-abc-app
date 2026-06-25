import Anthropic from '@anthropic-ai/sdk'
import type { ABCProfile, ScannedContact } from './types'
import type { EnrichedLinkedInProfile } from './enrichlayer'
import { hasDisplayValue } from './research'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
})

export type GeneratedMessages = {
  message_linkedin: string
  message_email: string
  email_subject: string
  message_whatsapp: string
}

function buildSystemPrompt(
  userProfile: ABCProfile,
  contact: Partial<ScannedContact> & { meeting_context?: string | null },
  linkedin?: EnrichedLinkedInProfile | null
): string {
  const userPrompt =
    userProfile.user_prompt ||
    'You are a professional B2B networking assistant.'
  const userName = userProfile.user_name || userProfile.full_name || 'the user'
  const userLanguage = userProfile.user_language || userProfile.outreach_language || 'EN'

  const posts = linkedin?.recentPosts?.length
    ? linkedin.recentPosts
    : contact.linkedin_posts

  const experiences = linkedin?.experiences?.length
    ? linkedin.experiences
    : contact.linkedin_experience

  const skills = linkedin?.skills?.length ? linkedin.skills : contact.linkedin_skills

  const upcomingEvents = hasDisplayValue(contact.events_upcoming)
    ? JSON.stringify(contact.events_upcoming)
    : '[]'
  const pastEvents = hasDisplayValue(contact.events_past)
    ? JSON.stringify(contact.events_past)
    : '[]'
  const speaking = hasDisplayValue(contact.speaking_engagements)
    ? JSON.stringify(contact.speaking_engagements)
    : '[]'
  const personBio = hasDisplayValue(contact.person_bio) ? contact.person_bio : ''

  return `${userPrompt}

You are writing on behalf of ${userName}.
Language preference: ${userLanguage}

Contact you are writing to:
- Name: ${contact.name || 'N/A'}
- Company: ${contact.company || 'N/A'}
- Position: ${contact.role || 'N/A'}
- LinkedIn headline: ${contact.linkedin_headline || linkedin?.headline || 'N/A'}
- Recent LinkedIn posts: ${posts ? JSON.stringify(posts) : 'N/A'}
- Top skills: ${Array.isArray(skills) && skills.length ? skills.join(', ') : 'N/A'}
- Career history: ${experiences ? JSON.stringify(experiences) : 'N/A'}
- Company summary: ${contact.linkedin_summary || linkedin?.summary || contact.company_summary || 'N/A'}
- Where we met: ${contact.meeting_context || contact.event_name || 'N/A'}
- Notes: ${contact.notes || 'N/A'}
- Research context: ${contact.enriched_context ? contact.enriched_context.slice(0, 1200) : 'N/A'}

Upcoming events: ${upcomingEvents}
Past events: ${pastEvents}
Speaking engagements: ${speaking}
Person bio: ${personBio || 'N/A'}

IMPORTANT: If there are upcoming events, ALWAYS mention one naturally in the message.
Example opener: 'Are you heading to IBC 2026? Would love to connect there.'
If they spoke at an event: 'Saw your presentation at {event} — really interesting perspective on {topic}.'

Write exactly 3 message variants:
1. LinkedIn (max 300 chars, reference specific detail from their profile or posts)
2. Email (subject line + 3-4 sentences, professional)
3. WhatsApp (max 2 sentences, friendly)

After each message add one line: [SOURCE: what specific data point made this message personal]
Messages must be so relevant the recipient is genuinely impressed.

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
      model: 'claude-sonnet-4-6',
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
