'use client'

import { IconArrowDown, IconArrowUp, IconPlus, IconTrash } from '@tabler/icons-react'
import { LINK_ICON_OPTIONS, MAX_CARD_LINKS, type CardLink } from '@/lib/card/types'

/**
 * Extra links shown under the contact actions on the public card.
 * Reordering is explicit up/down rather than drag — it is the only version
 * that works with a thumb on a phone and with a keyboard.
 */
export default function LinksSection({
  links,
  onChange,
}: {
  links: CardLink[]
  onChange: (links: CardLink[]) => void
}) {
  const atLimit = links.length >= MAX_CARD_LINKS

  function add() {
    if (atLimit) return
    onChange([
      ...links,
      {
        id: crypto.randomUUID(),
        user_id: '',
        label: '',
        url: '',
        icon: 'link',
        sort_order: links.length,
        is_active: true,
        click_count: 0,
      },
    ])
  }

  function update(id: string, patch: Partial<CardLink>) {
    onChange(links.map((l) => (l.id === id ? { ...l, ...patch } : l)))
  }

  function remove(id: string) {
    onChange(links.filter((l) => l.id !== id))
  }

  function move(index: number, delta: number) {
    const target = index + delta
    if (target < 0 || target >= links.length) return
    const next = links.slice()
    const [item] = next.splice(index, 1)
    next.splice(target, 0, item)
    onChange(next.map((l, i) => ({ ...l, sort_order: i })))
  }

  return (
    <div className="flex flex-col gap-4">
      {links.length === 0 ? (
        <p className="text-[13px] leading-[1.5] text-abc-muted">
          No extra links yet. Add a deck, a portfolio or a booking page.
        </p>
      ) : null}

      {links.map((link, index) => (
        <div key={link.id} className="rounded-inner border border-abc-border bg-abc-raised p-3.5">
          <div className="flex items-center gap-2">
            <label className="sr-only" htmlFor={`link-type-${link.id}`}>
              Link type
            </label>
            <select
              id={`link-type-${link.id}`}
              value={link.icon}
              onChange={(e) => update(link.id, { icon: e.target.value })}
              className="h-[48px] shrink-0 rounded-inner border border-abc-border bg-abc-card px-2 text-[16px] text-abc-text outline-none focus:border-abc-gold-border"
            >
              {LINK_ICON_OPTIONS.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.emoji} {opt.label}
                </option>
              ))}
            </select>

            <label className="sr-only" htmlFor={`link-label-${link.id}`}>
              Link label
            </label>
            <input
              id={`link-label-${link.id}`}
              value={link.label}
              onChange={(e) => update(link.id, { label: e.target.value })}
              placeholder="Label"
              className="h-[48px] min-w-0 flex-1 rounded-inner border border-abc-border bg-abc-card px-3 text-[16px] text-abc-text outline-none placeholder:text-abc-muted focus:border-abc-gold-border"
            />
          </div>

          <label className="sr-only" htmlFor={`link-url-${link.id}`}>
            Link URL
          </label>
          <input
            id={`link-url-${link.id}`}
            value={link.url}
            onChange={(e) => update(link.id, { url: e.target.value })}
            placeholder="example.com/deck"
            inputMode="url"
            className="mt-2 h-[48px] w-full rounded-inner border border-abc-border bg-abc-card px-3 text-[16px] text-abc-text outline-none placeholder:text-abc-muted focus:border-abc-gold-border"
          />

          <div className="mt-2.5 flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <IconButton
                label={`Move ${link.label || 'link'} up`}
                onClick={() => move(index, -1)}
                disabled={index === 0}
                icon={IconArrowUp}
              />
              <IconButton
                label={`Move ${link.label || 'link'} down`}
                onClick={() => move(index, 1)}
                disabled={index === links.length - 1}
                icon={IconArrowDown}
              />
            </div>

            <button
              type="button"
              onClick={() => remove(link.id)}
              className="inline-flex h-[44px] items-center gap-1.5 rounded-btn px-3 text-[13px] font-medium text-abc-secondary transition-colors hover:text-abc-text abc-focus-ring"
            >
              <IconTrash size={16} stroke={1.8} />
              Remove
            </button>
          </div>
        </div>
      ))}

      <button
        type="button"
        onClick={add}
        disabled={atLimit}
        className="inline-flex h-[48px] items-center justify-center gap-2 rounded-btn border border-abc-border bg-abc-raised px-4 text-[14px] font-medium text-abc-text transition-colors duration-200 ease-abc hover:border-abc-border-strong disabled:opacity-45 abc-focus-ring"
      >
        <IconPlus size={17} stroke={1.9} />
        Add link
      </button>

      {atLimit ? (
        <p className="text-[12px] text-abc-muted">
          That is the maximum of {MAX_CARD_LINKS} links.
        </p>
      ) : null}
    </div>
  )
}

function IconButton({
  label,
  onClick,
  disabled,
  icon: Icon,
}: {
  label: string
  onClick: () => void
  disabled?: boolean
  icon: typeof IconArrowUp
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="flex h-[44px] w-[44px] items-center justify-center rounded-inner border border-abc-border bg-abc-card text-abc-secondary transition-colors hover:text-abc-text disabled:opacity-35 abc-focus-ring"
    >
      <Icon size={16} stroke={1.9} />
    </button>
  )
}
