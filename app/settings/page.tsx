import SettingsHub, { type SettingsSummary } from '@/components/settings/SettingsHub'
import ErrorBoundary from '@/components/ui/ErrorBoundary'
import { publicCardUrl } from '@/lib/my-card-data'
import { followUpSummary } from '@/lib/settings/follow-up-summary'
import { loadSettingsProfile } from '@/lib/settings/load-profile'
import { planSummary } from '@/lib/settings/plan-summary'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Settings — ABC',
}

const hubErrorFallback = (
  <div className="mx-auto w-full max-w-[560px] abc-page-top px-4 pb-10 text-center">
    <p className="text-[15px] font-semibold text-abc-text">Settings could not be opened</p>
    <p className="mt-1.5 text-[13px] text-abc-secondary">Reload the page and try again.</p>
  </div>
)

export default async function SettingsPage() {
  const profile = await loadSettingsProfile()
  if (!profile) return null

  const { planLabel } = planSummary(profile)

  const slug = String(profile.card_slug || '') || null
  const published = Boolean(profile.card_published)

  const summary: SettingsSummary = {
    fullName: String(profile.full_name || ''),
    roleAndCompany: [profile.role, profile.company].filter(Boolean).join(' · '),
    avatarUrl: String(profile.card_photo_url || profile.avatar_url || '') || null,
    planLabel,
    // Three states, said plainly — the same three the My Card screen renders.
    cardStatus: !slug ? 'No public link yet' : published ? 'Live' : 'Not published yet',
    publicAddress: slug ? publicCardUrl(slug) : null,
    // Omitted entirely when unset — see followUpSummary.
    followUp: followUpSummary(profile),
  }

  return (
    <ErrorBoundary fallback={hubErrorFallback}>
      <SettingsHub summary={summary} />
    </ErrorBoundary>
  )
}
