import { buildResearchInstructions, type UserProfileResearch } from './research'
import type { ABCProfile } from './types'

export async function enrichContact(
  name: string | null,
  company: string | null,
  userProfile?: UserProfileResearch | ABCProfile | null
): Promise<string> {
  if (!name && !company) {
    console.log('=== PERPLEXITY SKIP === no name or company')
    return ''
  }

  console.log('=== PERPLEXITY START ===', name, company)
  console.log('PERPLEXITY_API_KEY exists:', !!process.env.PERPLEXITY_API_KEY)

  const instructions = buildResearchInstructions(userProfile)
  const firstName = name?.split(' ')[0] || name || ''
  const lastName = name?.split(' ').slice(1).join(' ') || ''
  const p = userProfile as ABCProfile | null | undefined

  const perplexityPrompt = `Research this person and company for B2B sales intelligence.

Person: ${firstName} ${lastName}
Company: ${company || 'Unknown'}
Position: ${p?.role || ''}

Find the following information:
${instructions.map((item, i) => `${i + 1}. ${item}`).join('\n')}

Return structured data with all findings.
Be specific, factual, and cite sources where possible.

Use ## section headers for each topic. Only include sections with real, verifiable data.
Never write "Not found", "N/A", or placeholder text.
IMPORTANT: Answer ONLY in English.`

  try {
    console.log('PERPLEXITY KEY:', process.env.PERPLEXITY_API_KEY?.substring(0, 15))

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10000)

    let response: Response
    try {
      response = await fetch('https://api.perplexity.ai/chat/completions', {
        signal: controller.signal,
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.PERPLEXITY_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'sonar',
          messages: [
            {
              role: 'user',
              content: `${perplexityPrompt}

MY GOALS: ${p?.goals || 'B2B networking'}
MY COMPANY: ${p?.company || ''}
MY ROLE: ${p?.role || ''}`,
            },
          ],
          max_tokens: 800,
        }),
      })
    } finally {
      clearTimeout(timeout)
    }

    console.log('Perplexity response status:', response.status)
    const data = await response.json()
    console.log('Perplexity data:', JSON.stringify(data).substring(0, 300))

    if (!response.ok) {
      console.error('Perplexity API error:', response.status, JSON.stringify(data).substring(0, 500))
      return ''
    }

    return data.choices?.[0]?.message?.content || ''
  } catch (error) {
    console.error('Perplexity error:', error)
    return ''
  }
}
