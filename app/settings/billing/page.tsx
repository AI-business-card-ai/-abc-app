import BillingSettingsView from '@/components/settings/BillingSettingsView'
import { loadSettingsProfile } from '@/lib/settings/load-profile'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Plan & Billing — ABC',
}

export default async function BillingSettingsPage() {
  const profile = await loadSettingsProfile()
  if (!profile) return null

  return <BillingSettingsView profile={profile} />
}
