import Link from 'next/link'
import {
  IconChevronRight,
  IconCreditCard,
  IconId,
  IconMessage2,
  IconPlug,
  IconUser,
} from '@tabler/icons-react'
import Avatar from '@/components/ui/abc/Avatar'
import { SectionLabel } from '@/components/ui/abc/Bits'
import { SETTINGS_SECTIONS, type SettingsSectionId } from '@/lib/settings/sections'

/**
 * The settings hub: five places, and a short answer to "what state am I in".
 *
 * The summary at the top is deliberately inert. Every fact on it — your name,
 * your plan, whether the card is live, what its address is — is owned by one of
 * the five categories below, and showing it here is so that the answer to "is
 * my card live?" does not require opening the editor. Nothing here writes; the
 * only interactive elements on this screen are the five links.
 */

const ICONS: Record<SettingsSectionId, typeof IconUser> = {
  profile: IconUser,
  card: IconId,
  'follow-up': IconMessage2,
  integrations: IconPlug,
  billing: IconCreditCard,
}

export type SettingsSummary = {
  fullName: string
  roleAndCompany: string
  avatarUrl: string | null
  planLabel: string
  cardStatus: string
  publicAddress: string | null
  followUp: string | null
}

export default function SettingsHub({ summary }: { summary: SettingsSummary }) {
  return (
    <div className="mx-auto w-full max-w-[560px] px-4 pb-10 pt-5 sm:px-6 lg:pt-8">
      <SectionLabel>Account</SectionLabel>
      <h1 className="mt-2.5 page-heading font-bold leading-tight tracking-tight text-abc-text">
        Settings
      </h1>
      <p className="mt-2 text-[14px] leading-[1.55] text-abc-secondary">
        Everything about how ABC works for you, in five places.
      </p>

      {/* Summary — informational only. Each fact is edited in its own category. */}
      <section
        aria-label="Account summary"
        className="mt-6 rounded-card border border-abc-border bg-abc-card p-4"
      >
        <div className="flex items-center gap-3.5">
          <Avatar src={summary.avatarUrl} name={summary.fullName} size={52} ring />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[16px] font-semibold text-abc-text">
              {summary.fullName || 'Your name'}
            </p>
            <p className="mt-0.5 truncate text-[13px] text-abc-secondary">
              {summary.roleAndCompany || 'No role or company yet'}
            </p>
          </div>
        </div>

        <dl className="mt-3.5 flex flex-col gap-1.5 border-t border-abc-border pt-3.5 text-[13px]">
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-abc-secondary">Plan</dt>
            <dd className="text-abc-text">{summary.planLabel}</dd>
          </div>
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-abc-secondary">Card</dt>
            <dd className="text-abc-text">{summary.cardStatus}</dd>
          </div>
          <div className="flex items-baseline justify-between gap-3">
            <dt className="shrink-0 text-abc-secondary">Public address</dt>
            <dd className="min-w-0 truncate text-abc-text">
              {summary.publicAddress ?? 'Not set yet'}
            </dd>
          </div>
          {summary.followUp ? (
            <div className="flex items-baseline justify-between gap-3">
              <dt className="shrink-0 text-abc-secondary">Smart Follow-up</dt>
              <dd className="min-w-0 truncate text-abc-text">{summary.followUp}</dd>
            </div>
          ) : null}
        </dl>
      </section>

      <nav aria-label="Settings categories" className="mt-4 flex flex-col gap-3">
        {SETTINGS_SECTIONS.map((section) => {
          const Icon = ICONS[section.id]
          return (
            <Link
              key={section.id}
              href={section.href}
              className="flex items-center gap-3.5 rounded-card border border-abc-border bg-abc-card p-4 transition-colors duration-200 ease-abc hover:border-abc-border-strong abc-focus-ring"
            >
              <Icon size={20} stroke={1.7} style={{ color: 'var(--abc-gold-accent)' }} className="shrink-0" />
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-semibold text-abc-text">{section.title}</span>
                <span className="mt-0.5 block text-[13px] leading-[1.45] text-abc-secondary">
                  {section.description}
                </span>
              </span>
              <IconChevronRight size={19} stroke={1.8} className="shrink-0 text-abc-muted" />
            </Link>
          )
        })}
      </nav>
    </div>
  )
}
