import { redirect } from 'next/navigation'
import { createServerSupabase } from '@/lib/supabase'
import CardNotFound from '@/components/public/CardNotFound'
import DigitalCardClient from '@/components/public/DigitalCardClient'

export const metadata = {
  title: 'Digital Business Card — ABC',
  description: 'Save contact details or leave your info.',
}

type Props = { params: { userId: string } }

export default async function PublicCardPage({ params }: Props) {
  const supabase = createServerSupabase()

  const { data: profile } = await supabase
    .from('abc_profiles')
    .select('id, user_name, full_name, company, role, phone, email, linkedin_url, product_description, goals')
    .eq('id', params.userId)
    .maybeSingle()

  // Old printed QR codes keep working — forward to the canonical username URL
  if (profile?.user_name) {
    redirect(`/u/${profile.user_name}`)
  }

  if (!profile?.full_name && !profile?.email && !profile?.company) {
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
          about: profile.product_description || profile.goals || null,
        }}
      />
    </div>
  )
}
