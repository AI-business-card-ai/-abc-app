import SettingsContent from '@/components/settings/SettingsContent'
import ErrorBoundary from '@/components/ui/ErrorBoundary'
import { createServerComponentClient } from '@/lib/supabase-server'
import { normalizeAbcProfile } from '@/lib/profile-defaults'
import type { ABCProfile } from '@/lib/types'

const profileErrorFallback = (
  <div style={{ color: '#f0197d', padding: '20px', background: '#0f0f0f' }}>
    Profile error — check console
  </div>
)

export default async function ProfilePage() {
  const supabase = createServerComponentClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return null

  const { data, error } = await supabase
    .from('abc_profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle()

  if (error) {
    console.error('[profile] abc_profiles query failed:', error)
  }

  const profile = data
    ? normalizeAbcProfile(data as Partial<ABCProfile>, user.email)
    : normalizeAbcProfile({}, user.email)

  if (profile.user_name && !/^[a-z0-9-]{3,30}$/.test(profile.user_name)) {
    profile.user_name = ''
  }

  return (
    <ErrorBoundary fallback={profileErrorFallback}>
      {!data && (
        <div
          className="mx-4 mt-4 rounded-xl px-4 py-3 text-sm"
          style={{ background: 'var(--bg-surface-2)', border: '1px solid var(--border)', color: '#999999' }}
        >
          Welcome! Set up your profile below — all fields are optional until you save.
        </div>
      )}
      <SettingsContent initialProfile={profile} />
    </ErrorBoundary>
  )
}
