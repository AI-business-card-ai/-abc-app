'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import {
  IconCalendarEvent,
  IconChevronRight,
  IconDotsVertical,
  IconMapPin,
  IconMessage,
  IconTrash,
} from '@tabler/icons-react'
import Avatar from '@/components/ui/abc/Avatar'
import { EventChip } from '@/components/ui/abc/Bits'
import { dueDateLabel, relativeDay } from '@/lib/format-date'
import type { ContactCardData } from '@/lib/contacts-view'

const FOLLOW_UP_STYLE: Record<string, { label: string; color: string }> = {
  overdue: { label: 'Overdue', color: 'var(--abc-overdue)' },
  today: { label: 'Today', color: 'var(--abc-today)' },
  upcoming: { label: 'Upcoming', color: 'var(--abc-upcoming)' },
}

function FollowUpBadge({ contact }: { contact: ContactCardData }) {
  if (!contact.followUp) return null
  const style = FOLLOW_UP_STYLE[contact.followUp]

  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <span
        className="h-1.5 w-1.5 shrink-0 rounded-full"
        style={{ background: style.color }}
        aria-hidden="true"
      />
      <span className="text-[12px] font-medium" style={{ color: style.color }}>
        {style.label}
      </span>
      {contact.followUp === 'upcoming' ? (
        <span className="text-[12px] text-abc-muted">{dueDateLabel(contact.followUpAt)}</span>
      ) : null}
    </span>
  )
}

export default function ContactRow({
  contact,
  onDelete,
  deleting,
}: {
  contact: ContactCardData
  onDelete: (id: string) => void
  deleting: boolean
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    function onDown(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
        setConfirming(false)
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setMenuOpen(false)
        setConfirming(false)
      }
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [menuOpen])

  const meta = [contact.role, contact.company].filter(Boolean).join(' · ')

  return (
    <li className="relative">
      <Link
        href={`/contacts/${contact.id}`}
        className={`flex gap-3.5 py-4 pl-4 pr-[52px] transition-colors duration-200 ease-abc hover:bg-abc-raised/50 abc-focus-ring sm:gap-4 sm:pl-5 sm:pr-[60px] ${
          deleting ? 'pointer-events-none opacity-40' : ''
        }`}
      >
        <Avatar src={contact.photoUrl} name={contact.name} size={44} />

        <div className="min-w-0 flex-1">
          {/* Identity */}
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-[15px] font-semibold text-abc-text sm:text-[16px]">
                {contact.name}
              </p>
              {meta ? (
                <p className="mt-0.5 truncate text-[13px] text-abc-secondary">{meta}</p>
              ) : null}
            </div>

            {/* Right rail on desktop: follow-up + captured date */}
            <div className="hidden shrink-0 flex-col items-end gap-1 lg:flex">
              <FollowUpBadge contact={contact} />
              {contact.scannedAt ? (
                <span className="whitespace-nowrap text-[11.5px] text-abc-muted">
                  Added {relativeDay(contact.scannedAt)}
                </span>
              ) : null}
            </div>
          </div>

          {/* Relationship context */}
          {contact.event || contact.discussed || contact.nextStep ? (
            <div className="mt-2.5 flex flex-col gap-1.5">
              {contact.event ? (
                <span className="flex items-center gap-1.5">
                  <IconMapPin size={13} stroke={1.8} className="shrink-0 text-abc-muted" />
                  <EventChip>{contact.event}</EventChip>
                </span>
              ) : null}

              {contact.discussed ? (
                <span className="flex items-start gap-1.5">
                  <IconMessage
                    size={13}
                    stroke={1.8}
                    className="mt-[3px] shrink-0 text-abc-muted"
                  />
                  <span className="abc-clamp-2 text-[13px] leading-[1.5] text-abc-secondary">
                    {contact.discussed}
                  </span>
                </span>
              ) : null}

              {contact.nextStep ? (
                <span className="flex items-start gap-1.5">
                  <IconCalendarEvent
                    size={13}
                    stroke={1.8}
                    className="mt-[3px] shrink-0"
                    style={{ color: 'var(--abc-gold-accent)' }}
                  />
                  <span className="abc-clamp-1 text-[13px] leading-[1.5] text-abc-text">
                    {contact.nextStep}
                  </span>
                </span>
              ) : null}
            </div>
          ) : (
            <p className="mt-2 text-[12.5px] text-abc-muted">No meeting context yet</p>
          )}

          {/* Mobile / tablet footer: follow-up, source, captured date */}
          <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 lg:hidden">
            <FollowUpBadge contact={contact} />
            {contact.sourceLabel ? (
              <span className="text-[11.5px] text-abc-muted">{contact.sourceLabel}</span>
            ) : null}
            {contact.scannedAt ? (
              <span className="text-[11.5px] text-abc-muted">
                Added {relativeDay(contact.scannedAt)}
              </span>
            ) : null}
          </div>

          {contact.sourceLabel ? (
            <p className="mt-1.5 hidden text-[11.5px] text-abc-muted lg:block">
              {contact.sourceLabel}
            </p>
          ) : null}
        </div>

        <IconChevronRight
          size={18}
          stroke={1.75}
          className="mt-0.5 hidden shrink-0 self-center text-abc-muted sm:block"
        />
      </Link>

      {/* Overflow menu — sits outside the link so it does not navigate */}
      <div ref={menuRef} className="absolute right-1.5 top-2.5 sm:right-2">
        <button
          type="button"
          onClick={() => {
            setMenuOpen((v) => !v)
            setConfirming(false)
          }}
          aria-label={`Actions for ${contact.name}`}
          aria-expanded={menuOpen}
          disabled={deleting}
          className="flex h-[44px] w-[44px] items-center justify-center rounded-full text-abc-muted transition-colors duration-200 ease-abc hover:bg-abc-raised hover:text-abc-text disabled:opacity-40 abc-focus-ring lg:h-[38px] lg:w-[38px]"
        >
          <IconDotsVertical size={17} stroke={1.8} />
        </button>

        {menuOpen ? (
          <div
            className="absolute right-0 top-10 z-20 w-[190px] overflow-hidden rounded-inner border border-abc-border bg-abc-card p-1 shadow-abc-raised"
            role="menu"
          >
            {confirming ? (
              <>
                <p className="px-2.5 py-2 text-[12.5px] leading-[1.45] text-abc-secondary">
                  Delete this contact and its meeting notes?
                </p>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false)
                    setConfirming(false)
                    onDelete(contact.id)
                  }}
                  className="flex w-full items-center gap-2 rounded-[10px] px-2.5 py-2 text-left text-[13px] font-semibold transition-colors hover:bg-abc-raised abc-focus-ring"
                  style={{ color: 'var(--abc-overdue)' }}
                >
                  <IconTrash size={16} stroke={1.8} />
                  Yes, delete
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => setConfirming(false)}
                  className="flex w-full items-center rounded-[10px] px-2.5 py-2 text-left text-[13px] text-abc-secondary transition-colors hover:bg-abc-raised hover:text-abc-text abc-focus-ring"
                >
                  Cancel
                </button>
              </>
            ) : (
              <button
                type="button"
                role="menuitem"
                onClick={() => setConfirming(true)}
                className="flex w-full items-center gap-2 rounded-[10px] px-2.5 py-2 text-left text-[13px] text-abc-secondary transition-colors hover:bg-abc-raised hover:text-abc-text abc-focus-ring"
              >
                <IconTrash size={16} stroke={1.8} />
                Delete contact
              </button>
            )}
          </div>
        ) : null}
      </div>
    </li>
  )
}
