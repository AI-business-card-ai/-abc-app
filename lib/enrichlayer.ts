const V1_BASE = 'https://api.enrichlayer.com/v1'
const V2_BASE = 'https://enrichlayer.com/api/v2'

export type LinkedInExperience = { title: string; company: string; duration: string }
export type LinkedInEducation = { school: string; degree: string }
export type LinkedInPost = { text: string; date: string }

export type EnrichedLinkedInProfile = {
  fullName: string
  headline: string
  summary: string
  experiences: LinkedInExperience[]
  education: LinkedInEducation[]
  skills: string[]
  recentPosts: LinkedInPost[]
  languages: string[]
}

export type ResolvedLinkedInProfile = {
  url: string
  similarityScore: number | null
}

type DateParts = { day?: number | null; month?: number | null; year?: number | null }

function authHeaders(): Record<string, string> | null {
  const key = process.env.ENRICHLAYER_API_KEY
  if (!key) return null
  return { Authorization: `Bearer ${key}` }
}

function formatDateParts(parts?: DateParts | null): string {
  if (!parts?.year) return ''
  const month = parts.month ? String(parts.month).padStart(2, '0') : '01'
  const day = parts.day ? String(parts.day).padStart(2, '0') : '01'
  return `${parts.year}-${month}-${day}`
}

function formatDuration(start?: DateParts | null, end?: DateParts | null): string {
  const startStr = formatDateParts(start)
  const endStr = end ? formatDateParts(end) : 'Present'
  if (!startStr) return endStr === 'Present' ? '' : endStr
  return `${startStr} – ${endStr}`
}

function mapPersonPayload(data: Record<string, unknown>): EnrichedLinkedInProfile {
  const experiencesRaw = (data.experiences as Array<Record<string, unknown>>) || []
  const educationRaw = (data.education as Array<Record<string, unknown>>) || []
  const activitiesRaw = (data.activities as Array<Record<string, unknown>>) || []
  const skillsRaw = (data.skills as unknown[]) || []
  const languagesRaw = (data.languages as unknown[]) || []
  const lastUpdated = (data.meta as { last_updated?: string } | undefined)?.last_updated || ''

  const experiences: LinkedInExperience[] = experiencesRaw.slice(0, 10).map((exp) => ({
    title: String(exp.title || ''),
    company: String(exp.company || ''),
    duration: formatDuration(
      exp.starts_at as DateParts | null,
      exp.ends_at as DateParts | null
    ),
  }))

  const education: LinkedInEducation[] = educationRaw.slice(0, 5).map((edu) => ({
    school: String(edu.school || ''),
    degree: [edu.degree_name, edu.field_of_study].filter(Boolean).join(', ') || '',
  }))

  const skills: string[] = skillsRaw
    .map((s) => {
      if (typeof s === 'string') return s
      if (s && typeof s === 'object' && 'name' in s) return String((s as { name: string }).name)
      return ''
    })
    .filter(Boolean)

  const recentPosts: LinkedInPost[] = activitiesRaw.slice(0, 5).map((activity) => ({
    text: String(activity.title || activity.text || ''),
    date: String(activity.posted_at || activity.date || lastUpdated || ''),
  }))

  const languages: string[] = languagesRaw
    .map((l) => {
      if (typeof l === 'string') return l
      if (l && typeof l === 'object' && 'name' in l) return String((l as { name: string }).name)
      return ''
    })
    .filter(Boolean)

  return {
    fullName: String(data.full_name || data.name || ''),
    headline: String(data.headline || data.occupation || ''),
    summary: String(data.summary || ''),
    experiences,
    education,
    skills,
    recentPosts,
    languages,
  }
}

async function fetchJson(url: string, headers: Record<string, string>): Promise<Record<string, unknown> | null> {
  const response = await fetch(url, { headers, next: { revalidate: 0 } })
  if (!response.ok) {
    console.warn(`EnrichLayer request failed (${response.status}): ${url}`)
    return null
  }
  return (await response.json()) as Record<string, unknown>
}

export async function resolveLinkedInProfile(input: {
  name: string
  company: string
  role?: string | null
  location?: string | null
}): Promise<ResolvedLinkedInProfile | null> {
  const headers = authHeaders()
  if (!headers || !input.name || !input.company) return null

  try {
    const parts = input.name.trim().split(/\s+/)
    const firstName = parts[0] || input.name
    const lastName = parts.slice(1).join(' ') || firstName
    const companyDomain = input.company.replace(/^https?:\/\//, '').split('/')[0]

    const params = new URLSearchParams({
      first_name: firstName,
      last_name: lastName,
      company_domain: companyDomain,
      similarity_checks: 'include',
    })
    if (input.role?.trim()) params.set('title', input.role.trim())
    if (input.location?.trim()) params.set('location', input.location.trim())

    const lookupUrl = `${V2_BASE}/profile/resolve?${params}`
    const lookup = await fetchJson(lookupUrl, headers)
    const profileUrl = lookup?.url as string | undefined
    if (!profileUrl) return null

    const similarityRaw = lookup?.similarity_checks as Record<string, unknown> | undefined
    const similarityScore =
      typeof lookup?.similarity_score === 'number'
        ? lookup.similarity_score
        : typeof similarityRaw?.score === 'number'
          ? (similarityRaw.score as number)
          : null

    return { url: profileUrl, similarityScore }
  } catch (error) {
    console.error('EnrichLayer resolveLinkedInProfile error:', error)
    return null
  }
}

export async function enrichLinkedIn(linkedinUrl: string): Promise<EnrichedLinkedInProfile | null> {
  const headers = authHeaders()
  if (!headers || !linkedinUrl) return null

  try {
    const v1Url = `${V1_BASE}/person?${new URLSearchParams({ linkedin_profile_url: linkedinUrl })}`
    let data = await fetchJson(v1Url, headers)

    if (!data) {
      const v2Url = `${V2_BASE}/profile?${new URLSearchParams({
        profile_url: linkedinUrl,
        skills: 'include',
      })}`
      data = await fetchJson(v2Url, headers)
    }

    if (!data) return null
    return mapPersonPayload(data)
  } catch (error) {
    console.error('EnrichLayer enrichLinkedIn error:', error)
    return null
  }
}

export async function findWorkEmail(
  name: string,
  company: string
): Promise<{ email: string; confidence: number } | null> {
  const headers = authHeaders()
  if (!headers || !name || !company) return null

  try {
    const v1Url = `${V1_BASE}/email?${new URLSearchParams({ name, company })}`
    let data = await fetchJson(v1Url, headers)

    if (data?.email && typeof data.email === 'string') {
      const confidence = typeof data.confidence === 'number' ? data.confidence : 0.8
      return { email: data.email, confidence }
    }

    const parts = name.trim().split(/\s+/)
    const firstName = parts[0] || name
    const lastName = parts.slice(1).join(' ') || firstName
    const lookupUrl = `${V2_BASE}/profile/resolve?${new URLSearchParams({
      first_name: firstName,
      last_name: lastName,
      company_domain: company.replace(/^https?:\/\//, '').split('/')[0],
      similarity_checks: 'include',
    })}`
    const lookup = await fetchJson(lookupUrl, headers)
    const profileUrl = lookup?.url as string | undefined
    if (!profileUrl) return null

    const emailUrl = `${V2_BASE}/profile/email?${new URLSearchParams({ profile_url: profileUrl })}`
    const emailData = await fetchJson(emailUrl, headers)
    const email =
      (emailData?.email as string | undefined) ||
      (emailData?.work_email as string | undefined) ||
      (Array.isArray(emailData?.emails) ? (emailData.emails[0] as string) : undefined)

    if (!email) return null
    return { email, confidence: 0.85 }
  } catch (error) {
    console.error('EnrichLayer findWorkEmail error:', error)
    return null
  }
}
