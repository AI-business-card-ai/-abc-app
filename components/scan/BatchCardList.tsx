'use client'

import { useState } from 'react'
import {
  IconAlertTriangle,
  IconBriefcase,
  IconBuilding,
  IconBrandLinkedin,
  IconCheck,
  IconChevronDown,
  IconTrash,
  IconMail,
  IconPhone,
  IconUser,
  IconWorld,
} from '@tabler/icons-react'
import type { TablerIcon } from '@tabler/icons-react'
import { SectionLabel } from '@/components/ui/abc/Bits'
import type { ContactCandidate } from '@/lib/scan/candidate'
import {
  batchItemIsSaveable,
  isActiveBatchItem,
  warningLabel,
  type BatchItem,
} from '@/lib/scan/batch'

/**
 * The detected cards, as a list the owner can work down.
 *
 * A row is closed by default and shows only what identifies the person, because
 * the common case is that the read was correct and the owner is scanning the
 * list rather than reading it. Opening a row reveals the same eight fields the
 * single-card review edits — not a reduced set, because a card that needs
 * fixing usually needs the field that was missed, and sending the owner
 * elsewhere to fix it would defeat the batch.
 */

const FIELDS: { key: keyof ContactCandidate; label: string; icon: TablerIcon; type?: string }[] = [
  { key: 'first_name', label: 'First name', icon: IconUser },
  { key: 'last_name', label: 'Last name', icon: IconUser },
  { key: 'company', label: 'Company', icon: IconBuilding },
  { key: 'role', label: 'Role', icon: IconBriefcase },
  { key: 'email', label: 'Email', icon: IconMail, type: 'email' },
  { key: 'phone', label: 'Phone', icon: IconPhone, type: 'tel' },
  { key: 'website', label: 'Website', icon: IconWorld, type: 'url' },
  { key: 'linkedin_url', label: 'LinkedIn', icon: IconBrandLinkedin, type: 'url' },
]

export default function BatchCardList({
  items,
  onFieldsChange,
  onSelectedChange,
  onLinkChange,
  disabled = false,
}: {
  items: BatchItem[]
  onFieldsChange: (itemId: string, fields: ContactCandidate) => void
  /**
   * The mechanism behind "Remove card". Removing sets `selected` to false,
   * which the save path already skips — so a removed card creates no contact,
   * no encounter, costs no credit and never reaches the CRM, without a second
   * way of saying so.
   */
  onSelectedChange: (itemId: string, selected: boolean) => void
  /** Keep this card as its own person instead of adding to the matched one. */
  onLinkChange: (itemId: string, linkToExisting: boolean) => void
  disabled?: boolean
}) {
  const [openId, setOpenId] = useState<string | null>(null)
  const active = items.filter(isActiveBatchItem)

  return (
    <section className="abc-surface p-4 sm:p-5">
      <div className="flex items-baseline justify-between gap-3">
        <SectionLabel>Cards found</SectionLabel>
        <span className="text-[12.5px] text-abc-muted" aria-live="polite">
          {active.length} {active.length === 1 ? 'card' : 'cards'}
        </span>
      </div>

      {active.length === 0 ? (
        <p className="mt-3 rounded-inner border border-dashed border-abc-border px-4 py-6 text-center text-[13.5px] text-abc-secondary">
          No cards selected.
        </p>
      ) : (
        <ul className="mt-3 flex flex-col gap-2">
          {active.map((item) => (
            <BatchCardRow
              key={item.id}
              item={item}
              open={openId === item.id}
              onToggleOpen={() => setOpenId(openId === item.id ? null : item.id)}
              onFieldsChange={(fields) => onFieldsChange(item.id, fields)}
              onRemove={() => {
                if (openId === item.id) setOpenId(null)
                onSelectedChange(item.id, false)
              }}
              onLinkChange={(link) => onLinkChange(item.id, link)}
              disabled={disabled}
            />
          ))}
        </ul>
      )}
    </section>
  )
}

function BatchCardRow({
  item,
  open,
  onToggleOpen,
  onFieldsChange,
  onRemove,
  onLinkChange,
  disabled,
}: {
  item: BatchItem
  open: boolean
  onToggleOpen: () => void
  onFieldsChange: (fields: ContactCandidate) => void
  onRemove: () => void
  onLinkChange: (linkToExisting: boolean) => void
  disabled: boolean
}) {
  const { fields } = item
  const matched = Boolean(item.linkContactId)
  const linking = matched && item.linkToExisting
  const name = [fields.first_name, fields.last_name].filter(Boolean).join(' ')
  const saved = Boolean(item.createdContactId)
  const saveable = batchItemIsSaveable(item)
  const contactLine = [fields.email, fields.phone].filter(Boolean).join(' · ')
  const label = name || fields.company || 'Unreadable card'

  /*
    Role and company under the name — and role on its own when there is no
    company, because a card that gave up only a name and a title still has to
    be told apart from its neighbours. When the name is missing, the company is
    already the headline and is not repeated.
  */
  const secondary = [fields.role, name ? fields.company : ''].filter(Boolean).join(' · ')

  /*
    A card that cannot be saved is not silently dropped at save time — it is
    shown as needing a field, here, while the owner is still looking at it.
  */
  const blocking = item.selected && !saveable

  return (
    <li
      data-batch-item={item.id}
      className="rounded-inner border border-abc-border bg-abc-raised transition-colors duration-200 ease-abc"
    >
      <div className="flex items-start gap-2 py-3 pl-3 pr-1.5">
        <button
          type="button"
          onClick={onToggleOpen}
          className="flex min-w-0 flex-1 items-start gap-2 rounded text-left abc-focus-ring"
          aria-expanded={open}
        >
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-2">
              <span className="truncate text-[14.5px] font-semibold text-abc-text">{label}</span>
              {saved ? (
                <span
                  className="inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold"
                  style={{
                    background: 'var(--abc-gold-soft)',
                    color: 'var(--abc-gold-accent)',
                  }}
                >
                  <IconCheck size={11} stroke={2.5} />
                  Saved
                </span>
              ) : null}
            </span>

            {secondary ? (
              <span className="mt-0.5 block truncate text-[12.5px] text-abc-secondary">
                {secondary}
              </span>
            ) : null}

            {contactLine ? (
              <span className="mt-0.5 block truncate text-[12px] text-abc-muted">{contactLine}</span>
            ) : null}

            {item.warnings.length > 0 || blocking ? (
              <span className="mt-1.5 flex flex-wrap gap-1.5">
                {blocking ? <Warning text="Add a name, company or email" /> : null}
                {item.warnings
                  // The duplicate warning is replaced by the choice below, which
                  // says the same thing and does something about it.
                  .filter((warning) => !(matched && warning === 'possible_duplicate'))
                  .map((warning) => (
                    <Warning key={warning} text={warningLabel(warning)} />
                  ))}
              </span>
            ) : null}
          </span>

          <IconChevronDown
            size={16}
            stroke={2}
            aria-hidden="true"
            className={`mt-1 shrink-0 text-abc-muted transition-transform duration-200 ${
              open ? 'rotate-180' : ''
            }`}
          />
        </button>

        {/*
          Remove, top-right of the row it removes — so there is no doubt about
          which card goes. Secondary in weight: the data is what the owner is
          reading, and a warning is what they should notice next; removal is
          the choice they make last. A full 44px target, because this is used
          with a thumb at a stand, and a named button rather than a bare icon so
          a screen reader says which card it would remove.

          Not offered on a card that already became a contact: at that point it
          is a person, and deleting a person is the contact screen's decision.
        */}
        {!saved ? (
          <button
            type="button"
            onClick={onRemove}
            disabled={disabled}
            aria-label={`Remove card: ${label}`}
            title="Remove card"
            className="-mt-1 flex h-[44px] w-[44px] shrink-0 items-center justify-center rounded-inner text-abc-muted transition-colors duration-200 ease-abc hover:bg-abc-card hover:text-abc-text abc-focus-ring disabled:opacity-40"
          >
            <IconTrash size={18} stroke={1.8} aria-hidden="true" />
          </button>
        ) : null}
      </div>

      {/*
        Somebody the owner already has.

        A contact is a person and an encounter is a time you met them, so the
        default is to add this meeting to the person rather than make a second
        copy of them. Deterministic identifiers can still be shared — a
        switchboard number, a reused info@ address — so the owner can override
        this one card without that decision leaking to the rest of the batch.
      */}
      {matched && !saved && item.selected ? (
        <div className="border-t border-abc-border px-3 py-2.5">
          <p className="text-[12.5px] leading-[1.5] text-abc-secondary">
            Already in your contacts as{' '}
            <span className="text-abc-text">{item.linkContactName || 'an existing contact'}</span>.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <LinkChoice
              label="Add this meeting"
              active={linking}
              disabled={disabled}
              onClick={() => onLinkChange(true)}
            />
            <LinkChoice
              label="Save as separate contact"
              active={!linking}
              disabled={disabled}
              onClick={() => onLinkChange(false)}
            />
          </div>
        </div>
      ) : null}

      {open ? (
        <div className="border-t border-abc-border p-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {FIELDS.map((field) => (
              <label key={field.key} className="block">
                <span className="mb-1.5 flex items-center gap-1.5 text-[12px] text-abc-muted">
                  <field.icon size={14} stroke={1.8} style={{ color: 'var(--abc-gold-accent)' }} />
                  {field.label}
                </span>
                <input
                  type={field.type || 'text'}
                  value={fields[field.key]}
                  disabled={disabled || saved}
                  onChange={(e) => onFieldsChange({ ...fields, [field.key]: e.target.value })}
                  placeholder="—"
                  className="h-11 w-full rounded-inner border border-abc-border bg-abc-card px-3 text-[16px] text-abc-text outline-none sm:text-[15px] transition-colors duration-200 ease-abc placeholder:text-abc-muted focus:border-abc-gold-accent disabled:opacity-60"
                />
              </label>
            ))}
          </div>

          {saved ? (
            <p className="mt-3 text-[12.5px] text-abc-muted">
              This card is already a contact. Edit it on the contact screen.
            </p>
          ) : null}
        </div>
      ) : null}
    </li>
  )
}

function LinkChoice({
  label,
  active,
  disabled,
  onClick,
}: {
  label: string
  active: boolean
  disabled: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full border px-3 py-1.5 text-[12px] font-medium transition-colors duration-200 ease-abc abc-focus-ring disabled:opacity-60 ${
        active
          ? 'border-transparent text-[#1a1205]'
          : 'border-abc-border bg-abc-card text-abc-secondary hover:border-abc-border-strong hover:text-abc-text'
      }`}
      style={active ? { background: 'var(--abc-gold)' } : undefined}
    >
      {label}
    </button>
  )
}

function Warning({ text }: { text: string }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium"
      style={{ background: 'rgba(234, 179, 8, 0.12)', color: '#e5c07b' }}
    >
      <IconAlertTriangle size={11} stroke={2} />
      {text}
    </span>
  )
}
