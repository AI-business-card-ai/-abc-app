export async function enrichContact(
  name: string | null,
  company: string | null,
  userProfile: any
): Promise<string> {
  if (!name && !company) return ''

  const selectedTopics: string[] = userProfile?.research_preferences || [
    'revenue',
    'location',
    'news',
    'linkedin',
    'reputation',
    'events',
  ]
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
    const response = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.PERPLEXITY_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama-3.1-sonar-large-128k-online',
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

    const data = await response.json()
    return data.choices?.[0]?.message?.content || ''
  } catch (error) {
    console.error('Perplexity error:', error)
    return ''
  }
}
