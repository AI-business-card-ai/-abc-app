'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  IconBrandLinkedin,
  IconBrandWhatsapp,
  IconBriefcase,
  IconBuilding,
  IconChevronLeft,
  IconMail,
  IconMapPin,
  IconPhone,
  IconPlugConnected,
  IconScan,
  IconTrash,
  IconUserPlus,
  IconWorld,
} from '@tabler/icons-react'
import ActivityNotesCard from '@/components/contacts/detail/ActivityNotesCard'
import MeetingContextCard from '@/components/contacts/detail/MeetingContextCard'
import MeetingHistoryCard from '@/components/contacts/detail/MeetingHistoryCard'
import CrmPushCard from '@/components/contacts/detail/CrmPushCard'
import SmartFollowUpCard from '@/components/contacts/detail/SmartFollowUpCard'
import { CardTitle, ErrorNote, FieldRow } from '@/components/contacts/detail/parts'
import Avatar from '@/components/ui/abc/Avatar'
import Button from '@/components/ui/abc/Button'
import { IconTile } from '@/components/ui/abc/Bits'
import { formatWhatsAppPhone } from '@/lib/outreach-composers'
import { CRM_PROVIDERS, crmStatusLabel } from '@/lib/crm/providers'
import type { ContactDetail, CrmConnections } from '@/lib/contact-detail'

function scannedLine(contact: ContactDetail): string | null {
  const parts: string[] = []
  if (contact.capturePhrase) parts.push(contact.capturePhrase)
  if (contact.scannedAt) {
    const date = new Date(contact.scannedAt)
    if (!Number.isNaN(date.getTime())) {
      parts.push(date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }))
    }
  }
  return parts.length > 0 ? parts.join(' · ') : null
}

export default function ContactDetailView({
  contact: initial,
  crm,
}: {
  contact: ContactDetail
  crm: CrmConnections
}) {
  const router = useRouter()
  const [contact, setContact] = useState(initial)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const whatsappNumber = contact.phone ? formatWhatsAppPhone(contact.phone) : ''
  const meta = [contact.role, contact.company].filter(Boolean).join(' · ')
  const scanned = scannedLine(contact)

  async function remove() {
    setDeleting(true)
    setError(null)
    try {
      const res = await fetch('/api/card/delete', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contactId: contact.id }),
      })
      if (!res.ok) throw new Error('failed')
      router.push('/contacts')
      router.refresh()
    } catch {
      setError('Could not delete this contact.')
      setDeleting(false)
      setConfirmDelete(false)
    }
  }

  return (
    <div className="mx-auto w-full max-w-[1100px] px-4 pb-10 pt-4 sm:px-6 lg:px-8 lg:pt-6">
      <Link
        href="/contacts"
        className="inline-flex items-center gap-1.5 rounded-inner py-1.5 text-[13.5px] font-medium text-abc-secondary transition-colors hover:text-abc-text abc-focus-ring"
      >
        <IconChevronLeft size={17} stroke={2} />
        Contacts
      </Link>

      {/* Identity */}
      <header className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-center">
        <Avatar src={contact.photoUrl} name={contact.name} size={76} ring />
        <div className="min-w-0">
          <h1 className="page-heading font-bold leading-tight tracking-tight text-abc-text">
            {contact.name}
          </h1>
          {contact.role ? (
            <p className="mt-1 text-[15px] text-abc-gold-accent">{contact.role}</p>
          ) : null}
          {contact.company ? (
            <p className="mt-0.5 text-[15px] text-abc-secondary">{contact.company}</p>
          ) : null}
          {!contact.role && !contact.company && meta ? (
            <p className="mt-1 text-[15px] text-abc-secondary">{meta}</p>
          ) : null}
          {scanned ? <p className="mt-1.5 text-[12.5px] text-abc-muted">{scanned}</p> : null}
        </div>
      </header>

      {/* Quick actions — only where the data exists */}
      <div className="mt-5 flex gap-2">
        {contact.phone ? (
          <IconTile icon={IconPhone} label="Call" href={`tel:${contact.phone}`} />
        ) : null}
        {contact.email ? (
          <IconTile icon={IconMail} label="Email" href={`mailto:${contact.email}`} />
        ) : null}
        {whatsappNumber ? (
          <IconTile
            icon={IconBrandWhatsapp}
            label="WhatsApp"
            href={`https://wa.me/${whatsappNumber}`}
          />
        ) : null}
        {contact.linkedinUrl ? (
          <IconTile icon={IconBrandLinkedin} label="LinkedIn" href={contact.linkedinUrl} />
        ) : null}
        <IconTile
          icon={IconUserPlus}
          label="Save contact"
          href={`/api/contact/vcard/${contact.id}`}
        />
      </div>

      {error ? <div className="mt-4"><ErrorNote>{error}</ErrorNote></div> : null}

      {/* Main composition */}
      <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)] lg:items-start">
        <div className="flex flex-col gap-4">
          <MeetingContextCard contact={contact} />
          <MeetingHistoryCard contact={contact} />
          <SmartFollowUpCard contact={contact} />
          <CrmPushCard contact={contact} />
          <div className="lg:hidden">
            <ContactInfo contact={contact} />
          </div>
          <ActivityNotesCard contactId={contact.id} />
        </div>

        <div className="flex flex-col gap-4">
          <div className="hidden lg:block">
            <ContactInfo contact={contact} />
          </div>

          {/* CRM */}
          <section className="abc-surface p-5">
            <CardTitle>CRM</CardTitle>
            <ul className="mt-3 flex flex-col gap-2.5">
              {/*
                Every provider ABC ships, from the shared list, reading the
                state the push card below reads. This was a literal array of
                two, which is how Pipedrive came to be missing from a summary
                of the CRMs while the panel underneath offered to push to it.
              */}
              {CRM_PROVIDERS.map((provider) => {
                const label = crmStatusLabel(crm[provider.id])

                return (
                  <li
                    key={provider.id}
                    className="flex items-center justify-between gap-3 rounded-inner border border-abc-border bg-abc-raised px-3.5 py-3"
                  >
                    <span className="text-[14px] text-abc-text">{provider.name}</span>
                    {label === 'connected' ? (
                      <span
                        className="inline-flex items-center gap-1.5 text-[12.5px] font-medium"
                        style={{ color: 'var(--abc-green)' }}
                      >
                        <span
                          className="h-1.5 w-1.5 rounded-full"
                          style={{ background: 'var(--abc-green)' }}
                          aria-hidden="true"
                        />
                        Connected
                      </span>
                    ) : label === 'needs_reconnect' ? (
                      /*
                        Connected once, unusable now. Saying "Connected" here
                        would disagree with the push card, which declines to
                        push and offers Reconnect instead.
                      */
                      <span
                        className="text-[12.5px] font-medium"
                        style={{ color: 'var(--abc-overdue)' }}
                      >
                        Needs reconnecting
                      </span>
                    ) : (
                      <span className="text-[12.5px] text-abc-muted">Not connected</span>
                    )}
                  </li>
                )
              })}
            </ul>
            <p className="mt-3 text-[12.5px] leading-[1.5] text-abc-muted">
              Manage CRM connections and send this contact from the CRM section below.
            </p>
            {/*
              The CRM section on this page, not /settings. That link went to a
              screen which redirects to the account page, and the account page
              has no CRM controls on it at all — so the button was a dead end
              pointing away from the one place connections can be managed.
            */}
            <Button href="#crm" variant="surface" fullWidth className="mt-3">
              <IconPlugConnected size={17} stroke={1.8} />
              Manage connections
            </Button>
          </section>

          {/* Secondary actions */}
          <section className="abc-surface p-5">
            <CardTitle>Manage</CardTitle>
            <div className="mt-3 flex flex-col gap-2">
              <Button href="/scan" variant="surface" fullWidth>
                <IconScan size={17} stroke={1.8} />
                Scan another contact
              </Button>

              {confirmDelete ? (
                <div className="rounded-inner border border-abc-border bg-abc-raised p-3.5">
                  <p className="text-[13px] leading-[1.5] text-abc-secondary">
                    Delete {contact.name} and all saved meeting context? This cannot be undone.
                  </p>
                  <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                    <button
                      type="button"
                      onClick={() => void remove()}
                      disabled={deleting}
                      className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-btn text-[14px] font-semibold text-white transition-[filter] hover:brightness-110 disabled:opacity-50 abc-focus-ring"
                      style={{ background: 'var(--abc-overdue)' }}
                    >
                      <IconTrash size={16} stroke={1.9} />
                      {deleting ? 'Deleting…' : 'Yes, delete'}
                    </button>
                    <Button
                      onClick={() => setConfirmDelete(false)}
                      variant="surface"
                      disabled={deleting}
                      fullWidth
                      className="sm:flex-1"
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-btn border border-abc-border text-[14px] font-medium transition-colors hover:border-abc-border-strong abc-focus-ring"
                  style={{ color: 'var(--abc-overdue)' }}
                >
                  <IconTrash size={16} stroke={1.8} />
                  Delete contact
                </button>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}

function ContactInfo({ contact }: { contact: ContactDetail }) {
  const rows = [
    contact.email
      ? { icon: IconMail, label: 'Email', value: contact.email, href: `mailto:${contact.email}` }
      : null,
    contact.phone
      ? { icon: IconPhone, label: 'Phone', value: contact.phone, href: `tel:${contact.phone}` }
      : null,
    contact.website
      ? {
          icon: IconWorld,
          label: 'Website',
          value: contact.website,
          href: contact.website.startsWith('http') ? contact.website : `https://${contact.website}`,
        }
      : null,
    contact.linkedinUrl
      ? {
          icon: IconBrandLinkedin,
          label: 'LinkedIn',
          value: contact.linkedinUrl.replace(/^https?:\/\/(www\.)?/, ''),
          href: contact.linkedinUrl,
        }
      : null,
    contact.role ? { icon: IconBriefcase, label: 'Role', value: contact.role } : null,
    contact.company ? { icon: IconBuilding, label: 'Company', value: contact.company } : null,
    contact.location ? { icon: IconMapPin, label: 'Location', value: contact.location } : null,
  ].filter(Boolean) as {
    icon: typeof IconMail
    label: string
    value: string
    href?: string
  }[]

  if (rows.length === 0) {
    return (
      <section className="abc-surface p-5">
        <CardTitle>Contact details</CardTitle>
        <p className="mt-3 text-[13.5px] text-abc-secondary">
          No contact details were captured. Edit the contact to add them.
        </p>
      </section>
    )
  }

  return (
    <section className="abc-surface overflow-hidden">
      <div className="px-5 pb-1 pt-5">
        <CardTitle>Contact details</CardTitle>
      </div>
      <div className="divide-y divide-abc-border px-1 pb-1">
        {rows.map((row) => (
          <FieldRow
            key={row.label}
            icon={row.icon}
            label={row.label}
            value={row.value}
            href={row.href}
          />
        ))}
      </div>
    </section>
  )
}
