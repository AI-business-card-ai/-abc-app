import ProfileSettingsView from '@/components/settings/ProfileSettingsView'
import { loadSettingsProfile } from '@/lib/settings/load-profile'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Profile & Account — ABC',
}

export default async function ProfileSettingsPage() {
  const profile = await loadSettingsProfile()
  if (!profile) return null

  return <ProfileSettingsView profile={profile} />
}
