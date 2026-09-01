'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { IconChevronRight, IconLock, IconLogout, IconMail } from '@tabler/icons-react'
import SettingsPageHeader from '@/components/settings/SettingsPageHeader'
import Avatar from '@/components/ui/abc/Avatar'
import { CARD_EDITOR_PATH } from '@/lib/settings/sections'
import { createClientComponent } from '@/lib/supabase'
import type { ABCProfile } from '@/lib/types'

/**
 * Profile & Account.
 *
 * Who you are to ABC, and the account itself. Identity is shown here and edited
 * in the card editor: name, role, company and photo are card fields, and a
 * second form writing the same columns is how the old account screen used to
 * overwrite the editor's values with whatever it had loaded first. So the
 * identity block is a link, not a form.
 *
 * What genuinely belongs to the account — the email it signs in with, and
 * signing out — is here and nowhere else.
 */
export default function ProfileSettingsView({
  profile,
}: {
  profile: Partial<ABCProfile>
}) {
  const router = useRouter()
  const [loggingOut, setLoggingOut] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fullName = String(profile.full_name || '')
  const roleAndCompany = [profile.role, profile.company].filter(Boolean).join(' · ')
  const email = String(profile.email || '')

  async function handleLogout() {
    setLoggingOut(true)
    setError(null)
    try {
      const supabase = createClientComponent()
      await supabase.auth.signOut()
      router.push('/login')
      router.refresh()
    } catch (err) {
      console.error('[settings/profile] sign out failed:', err)
      setError('Sign out failed. Try again.')
      setLoggingOut(false)
    }
  }

  return (
    <div className="mx-auto w-full max-w-[560px] px-4 pb-10 pt-5 sm:px-6 lg:pt-8">
      <SettingsPageHeader title="Profile & Account" description="Your identity and account" />

      {/* Identity is read-only here — the card editor is the single source of truth */}
      <Link
        href={CARD_EDITOR_PATH}
        className="mt-6 flex items-center gap-3.5 rounded-card border border-abc-border bg-abc-card p-4 transition-colors duration-200 ease-abc hover:border-abc-border-strong abc-focus-ring"
      >
        <Avatar
          src={String(profile.card_photo_url || profile.avatar_url || '') || null}
          name={fullName}
          size={52}
          ring
        />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[16px] font-semibold text-abc-text">
            {fullName || 'Your name'}
          </span>
          <span className="mt-0.5 block truncate text-[13px] text-abc-secondary">
            {roleAndCompany || 'Add your role and company'}
          </span>
          <span className="mt-1.5 block text-[12.5px]" style={{ color: 'var(--abc-gold-accent)' }}>
            Edit card details
          </span>
        </span>
        <IconChevronRight size={19} stroke={1.8} className="shrink-0 text-abc-muted" />
      </Link>

      <section className="mt-4 rounded-card border border-abc-border bg-abc-card p-4">
        <div className="flex items-center gap-2.5">
          <IconMail size={18} stroke={1.7} style={{ color: 'var(--abc-gold-accent)' }} />
          <span className="text-[15px] font-semibold text-abc-text">Sign-in email</span>
        </div>
        <p className="mt-2 break-all text-[13px] text-abc-secondary">{email || 'Not available'}</p>
      </section>

      <section className="mt-4 rounded-card border border-abc-border bg-abc-card p-4">
        <div className="flex items-center gap-2.5">
          <IconLock size={18} stroke={1.7} style={{ color: 'var(--abc-gold-accent)' }} />
          <span className="text-[15px] font-semibold text-abc-text">Password</span>
        </div>
        {/*
          The one password path there is, and the label says what it actually
          does: this hands off to the shipped recovery flow, which mails a link
          and verifies it before anyone chooses a new password. "Change
          password" promised a form that is not here — and a second in-app form
          would be a second way to change the same thing, and the weaker of the
          two.
        */}
        <p className="mt-2 text-[13px] leading-[1.5] text-abc-secondary">
          Send a secure password reset link to your email.
        </p>
        <div className="mt-3.5">
          <Link
            href="/forgot-password"
            className="inline-flex h-[44px] items-center justify-center rounded-btn border border-abc-border bg-abc-raised px-4 text-[14px] font-medium text-abc-text transition-colors hover:border-abc-border-strong abc-focus-ring"
          >
            Reset password
          </Link>
        </div>
      </section>

      {error ? (
        <p className="mt-4 text-[12.5px]" style={{ color: 'var(--abc-overdue)' }} role="alert">
          {error}
        </p>
      ) : null}

      <button
        type="button"
        onClick={() => void handleLogout()}
        disabled={loggingOut}
        className="mt-6 inline-flex h-[48px] w-full items-center justify-center gap-2 rounded-btn border border-abc-border bg-transparent text-[14px] font-medium text-abc-secondary transition-colors hover:text-abc-text disabled:opacity-50 abc-focus-ring"
      >
        <IconLogout size={17} stroke={1.8} />
        {loggingOut ? 'Signing out…' : 'Sign out'}
      </button>
    </div>
  )
}
