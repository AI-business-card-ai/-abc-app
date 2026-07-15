import { createServerSupabase } from '@/lib/supabase'
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
    .select('id, full_name, company, role, phone, email, linkedin_url')
    .eq('id', params.userId)
    .maybeSingle()

  if (!profile?.full_name && !profile?.email && !profile?.company) {
    return (
      <div
        style={{
          background: '#0f0f0f',
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
        }}
      >
        <div style={{ textAlign: 'center', maxWidth: 360 }}>
          <p
            style={{
              fontSize: 22,
              fontWeight: 800,
              background: 'linear-gradient(90deg,#f0197d,#00d4d4)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              marginBottom: 8,
            }}
          >
            Card not found
          </p>
          <p style={{ color: '#9ca3af', fontSize: 15 }}>
            This digital business card does not exist or is no longer available.
          </p>
        </div>
      </div>
    )
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
