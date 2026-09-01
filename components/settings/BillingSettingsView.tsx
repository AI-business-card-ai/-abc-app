'use client'

import { useState } from 'react'
import Link from 'next/link'
import { IconCreditCard } from '@tabler/icons-react'
import SettingsPageHeader from '@/components/settings/SettingsPageHeader'
import { planSummary } from '@/lib/settings/plan-summary'
import type { ABCProfile } from '@/lib/types'

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
 */
export default function BillingSettingsView({ profile }: { profile: Partial<ABCProfile> }) {
  const [portalLoading, setPortalLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { planLabel, paid, exempt, usageLine } = planSummary(profile)

  async function openBillingPortal() {
    setPortalLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/stripe/portal', { method: 'POST' })
      const data = await res.json()
      if (!res.ok || !data.url) throw new Error(data.error || 'Could not open the billing portal.')
      window.location.href = data.url
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not open the billing portal.')
      setPortalLoading(false)
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
          {paid && profile.stripe_customer_id ? (
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
    </div>
  )
}
