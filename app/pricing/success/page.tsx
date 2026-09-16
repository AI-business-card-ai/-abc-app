'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClientComponent } from '@/lib/supabase'
import { getScanLimitForPlan } from '@/lib/scan-limits'
import { PLAN_LABELS, type PaidPlan } from '@/lib/stripe-prices'
import PublicNotice from '@/components/landing/PublicNotice'

/**
 * Where Stripe returns after a successful payment.
 *
 * The plan-resolution logic is unchanged: the checkout session is the primary
 * source, and the profile row is the fallback for when the webhook has landed
 * but the session lookup has not answered.
 *
 * Only the presentation moved onto the public system. It used to paint a
 * pink-to-cyan button on `#0f0f0f` in `system-ui`, so the product visibly
 * changed brand at the exact moment somebody had just paid for it.
 *
 * The allowance is described as lifetime, which is what `scan-limits` actually
 * enforces — the old copy said "you can scan up to N contacts", which reads as
 * a monthly figure and set the wrong expectation on day one.
 */
function SuccessContent() {
  const searchParams = useSearchParams()
  const [supabase] = useState(() => createClientComponent())
  const [plan, setPlan] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    const sessionId = searchParams.get('session_id')

    ;(async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!active) return

      if (!user) {
        setLoading(false)
        return
      }

      if (sessionId) {
        try {
          const res = await fetch(`/api/stripe/session?session_id=${encodeURIComponent(sessionId)}`)
          if (res.ok) {
            const data = await res.json()
            if (data.plan && active) {
              setPlan(data.plan)
              setLoading(false)
              return
            }
          }
        } catch {
          // fall through to the profile row
        }
      }

      const { data: profile } = await supabase
        .from('abc_profiles')
        .select('plan')
        .eq('id', user.id)
        .maybeSingle()

      if (active) {
        setPlan(profile?.plan ?? 'starter')
        setLoading(false)
      }
    })()

    return () => {
      active = false
    }
  }, [searchParams, supabase])

  const planKey = (plan && plan !== 'free' ? plan : 'starter') as PaidPlan
  const planLabel = PLAN_LABELS[planKey] ?? plan ?? 'Starter'
  const scanLimit = getScanLimitForPlan(planKey)

  return (
    <PublicNotice
      eyebrow="Payment received"
      title="You're on ABC Pro."
      actions={[
        { href: '/scan', label: 'Start scanning', variant: 'gold' },
        { href: '/contacts', label: 'View contacts' },
      ]}
    >
      {loading ? (
        <p className="pub-notice-body">Activating your plan…</p>
      ) : (
        <>
          <p className="pub-notice-body">
            Your <strong>{planLabel}</strong> plan is active, with{' '}
            <strong>{scanLimit.toLocaleString('en-GB')}</strong> lifetime scans.
          </p>
          <p className="pub-notice-note">
            Everything after the meeting is now yours: meeting context, follow-up drafted from what
            you discussed, and export to your CRM.
          </p>
        </>
      )}
    </PublicNotice>
  )
}

export default function PricingSuccessPage() {
  return (
    <Suspense
      fallback={
        <PublicNotice eyebrow="Payment received" title="You're on ABC Pro." actions={[]}>
          <p className="pub-notice-body">Activating your plan…</p>
        </PublicNotice>
      }
    >
      <SuccessContent />
    </Suspense>
  )
}
