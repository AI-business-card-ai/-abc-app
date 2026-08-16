'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  IconAlertTriangle,
  IconCheck,
  IconChevronRight,
  IconCreditCard,
  IconLoader2,
  IconLogout,
  IconMessage2,
  IconTarget,
  IconUser,
} from '@tabler/icons-react'
import { Chip, Field, Section, TextArea, Toggle } from '@/components/card/editor/EditorPrimitives'
import Avatar from '@/components/ui/abc/Avatar'
import { SectionLabel } from '@/components/ui/abc/Bits'
import { normalizeAbcProfile } from '@/lib/profile-defaults'
import { getScanLimitForPlan, isInternalTestPlan, isScanLimitExempt } from '@/lib/scan-limits'
import { PLAN_LABELS, type PaidPlan } from '@/lib/stripe-prices'
import { createClientComponent } from '@/lib/supabase'
import type { ABCProfile } from '@/lib/types'

/**
 * Account settings.
 *
 * Everything that describes the user publicly — name, role, company, contact
 * details, photo, socials, card address — belongs to the card editor at
 * /profile/card and is deliberately not editable here. The previous screen
 * wrote those same columns from a second form, so opening it with stale values
 * and pressing Save silently overwrote whatever the card editor had stored.
 *
 * What remains is genuinely account-level: the context and tone AI writes your
 * follow-ups with, your plan, and signing out. The old "What AI researches"
 * toggles are gone — enrichment is no longer part of the product, and nothing
 * in follow-up generation ever read them. Their columns are left untouched.
 */

/** Only these reach the database — the save validates against the same list. */
const COMMUNICATION_STYLES = ['Direct', 'Formal', 'Casual'] as const
const OUTREACH_LANGUAGES = ['EN', 'CZ', 'DE', 'SK'] as const
const MESSAGE_GOALS = [
  'Schedule a meeting',
  'Get on a call',
  'Send our deck',
  'Start a conversation',
] as const
const MESSAGE_LENGTHS = ['Short', 'Medium', 'Long'] as const

type SaveState = 'idle' | 'saving' | 'saved' | 'error'

/** The account-owned fields only — identity lives on the card. */
const SNAPSHOT_KEYS = [
  'goals',
  'product_description',
  'icp',
  'communication_style',
  'outreach_language',
  'message_goal',
  'message_length',
]

function snapshotOf(profile: Record<string, unknown>): string {
  return JSON.stringify(SNAPSHOT_KEYS.map((k) => profile[k] ?? null))
}

export default function AccountView({ initialProfile }: { initialProfile?: Partial<ABCProfile> | null }) {
  const router = useRouter()
  const supabase = useMemo(() => createClientComponent(), [])

  const [loading, setLoading] = useState(!initialProfile)
  const [profile, setProfile] = useState<Record<string, unknown>>(() => initialProfile ?? {})
  // Seeded synchronously: computing this in an effect made the very first
  // render look dirty, so the server sent a gold, enabled Save button that
  // only corrected itself after hydration.
  const [savedSnapshot, setSavedSnapshot] = useState(() =>
    initialProfile ? snapshotOf(initialProfile as Record<string, unknown>) : ''
  )
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [error, setError] = useState<string | null>(null)
  const [loggingOut, setLoggingOut] = useState(false)
  const [portalLoading, setPortalLoading] = useState(false)
  const [open, setOpen] = useState<Record<string, boolean>>({
    goals: true,
    messages: false,
  })

  const snapshot = snapshotOf

  const loadProfile = useCallback(async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return

      const { data } = await supabase.from('abc_profiles').select('*').eq('id', user.id).maybeSingle()
      if (data) {
        const normalized = normalizeAbcProfile(data as Partial<ABCProfile>, user.email) as unknown as Record<
          string,
          unknown
        >
        setProfile(normalized)
        setSavedSnapshot(snapshot(normalized))
      }
    } catch (err) {
      console.error('[account] load failed:', err)
      setError('Your settings could not be loaded. Check your connection and try again.')
    } finally {
      setLoading(false)
    }
  }, [snapshot, supabase])

  useEffect(() => {
    if (initialProfile) {
      setSavedSnapshot(snapshot(initialProfile as Record<string, unknown>))
      return
    }
    void loadProfile()
  }, [initialProfile, loadProfile, snapshot])

  const dirty = !loading && snapshot(profile) !== savedSnapshot

  function patch(next: Record<string, unknown>) {
    setProfile((prev) => ({ ...prev, ...next }))
    setSaveState('idle')
  }

  const save = useCallback(async () => {
    setSaveState('saving')
    setError(null)
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) {
        setSaveState('error')
        setError('You are signed out. Sign in and try again.')
        return
      }

      const rawStyle = String(profile.communication_style || 'direct')
      const communicationStyle = ['direct', 'formal', 'casual'].includes(rawStyle) ? rawStyle : 'direct'

      // Identity columns are intentionally absent — the card editor owns them.
      const payload: Record<string, unknown> = {
        goals: profile.goals || null,
        product_description: profile.product_description || null,
        icp: profile.icp || null,
        communication_style: communicationStyle,
        outreach_language: profile.outreach_language || 'EN',
        message_length: profile.message_length || 'medium',
        message_goal: profile.message_goal || 'Schedule a meeting',
      }

      const { error: saveError } = await supabase
        .from('abc_profiles')
        .update(payload)
        .eq('id', user.id)

      if (saveError) throw saveError

      setSavedSnapshot(snapshot(profile))
      setSaveState('saved')
      setTimeout(() => setSaveState((s) => (s === 'saved' ? 'idle' : s)), 2500)
    } catch (err) {
      console.error('[account] save failed:', err)
      setSaveState('error')
      setError('Your settings could not be saved. Check your connection and try again.')
    }
  }, [profile, snapshot, supabase])

  async function handleLogout() {
    setLoggingOut(true)
    try {
      await supabase.auth.signOut()
      router.push('/login')
      router.refresh()
    } catch (err) {
      console.error('[account] sign out failed:', err)
      setError('Sign out failed. Try again.')
      setLoggingOut(false)
    }
  }

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

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-[560px] px-4 py-8 sm:px-6">
        <p className="text-[14px] text-abc-secondary">Loading your settings…</p>
      </div>
    )
  }

  const plan = String(profile.plan || 'free')
  const internal = isInternalTestPlan(plan)
  const exempt = isScanLimitExempt(profile as { plan?: string; email?: string; google_email?: string })
  const planLabel = internal ? 'Founder access' : PLAN_LABELS[plan as PaidPlan] || 'Free'
  const scansUsed = Number(profile.scans_used || 0)
  const scanLimit = getScanLimitForPlan(plan)
  const paid = plan !== 'free' && !internal
  const fullName = String(profile.full_name || '')

  return (
    <div className="mx-auto w-full max-w-[560px] px-4 pb-10 pt-5 sm:px-6 lg:pt-8">
      <SectionLabel>Account</SectionLabel>
      <h1 className="mt-2.5 text-[26px] font-bold leading-tight tracking-tight text-abc-text sm:text-[30px]">
        Settings
      </h1>
      <p className="mt-2 text-[14px] leading-[1.55] text-abc-secondary">
        How ABC works for you. Your public details live on your card.
      </p>

      {/* Identity is read-only here — the card editor is the single source of truth */}
      <Link
        href="/profile/card"
        className="mt-6 flex items-center gap-3.5 rounded-card border border-abc-border bg-abc-card p-4 transition-colors duration-200 ease-abc hover:border-abc-border-strong abc-focus-ring"
      >
        <Avatar src={String(profile.card_photo_url || profile.avatar_url || '') || null} name={fullName} size={52} ring />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[16px] font-semibold text-abc-text">
            {fullName || 'Your name'}
          </span>
          <span className="mt-0.5 block truncate text-[13px] text-abc-secondary">
            {[profile.role, profile.company].filter(Boolean).join(' · ') || 'Add your role and company'}
          </span>
          <span className="mt-1.5 block text-[12.5px]" style={{ color: 'var(--abc-gold-accent)' }}>
            Edit card
          </span>
        </span>
        <IconChevronRight size={19} stroke={1.8} className="shrink-0 text-abc-muted" />
      </Link>

      {/* Plan */}
      <section className="mt-4 rounded-card border border-abc-border bg-abc-card p-4">
        <div className="flex items-center gap-2.5">
          <IconCreditCard size={18} stroke={1.7} style={{ color: 'var(--abc-gold-accent)' }} />
          <span className="text-[15px] font-semibold text-abc-text">{planLabel}</span>
          {paid ? (
            <span className="text-[11.5px] font-medium" style={{ color: 'var(--abc-green)' }}>
              Active
            </span>
          ) : null}
        </div>

        <p className="mt-2 text-[13px] text-abc-secondary">
          {exempt || !Number.isFinite(scanLimit)
            ? `Unlimited scans · ${scansUsed} so far`
            : scansUsed >= scanLimit
              ? `Scan limit reached — ${scansUsed} of ${scanLimit} lifetime scans used`
              : `${scansUsed} of ${scanLimit} lifetime scans used`}
        </p>

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
      </section>

      <div className="mt-4 flex flex-col gap-3">
        <Section
          id="goals"
          title="What you are looking for"
          description="Gives AI the context it writes from"
          icon={IconTarget}
          open={open.goals}
          onToggle={() => setOpen((o) => ({ ...o, goals: !o.goals }))}
        >
          <div className="flex flex-col gap-4">
            <TextArea
              label="Your goals"
              value={String(profile.goals || '')}
              onChange={(goals) => patch({ goals })}
              placeholder="Expo partners, B2B SaaS investors, EU market expansion…"
              rows={3}
            />
            <Field
              label="Your product or service"
              value={String(profile.product_description || '')}
              onChange={(product_description) => patch({ product_description })}
              placeholder="ABC AI Business Card — scan to CRM in seconds"
            />
            <Field
              label="Target customer"
              value={String(profile.icp || '')}
              onChange={(icp) => patch({ icp })}
              placeholder="Sales directors and founders at B2B tech companies"
            />
          </div>
        </Section>

        <Section
          id="messages"
          title="AI messages"
          description="How AI writes on your behalf"
          icon={IconMessage2}
          open={open.messages}
          onToggle={() => setOpen((o) => ({ ...o, messages: !o.messages }))}
        >
          <div className="flex flex-col gap-5">
            <fieldset>
              <legend className="text-[12.5px] font-medium text-abc-secondary">Tone</legend>
              <div className="mt-2.5 flex flex-wrap gap-2">
                {COMMUNICATION_STYLES.map((style) => (
                  <Chip
                    key={style}
                    active={String(profile.communication_style || 'direct') === style.toLowerCase()}
                    onClick={() => patch({ communication_style: style.toLowerCase() })}
                  >
                    {style}
                  </Chip>
                ))}
              </div>
            </fieldset>

            <fieldset>
              <legend className="text-[12.5px] font-medium text-abc-secondary">Outreach language</legend>
              <div className="mt-2.5 flex flex-wrap gap-2">
                {OUTREACH_LANGUAGES.map((lang) => (
                  <Chip
                    key={lang}
                    active={String(profile.outreach_language || 'EN') === lang}
                    onClick={() => patch({ outreach_language: lang })}
                  >
                    {lang}
                  </Chip>
                ))}
              </div>
            </fieldset>

            <fieldset>
              <legend className="text-[12.5px] font-medium text-abc-secondary">Goal of the message</legend>
              <div className="mt-2.5 flex flex-wrap gap-2">
                {MESSAGE_GOALS.map((goal) => (
                  <Chip
                    key={goal}
                    active={String(profile.message_goal || 'Schedule a meeting') === goal}
                    onClick={() => patch({ message_goal: goal })}
                  >
                    {goal}
                  </Chip>
                ))}
              </div>
            </fieldset>

            <fieldset>
              <legend className="text-[12.5px] font-medium text-abc-secondary">Length</legend>
              <div className="mt-2.5 flex flex-wrap gap-2">
                {MESSAGE_LENGTHS.map((len) => (
                  <Chip
                    key={len}
                    active={String(profile.message_length || 'medium') === len.toLowerCase()}
                    onClick={() => patch({ message_length: len.toLowerCase() })}
                  >
                    {len}
                  </Chip>
                ))}
              </div>
            </fieldset>
          </div>
        </Section>

      </div>

      {/* Save */}
      <div
        className="sticky z-[60] -mx-4 mt-6 border-t border-abc-border bg-abc-bg/95 px-4 py-3 backdrop-blur-xl sm:-mx-6 sm:px-6"
        style={{ bottom: 'calc(72px + env(safe-area-inset-bottom))' }}
      >
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1" aria-live="polite">
            {saveState === 'error' ? (
              <p
                className="flex items-start gap-1.5 text-[12.5px] leading-[1.4]"
                style={{ color: 'var(--abc-overdue)' }}
                role="alert"
              >
                <IconAlertTriangle size={14} stroke={1.9} className="mt-px shrink-0" />
                <span>{error || 'Could not save. Try again.'}</span>
              </p>
            ) : saveState === 'saved' ? (
              <p
                className="inline-flex items-center gap-1.5 text-[12.5px]"
                style={{ color: 'var(--abc-green)' }}
              >
                <IconCheck size={14} stroke={2.2} />
                Saved
              </p>
            ) : dirty ? (
              <p className="text-[12.5px] text-abc-secondary">Unsaved changes</p>
            ) : (
              <p className="text-[12.5px] text-abc-muted">Everything is saved</p>
            )}
          </div>

          <button
            type="button"
            onClick={() => void save()}
            disabled={saveState === 'saving' || !dirty}
            className={`inline-flex h-[48px] shrink-0 items-center justify-center gap-2 rounded-btn px-5 text-[15px] font-semibold transition-colors duration-200 ease-abc abc-focus-ring ${
              dirty && saveState !== 'saving'
                ? 'bg-abc-gold text-[#1a1205] hover:brightness-[1.06]'
                : 'cursor-not-allowed border border-abc-border bg-abc-raised text-abc-muted'
            }`}
          >
            {saveState === 'saving' ? (
              <IconLoader2 size={17} stroke={2} className="animate-spin" />
            ) : null}
            {saveState === 'saving' ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </div>

      <button
        type="button"
        onClick={() => void handleLogout()}
        disabled={loggingOut}
        className="mt-6 inline-flex h-[48px] w-full items-center justify-center gap-2 rounded-btn border border-abc-border bg-transparent text-[14px] font-medium text-abc-secondary transition-colors hover:text-abc-text disabled:opacity-50 abc-focus-ring"
      >
        <IconLogout size={17} stroke={1.8} />
        {loggingOut ? 'Signing out…' : 'Sign out'}
      </button>

      <p className="mt-5 flex items-center justify-center gap-1.5 text-[12px] text-abc-muted">
        <IconUser size={13} stroke={1.7} />
        {String(profile.email || '')}
      </p>
    </div>
  )
}
