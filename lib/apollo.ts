export async function enrichWithApollo(
  name: string | null,
  company: string | null,
  email: string | null
): Promise<{
  photo_url: string | null
  linkedin_url: string | null
  title: string | null
  company_size: string | null
  company_revenue: string | null
  company_industry: string | null
  technologies: string[] | null
} | null> {
  if (!name && !email) return null
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 8000)

    let response: Response
    try {
      response = await fetch('https://api.apollo.io/v1/people/match', {
        signal: controller.signal,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Api-Key': process.env.APOLLO_API_KEY!,
        },
        body: JSON.stringify({
          name: name,
          organization_name: company,
          email: email,
          reveal_personal_emails: false,
          reveal_phone_number: false,
        }),
      })
    } finally {
      clearTimeout(timeout)
    }

    if (!response.ok) return null
    const data = await response.json()
    const person = data.person
    if (!person) return null
    return {
      photo_url: person.photo_url || null,
      linkedin_url: person.linkedin_url || null,
      title: person.title || null,
      company_size: person.organization?.num_employees?.toString() || null,
      company_revenue: person.organization?.annual_revenue_printed || null,
      company_industry: person.organization?.industry || null,
      technologies: person.organization?.technologies?.slice(0, 5) || null,
    }
  } catch (error) {
    console.error('Apollo error:', error)
    return null
  }
}
