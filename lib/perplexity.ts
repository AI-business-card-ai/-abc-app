export async function enrichContact(
  name: string | null,
  company: string | null,
  userProfile: any
): Promise<string> {
  if (!name && !company) return ''

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

Research and return ALL sections:

## 1. COMPANY PROFILE
- What they do, specialization, niche
- Industry and sub-industry
- Headquarters: city and country
- Founded year, how long operating
- Company size (employees)
- Estimated annual revenue
- Key clients or markets

## 2. COMPANY REPUTATION
- Market reputation
- Negative news, lawsuits, controversies, scandals
- Customer reviews sentiment
- Awards or recognitions
- Recent funding or acquisitions

## 3. RECENT ACTIVITY (last 6 months)
- Latest news
- New products or services
- Upcoming events or trade shows
- Recent partnerships or deals

## 4. PERSON PROFILE
- Exact role and responsibilities
- LinkedIn URL if findable
- Career history (previous companies)
- Education
- Public speaking, articles, thought leadership
- Mutual interests

## 5. MATCH ANALYSIS
Based on MY GOALS: "${userProfile?.goals}"
- Score 0-100 relevance
- Top 3 reasons why they match or not
- Best outreach angle
- Red flags or risks

## 6. OUTREACH INTELLIGENCE
- Best talking points
- Topics to avoid
- Recommended tone
- Best channel: LinkedIn/Email/WhatsApp

Be factual. If not found say "Not found".`,
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
