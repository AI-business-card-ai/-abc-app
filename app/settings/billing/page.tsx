import { headers } from 'next/headers'
import BillingSettingsView from '@/components/settings/BillingSettingsView'
import { PRO_KEYS, type ProKey } from '@/lib/billing/catalog'
import { webCheckoutAvailable } from '@/lib/billing/commerce'
import { isProFeature } from '@/lib/billing/pro-features'
import { readBillingStatus } from '@/lib/billing/status'
import { nativePlatformFromHeaders } from '@/lib/native/runtime'
import { loadSettingsProfile } from '@/lib/settings/load-profile'
import { createServerComponentClient } from '@/lib/supabase-server'
import { createServiceClient } from '@/lib/supabase/service'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Plan & Billing — ABC',
}

/**
 * ABC Pro state comes from the verified session, through the same reader
 * /api/billing/status uses. `?pro=required&feature=…` is where a Pro action
 * sends a Free account; it only chooses which sentence to show, never grants.
 *
 * Whether the web checkout is offered is decided here, on the server, so the
 * store apps never render a purchase button even for a moment.
 */
export default async function BillingSettingsPage({
  searchParams,
}: {
  searchParams?: { pro?: string; feature?: string }
}) {
  const profile = await loadSettingsProfile()
  if (!profile) return null

  const {
    data: { user },
  } = await createServerComponentClient().auth.getUser()
  if (!user) return null

  const status = await readBillingStatus(createServiceClient(), { ...profile, id: user.id }, user)

  const proProducts = status.products
    .filter((product) => (PRO_KEYS as readonly string[]).includes(product.key))
    .map((product) => ({ key: product.key as ProKey, available: product.available }))

  const requiredFeature =
    searchParams?.pro === 'required' && isProFeature(searchParams.feature) ? searchParams.feature : null

  return (
    <BillingSettingsView
      profile={profile}
      pro={status.pro}
      proProducts={proProducts}
      requiredFeature={requiredFeature}
      webCheckout={webCheckoutAvailable(nativePlatformFromHeaders(headers()))}
    />
  )
}
