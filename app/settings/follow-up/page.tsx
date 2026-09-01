import FollowUpSettingsView from '@/components/settings/FollowUpSettingsView'
import ErrorBoundary from '@/components/ui/ErrorBoundary'
import { loadSettingsProfile } from '@/lib/settings/load-profile'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Smart Follow-up — ABC',
}

const followUpErrorFallback = (
  <div className="mx-auto w-full max-w-[560px] px-4 py-10 text-center">
    <p className="text-[15px] font-semibold text-abc-text">Smart Follow-up could not be opened</p>
    <p className="mt-1.5 text-[13px] text-abc-secondary">Reload the page and try again.</p>
  </div>
)

export default async function FollowUpSettingsPage() {
  const profile = await loadSettingsProfile()
  if (!profile) return null

  return (
    <ErrorBoundary fallback={followUpErrorFallback}>
      <FollowUpSettingsView initialProfile={profile} />
    </ErrorBoundary>
  )
}
