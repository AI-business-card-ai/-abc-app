import { createServerSupabase } from '@/lib/supabase'
import CardNotFound from '@/components/public/CardNotFound'
import DigitalCardClient from '@/components/public/DigitalCardClient'

export const metadata = {
  title: 'Digital Business Card — ABC',
  description: 'Save contact details or leave your info.',
}

type Props = { params: { username: string } }

export default async function PublicCardByUsernamePage({ params }: Props) {
  const username = decodeURIComponent(params.username).toLowerCase()
  const supabase = createServerSupabase()

  const { data: profile } = await supabase
    .from('abc_profiles')
    .select('id, full_name, company, role, phone, email, linkedin_url')
    .eq('username', username)
    .maybeSingle()

  if (!profile || (!profile.full_name && !profile.email && !profile.company)) {
    return <CardNotFound />
  }

  return (
    <div style={{ background: '#0f0f0f', minHeight: '100vh' }}>
      <DigitalCardClient
        profile={{
          userId: profile.id,
          full_name: profile.full_name,
          company: profile.company,
          role: profile.role,
          email: profile.email,
          phone: profile.phone,
          linkedin_url: profile.linkedin_url,
        }}
      />
    </div>
  )
}
