import { DEFAULT_RESEARCH_PREFERENCES } from './research'

export async function enrichContact(
  name: string | null,
  company: string | null,
  userProfile: any
): Promise<string> {
  if (!name && !company) {
    console.log('=== PERPLEXITY SKIP === no name or company')
    return ''
  }

  console.log('=== PERPLEXITY START ===', name, company)
  console.log('PERPLEXITY_API_KEY exists:', !!process.env.PERPLEXITY_API_KEY)

  const selectedTopics: string[] =
    userProfile?.research_preferences || [...DEFAULT_RESEARCH_PREFERENCES]
  const customQ: string = userProfile?.custom_questions || ''

  const dynamicSections = [
    selectedTopics.includes('revenue')
      ? `
## COMPANY SIZE & REVENUE
- Estimated annual revenue
- Number of employees
- Growth trajectory`
      : '',
    selectedTopics.includes('location')
      ? `
## LOCATION & OFFICES
- Headquarters city and country
- Other offices or branches`
      : '',
    selectedTopics.includes('news')
      ? `
## RECENT NEWS (last 6 months)
- Latest announcements
- New products or services
- Partnerships or deals`
      : '',
    selectedTopics.includes('linkedin')
      ? `
## PERSON PROFILE
- LinkedIn URL
- Career history
- Recent posts or activity`
      : '',
    selectedTopics.includes('reputation')
      ? `
## REPUTATION & RISKS
- Negative news, lawsuits, controversies
- Customer sentiment
- Red flags`
      : '',
    selectedTopics.includes('events')
      ? `
## UPCOMING EVENTS
- Trade shows they attend
- Speaking engagements
- Product launches`
      : '',
    selectedTopics.includes('competitors')
      ? `
## COMPETITORS
- Main competitors in their market
- How they differentiate
- Market position`
      : '',
    selectedTopics.includes('technology')
      ? `
## TECHNOLOGY STACK
- Tools and software they use
- CRM, marketing tools, infrastructure
- Tech partnerships`
      : '',
    selectedTopics.includes('decision_maker')
      ? `
## DECISION MAKING POWER
- Is ${name} a decision maker?
- Who else is involved in buying decisions?
- Budget authority level`
      : '',
    selectedTopics.includes('pain_points')
      ? `
## CURRENT CHALLENGES
- What problems is the company solving now?
- Recent pain points from news or reviews
- What they are hiring for (signals needs)`
      : '',
    customQ
      ? `
## CUSTOM QUESTIONS
Answer these specific questions:
${customQ}`
      : '',
  ]
    .filter(Boolean)
    .join('\n')

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
              content: `Do thorough research on this person and company for B2B outreach:

PERSON: ${name}
COMPANY: ${company}
MY GOALS: ${userProfile?.goals || 'B2B networking'}
MY COMPANY: ${userProfile?.company || ''}
MY ROLE: ${userProfile?.role || ''}

Research and return ONLY the sections below. Use ## headers exactly as shown.
Be factual. If not found say "Not found".

${dynamicSections}`,
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
