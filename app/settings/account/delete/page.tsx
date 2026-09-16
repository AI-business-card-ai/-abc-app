import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import DeleteAccountView from '@/components/settings/DeleteAccountView'
import { readAccountDeletionBlocker } from '@/lib/account/delete'
import { webCheckoutAvailable } from '@/lib/billing/commerce'
import { nativePlatformFromHeaders } from '@/lib/native/runtime'
import { createServerComponentClient } from '@/lib/supabase-server'
import { createServiceClient } from '@/lib/supabase/service'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Delete account — ABC',
}

/**
 * The owner comes from the verified session. Whether a subscription blocks
 * deletion is read in advance only to warn early; the request enforces it.
 */
export default async function DeleteAccountPage() {
  const {
    data: { user },
  } = await createServerComponentClient().auth.getUser()
  if (!user) redirect('/login')

  let blocker: 'active_subscription' | null = null
  try {
    blocker = await readAccountDeletionBlocker(createServiceClient(), user.id)
  } catch {
    blocker = null
  }

  return (
    <DeleteAccountView
      email={user.email ?? null}
      blocker={blocker}
      manageBillingOnWeb={!webCheckoutAvailable(nativePlatformFromHeaders(headers()))}
    />
  )
}
