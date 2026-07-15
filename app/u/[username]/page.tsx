import type { Metadata } from 'next'
import { createServerSupabase } from '@/lib/supabase'
import CardNotFound from '@/components/public/CardNotFound'
import DigitalCardClient from '@/components/public/DigitalCardClient'

type Props = { params: { username: string } }

async function getProfile(username: string) {
  const supabase = createServerSupabase()
  const { data: profile } = await supabase
    .from('abc_profiles')
    .select('id, full_name, company, role, phone, email, linkedin_url, website, product_description, goals')
    .eq('user_name', decodeURIComponent(username).toLowerCase())
    .maybeSingle()
  return profile
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const profile = await getProfile(params.username)
  const name = profile?.full_name?.trim() || 'ABC User'
  const company = profile?.company?.trim()

  return {
    title: `${name} — AI Business Card`,
    description: company ? `Connect with ${name} from ${company}` : `Connect with ${name}`,
  }
}

export default async function PublicCardByUsernamePage({ params }: Props) {
  const profile = await getProfile(params.username)

  if (!profile || (!profile.full_name && !profile.email && !profile.company)) {
    return <CardNotFound />
  }

  return (
    <div style={{ background: '#0a0a0a', minHeight: '100vh' }}>
      <DigitalCardClient
        profile={{
          userId: profile.id,
          full_name: profile.full_name,
          company: profile.company,
          role: profile.role,
          email: profile.email,
          phone: profile.phone,
          linkedin_url: profile.linkedin_url,
          website: profile.website,
          about: profile.product_description || profile.goals || null,
        }}
      />
    </div>
  )
}
