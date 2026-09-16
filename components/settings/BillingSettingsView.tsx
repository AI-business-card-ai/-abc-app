'use client'

import { useState } from 'react'
import Link from 'next/link'
import { IconCreditCard } from '@tabler/icons-react'
import ProRequiredNote from '@/components/billing/ProRequiredNote'
import SettingsPageHeader from '@/components/settings/SettingsPageHeader'
import type { ProKey } from '@/lib/billing/catalog'
import { NATIVE_PURCHASES_UNAVAILABLE_MESSAGE } from '@/lib/billing/commerce'
import { PRO_SOURCE_LABELS, type ProFeature } from '@/lib/billing/pro-features'
import type { BillingStatus } from '@/lib/billing/status'
import { planSummary } from '@/lib/settings/plan-summary'
import type { ABCProfile } from '@/lib/types'
import { userFacingRequestError } from '@/lib/network-error'

/**
 * Plan & Billing.
 *
 * What plan you are on, how much of it you have used, and the one button that
 * changes either — Stripe's own portal for a paying account, the pricing page
 * for a free one. ABC does not reimplement subscription management; it opens
 * the portal that already exists.
 *
 * The plan figures come from `planSummary` so that this page and the settings
 * hub cannot describe the same plan differently.
 *
 * ABC Pro has its own section, fed by the server's entitlement resolver: whether
 * it is active, where from, and until when. It offers a purchase only for a Pro
 * product that is actually configured to be bought, and names no price — the
 * checkout shows the real one. Otherwise it says plainly that Pro cannot be
 * bought yet.
 *
 * Inside the App Store and Google Play apps (`webCheckout` false) no web checkout,
 * portal or pricing link is shown, and nothing points elsewhere to buy: the page
 * reports the plan and says purchases are not available in the app. See
 * lib/billing/commerce.ts.
 */

export type ProProductOption = { key: ProKey; available: boolean }

const PRODUCT_LABELS: Record<ProKey, string> = {
  pro_event: PRO_SOURCE_LABELS.event_pass,
  pro_monthly: PRO_SOURCE_LABELS.monthly,
  pro_annual: PRO_SOURCE_LABELS.annual,
}

function formatDate(value: string | null): string | null {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

/**
 * A Pro subscription Stripe can still charge — the same states that stop an
 * account from being deleted (account_deletion_blocker). Its owner needs the
 * portal to cancel it, and the plan section above only offers the portal for a
 * legacy paid plan.
 */
function subscriptionStillBills(pro: BillingStatus['pro']): boolean {
  if (pro.productKey !== 'pro_monthly' && pro.productKey !== 'pro_annual') return false
  return pro.status !== null && pro.status !== 'canceled' && pro.status !== 'expired'
}

function proLine(pro: BillingStatus['pro']): string {
  if (pro.viaFounder) return 'Included with founder access.'
  if (!pro.active) return 'Not active.'

  const label = PRO_SOURCE_LABELS[pro.source]
  const date = formatDate(pro.endsAt)
  if (!date) return label
  if (pro.source === 'event_pass') return `${label} · until ${date}`
  return pro.renews ? `${label} · renews ${date}` : `${label} · ends ${date}`
}

export default function BillingSettingsView({
  profile,
  pro,
  proProducts,
  requiredFeature,
  webCheckout = true,
}: {
  profile: Partial<ABCProfile>
  pro: BillingStatus['pro']
  proProducts: ProProductOption[]
  requiredFeature: ProFeature | null
  /** False inside the store apps, where the web checkout is not offered. */
  webCheckout?: boolean
}) {
  const [portalLoading, setPortalLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [checkoutKey, setCheckoutKey] = useState<ProKey | null>(null)
  const [proError, setProError] = useState<string | null>(null)

  const { planLabel, paid, exempt, usageLine } = planSummary(profile)
  const buyable = proProducts.filter((product) => product.available)

  async function openBillingPortal() {
    setPortalLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/stripe/portal', { method: 'POST' })
      const data = await res.json()
      if (!res.ok || !data.url) throw new Error(data.error || 'Could not open the billing portal.')
      window.location.href = data.url
    } catch (err) {
      setError(userFacingRequestError(err, 'Could not open the billing portal.'))
      setPortalLoading(false)
    }
  }

  async function startProCheckout(productKey: ProKey) {
    setCheckoutKey(productKey)
    setProError(null)
    try {
      const res = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productKey }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.url) throw new Error(data.error || 'Could not start checkout.')
      window.location.href = data.url
    } catch (err) {
      setProError(userFacingRequestError(err, 'Could not start checkout.'))
      setCheckoutKey(null)
    }
  }

  return (
    <div className="mx-auto w-full max-w-[560px] abc-page-top px-4 pb-10 sm:px-6">
      <SettingsPageHeader title="Plan & Billing" description="Your plan, usage and billing" />

      <section className="mt-6 rounded-card border border-abc-border bg-abc-card p-4">
        <div className="flex items-center gap-2.5">
          <IconCreditCard size={18} stroke={1.7} style={{ color: 'var(--abc-gold-accent)' }} />
          <span className="text-[15px] font-semibold text-abc-text">{planLabel}</span>
          {paid ? (
            <span className="text-[11.5px] font-medium" style={{ color: 'var(--abc-green)' }}>
              Active
            </span>
          ) : null}
        </div>

        <p className="mt-2 text-[13px] text-abc-secondary">{usageLine}</p>

        <div className="mt-3.5">
          {!webCheckout ? (
            paid || exempt ? null : (
              <p className="text-[13px] text-abc-secondary">{NATIVE_PURCHASES_UNAVAILABLE_MESSAGE}</p>
            )
          ) : paid && profile.stripe_customer_id ? (
            <button
              type="button"
              onClick={() => void openBillingPortal()}
              disabled={portalLoading}
              className="inline-flex h-[44px] items-center justify-center rounded-btn border border-abc-border bg-abc-raised px-4 text-[14px] font-medium text-abc-text transition-colors hover:border-abc-border-strong disabled:opacity-50 abc-focus-ring"
            >
              {portalLoading ? 'Opening…' : 'Manage subscription'}
            </button>
          ) : exempt ? null : (
            <Link
              href="/pricing"
              className="inline-flex h-[44px] items-center justify-center rounded-btn bg-abc-gold px-4 text-[14px] font-semibold text-[#1a1205] transition-[filter] hover:brightness-[1.06] abc-focus-ring"
            >
              Upgrade
            </Link>
          )}
        </div>

        {error ? (
          <p className="mt-3 text-[12.5px]" style={{ color: 'var(--abc-overdue)' }} role="alert">
            {error}
          </p>
        ) : null}
      </section>

      <section id="pro" className="mt-3 rounded-card border border-abc-border bg-abc-card p-4">
        <div className="flex items-center gap-2.5">
          <span className="text-[15px] font-semibold text-abc-text">ABC Pro</span>
          {pro.active ? (
            <span className="text-[11.5px] font-medium" style={{ color: 'var(--abc-green)' }}>
              Active
            </span>
          ) : null}
        </div>

        <p className="mt-2 text-[13px] text-abc-secondary">{proLine(pro)}</p>
        <p className="mt-1.5 text-[12.5px] leading-[1.5] text-abc-muted">
          Smart Follow-up, scheduled follow-ups, sending from Gmail and CRM sync. Smart Scan credits are
          separate.
        </p>

        {webCheckout && profile.stripe_customer_id && subscriptionStillBills(pro) ? (
          <div className="mt-3.5">
            <button
              type="button"
              onClick={() => void openBillingPortal()}
              disabled={portalLoading}
              className="inline-flex h-[44px] items-center justify-center rounded-btn border border-abc-border bg-abc-raised px-4 text-[14px] font-medium text-abc-text transition-colors hover:border-abc-border-strong disabled:opacity-50 abc-focus-ring"
            >
              {portalLoading ? 'Opening…' : 'Manage subscription'}
            </button>
          </div>
        ) : null}

        {requiredFeature && !pro.active ? (
          <div className="mt-3">
            <ProRequiredNote feature={requiredFeature} showPlanLink={false} />
          </div>
        ) : null}

        {pro.active ? null : !webCheckout ? (
          <p className="mt-3 text-[13px] text-abc-secondary">{NATIVE_PURCHASES_UNAVAILABLE_MESSAGE}</p>
        ) : buyable.length > 0 ? (
          <div className="mt-3.5 flex flex-wrap gap-2">
            {buyable.map((product) => (
              <button
                key={product.key}
                type="button"
                onClick={() => void startProCheckout(product.key)}
                disabled={checkoutKey !== null}
                className="inline-flex h-[44px] items-center justify-center rounded-btn border border-abc-border bg-abc-raised px-4 text-[14px] font-medium text-abc-text transition-colors hover:border-abc-border-strong disabled:opacity-50 abc-focus-ring"
              >
                {checkoutKey === product.key ? 'Opening…' : PRODUCT_LABELS[product.key]}
              </button>
            ))}
          </div>
        ) : (
          <p className="mt-3 text-[13px] text-abc-secondary">ABC Pro isn’t available to buy yet.</p>
        )}

        {proError ? (
          <p className="mt-3 text-[12.5px]" style={{ color: 'var(--abc-overdue)' }} role="alert">
            {proError}
          </p>
        ) : null}
      </section>
    </div>
  )
}
