import { ABCProfile } from './types'

export async function enrichContact(
  name: string | null,
  company: string | null,
  userProfile: ABCProfile
): Promise<string> {
  if (!name && !company) return ''

  if (!process.env.PERPLEXITY_API_KEY) {
    console.warn('PERPLEXITY_API_KEY not set, skipping enrichment')
    return ''
  }

  try {
    const response = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.PERPLEXITY_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama-3.1-sonar-small-128k-online',
        messages: [
          {
            role: 'user',
            content: `Research this person for business outreach:
Person: ${name || 'unknown'}
Company: ${company || 'unknown'}
My goals: ${userProfile.goals || 'B2B networking'}

Return 3-4 sentences covering:
1. What ${company} does, size, recent news or funding
2. ${name} role, background, LinkedIn if available
3. Relevant connection to my goals

Only real verified facts. Be specific.`,
          },
        ],
        max_tokens: 300,
      }),
    })

    if (!response.ok) {
      const body = await response.text().catch(() => '')
      console.error('Perplexity API error:', response.status, body)
      return ''
    }

    const data = await response.json()
    return data.choices?.[0]?.message?.content || ''
  } catch (error) {
    console.error('Perplexity error:', error)
    return ''
  }
}
