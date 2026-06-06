import { ABCProfile } from './types'

export async function enrichContact(
  name: string,
  company: string,
  userProfile: ABCProfile
): Promise<string> {
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
          content: `Research this person and company for a business outreach context:
Person: ${name}
Company: ${company}
My goals: ${userProfile.goals}

Find and return in 3-4 sentences:
1. What does ${company} do, size, recent news or funding
2. ${name}'s role, background, LinkedIn activity if available
3. Any relevant connection to: ${userProfile.goals}

Be specific and factual. Only real information.`,
        },
      ],
      max_tokens: 300,
    }),
  })

  if (!response.ok) {
    const errText = await response.text()
    throw new Error(`Perplexity API error: ${response.status} ${errText}`)
  }

  const data = await response.json()
  return data.choices?.[0]?.message?.content || ''
}
