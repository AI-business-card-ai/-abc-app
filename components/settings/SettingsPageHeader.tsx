import Link from 'next/link'
import { IconChevronLeft } from '@tabler/icons-react'
import { SETTINGS_HUB_PATH } from '@/lib/settings/sections'

/**
 * The top of every settings subsection: a way back to the hub, the category
 * name, and the same one-line description the hub card carried.
 *
 * Shared so that arriving at a subsection and arriving at its card in the hub
 * describe the same place in the same words.
 */
export default function SettingsPageHeader({
  title,
  description,
}: {
  title: string
  description: string
}) {
  return (
    <header>
      <Link
        href={SETTINGS_HUB_PATH}
        className="-ml-1 inline-flex items-center gap-1 rounded-btn py-1 pl-1 pr-2 text-[13px] text-abc-secondary transition-colors hover:text-abc-text abc-focus-ring"
      >
        <IconChevronLeft size={16} stroke={1.9} />
        Settings
      </Link>

      <h1 className="mt-2 text-[26px] font-bold leading-tight tracking-tight text-abc-text sm:text-[30px]">
        {title}
      </h1>
      <p className="mt-2 text-[14px] leading-[1.55] text-abc-secondary">{description}</p>
    </header>
  )
}
