'use client'

import { useState } from 'react'
import Link from 'next/link'
import { IconAlertTriangle, IconTrash } from '@tabler/icons-react'
import SettingsPageHeader from '@/components/settings/SettingsPageHeader'
import {
  ACCOUNT_DELETION_PHRASE,
  accountDeletionMessage,
} from '@/lib/account/deletion-confirmation'
import { createClientComponent } from '@/lib/supabase'

/**
 * Delete account.
 *
 * Says what goes, what may stay and what ABC cannot reach, then asks for the
 * word. Nothing here decides anything: the server checks the session, the
 * confirmation and any subscription again, and deletes only the account the
 * session belongs to.
 *
 * Open to every signed-in account. No plan, credit, Pro or app-store check sits
 * between an owner and this screen.
 */

const DELETED_ACCOUNT_PATH = '/account-deletion?deleted=1'

export default function DeleteAccountView({
  email,
  blocker,
  manageBillingOnWeb,
}: {
  email: string | null
  /** Known in advance when the server could read it; the request checks again either way. */
  blocker: 'active_subscription' | null
  /** Inside the store apps, where Plan & Billing offers no subscription management. */
  manageBillingOnWeb: boolean
}) {
  const [typed, setTyped] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [errorCode, setErrorCode] = useState<string | null>(null)

  const confirmed = typed.trim() === ACCOUNT_DELETION_PHRASE
  const blocked = blocker === 'active_subscription' || errorCode === 'active_subscription'

  async function handleDelete() {
    if (!confirmed || deleting) return
    setDeleting(true)
    setErrorCode(null)

    let res: Response
    try {
      res = await fetch('/api/account/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: typed }),
      })
    } catch {
      setErrorCode('network')
      setDeleting(false)
      return
    }

    const data = (await res.json().catch(() => ({}))) as { deleted?: boolean; error?: string }
    if (!res.ok || !data.deleted) {
      setErrorCode(typeof data.error === 'string' ? data.error : 'deletion_incomplete')
      setDeleting(false)
      return
    }

    // The server has already ended the session; this clears the browser's copy.
    try {
      await createClientComponent().auth.signOut({ scope: 'local' })
    } catch {
      // The account no longer exists either way.
    }
    window.location.replace(DELETED_ACCOUNT_PATH)
  }

  return (
    <div className="mx-auto w-full max-w-[560px] abc-page-top px-4 pb-10 sm:px-6">
      <SettingsPageHeader title="Delete account" description="Permanently delete your ABC account" />

      <section className="mt-6 rounded-card border border-abc-border bg-abc-card p-4">
        <div className="flex items-center gap-2.5">
          <IconAlertTriangle size={18} stroke={1.7} style={{ color: 'var(--abc-overdue)' }} />
          <span className="text-[15px] font-semibold text-abc-text">This cannot be undone</span>
        </div>
        <p className="mt-2 text-[13px] leading-[1.55] text-abc-secondary">
          {email ? (
            <>
              The account signed in as <span className="break-all text-abc-text">{email}</span> will be
              deleted, and you will be signed out.
            </>
          ) : (
            'The account you are signed in to will be deleted, and you will be signed out.'
          )}
        </p>
      </section>

      <section className="mt-3 rounded-card border border-abc-border bg-abc-card p-4">
        <h2 className="text-[15px] font-semibold text-abc-text">What is deleted</h2>
        <ul className="mt-2 flex list-disc flex-col gap-1 pl-5 text-[13px] leading-[1.5] text-abc-secondary">
          <li>Your profile and public card, including its links, events, showcase and uploaded images</li>
          <li>Your contacts, meeting history, notes and follow-ups</li>
          <li>Scan sessions, activities, opportunities and CRM sync records</li>
          <li>Gmail, HubSpot, Salesforce and Pipedrive connections stored by ABC</li>
          <li>Your sign-in</li>
        </ul>
      </section>

      <section className="mt-3 rounded-card border border-abc-border bg-abc-card p-4">
        <h2 className="text-[15px] font-semibold text-abc-text">What may be kept</h2>
        <p className="mt-2 text-[13px] leading-[1.55] text-abc-secondary">
          A record that the account was deleted, with a summary of its purchases, Smart Scan credits and ABC
          Pro billing — without your name, email, card or contacts — so payments can still be accounted for.
          Stripe keeps its own payment records.
        </p>
        <p className="mt-2 text-[13px] leading-[1.55] text-abc-secondary">
          Unused Smart Scan credits and any remaining ABC Pro time end with the account and are not refunded
          automatically.
        </p>
      </section>

      <section className="mt-3 rounded-card border border-abc-border bg-abc-card p-4">
        <h2 className="text-[15px] font-semibold text-abc-text">Not affected</h2>
        <p className="mt-2 text-[13px] leading-[1.55] text-abc-secondary">
          Emails you sent through Gmail, records you pushed to a CRM, files you exported and passes saved to
          Apple or Google Wallet are outside ABC and stay where they are. People who saved your card keep
          their own copy.
        </p>
      </section>

      {blocked ? (
        <section
          className="mt-3 rounded-card border p-4"
          style={{ borderColor: 'var(--abc-overdue)' }}
          role="alert"
        >
          <p className="text-[14px] font-semibold text-abc-text">Cancel your subscription first</p>
          <p className="mt-1.5 text-[13px] leading-[1.55] text-abc-secondary">
            {manageBillingOnWeb
              ? 'You have an ABC Pro subscription that will still renew. Open Plan & Billing in ABC in a web browser, choose Manage subscription and cancel it, then delete your account.'
              : accountDeletionMessage('active_subscription')}
          </p>
          <div className="mt-3">
            <Link
              href="/settings/billing"
              className="inline-flex h-[44px] items-center justify-center rounded-btn border border-abc-border bg-abc-raised px-4 text-[14px] font-medium text-abc-text transition-colors hover:border-abc-border-strong abc-focus-ring"
            >
              Plan &amp; Billing
            </Link>
          </div>
        </section>
      ) : null}

      <section className="mt-3 rounded-card border border-abc-border bg-abc-card p-4">
        <label htmlFor="delete-account-confirm" className="block text-[14px] font-semibold text-abc-text">
          Type {ACCOUNT_DELETION_PHRASE} to confirm
        </label>
        <input
          id="delete-account-confirm"
          type="text"
          value={typed}
          onChange={(event) => setTyped(event.target.value)}
          disabled={deleting}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="characters"
          spellCheck={false}
          inputMode="text"
          aria-describedby={errorCode ? 'delete-account-error' : undefined}
          className="mt-2.5 h-[48px] w-full rounded-btn border border-abc-border bg-abc-raised px-3.5 text-[15px] text-abc-text placeholder:text-abc-muted disabled:opacity-50 abc-focus-ring"
          placeholder={ACCOUNT_DELETION_PHRASE}
        />

        {errorCode && errorCode !== 'active_subscription' ? (
          <p
            id="delete-account-error"
            className="mt-3 text-[12.5px] leading-[1.5]"
            style={{ color: 'var(--abc-overdue)' }}
            role="alert"
          >
            {accountDeletionMessage(errorCode)}
          </p>
        ) : null}

        <button
          type="button"
          onClick={() => void handleDelete()}
          disabled={!confirmed || deleting}
          className="mt-4 inline-flex h-[48px] w-full items-center justify-center gap-2 rounded-btn text-[14px] font-semibold text-white transition-[filter] hover:brightness-[1.06] disabled:cursor-not-allowed disabled:opacity-40 abc-focus-ring"
          style={{ background: 'var(--abc-overdue)' }}
        >
          <IconTrash size={17} stroke={1.8} />
          {deleting ? 'Deleting your account…' : 'Delete my account permanently'}
        </button>
      </section>

      <p className="mt-4 text-center text-[12.5px] text-abc-muted">
        <Link href="/account-deletion" className="underline-offset-2 hover:underline">
          How account deletion works
        </Link>
      </p>
    </div>
  )
}
