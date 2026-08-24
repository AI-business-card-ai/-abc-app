import AccountView from '@/components/account/AccountView'
import ErrorBoundary from '@/components/ui/ErrorBoundary'
import { normalizeAbcProfile, stripProfileSecrets, PROFILE_SAFE_COLUMNS } from '@/lib/profile-defaults'
import { createServerComponentClient } from '@/lib/supabase-server'
import type { ABCProfile } from '@/lib/types'

export const dynamic = 'force-dynamic'

const accountErrorFallback = (
  <div className="mx-auto w-full max-w-[560px] px-4 py-10 text-center">
    <p className="text-[15px] font-semibold text-abc-text">Settings could not be opened</p>
    <p className="mt-1.5 text-[13px] text-abc-secondary">Reload the page and try again.</p>
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
    .select(PROFILE_SAFE_COLUMNS)
    .eq('id', user.id)
    .maybeSingle()

  if (error) {
    console.error('[account] abc_profiles query failed:', error)
  }

  // Stripped before it becomes a client component prop: this page selects the
  // whole profile row, and the whole profile row includes OAuth credentials.
  const profile = stripProfileSecrets(
    normalizeAbcProfile((data ?? {}) as Partial<ABCProfile>, user.email)
  )

  return (
    <ErrorBoundary fallback={accountErrorFallback}>
      <AccountView initialProfile={profile} />
    </ErrorBoundary>
  )
}
