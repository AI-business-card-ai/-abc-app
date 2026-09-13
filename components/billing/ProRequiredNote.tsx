import Link from 'next/link'
import { PRO_FEATURE_MESSAGES, type ProFeature } from '@/lib/billing/pro-features'

/**
 * The one way a screen says an action belongs to ABC Pro.
 *
 * What the action is part of, and where to see the plan. No price, no duration
 * and no buy button: the plan page is the one place that knows whether ABC Pro
 * can actually be bought right now, and it says so honestly.
 */
export default function ProRequiredNote({
  feature,
  message,
  showPlanLink = true,
}: {
  feature?: ProFeature
  message?: string
  showPlanLink?: boolean
}) {
  const text = message ?? (feature ? PRO_FEATURE_MESSAGES[feature] : 'This is part of ABC Pro.')

  return (
    <div className="rounded-inner border border-abc-border bg-abc-raised px-3.5 py-3" role="note">
      <p
        className="text-[11.5px] font-semibold uppercase tracking-[0.06em]"
        style={{ color: 'var(--abc-gold-accent)' }}
      >
        ABC Pro
      </p>
      <p className="mt-1 text-[13px] leading-[1.5] text-abc-secondary">{text}</p>
      {showPlanLink ? (
        <Link
          href="/settings/billing"
          className="mt-2 inline-flex text-[13px] font-medium text-abc-text underline-offset-2 hover:underline abc-focus-ring"
        >
          See your plan
        </Link>
      ) : null}
    </div>
  )
}
