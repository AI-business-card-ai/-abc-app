'use client'

import { useId } from 'react'
import {
  IconBrandFacebook,
  IconBrandGithub,
  IconBrandInstagram,
  IconBrandLinkedin,
  IconBrandThreads,
  IconBrandTiktok,
  IconBrandX,
  IconBrandYoutube,
} from '@tabler/icons-react'
import type { TablerIcon } from '@tabler/icons-react'
import { Toggle } from '@/components/card/editor/EditorPrimitives'
import { SOCIAL_FIELD_KEYS, type EditorForm } from '@/lib/card/editor-form'
import type { SocialEnabledMap, SocialNetwork } from '@/lib/card/types'

const NETWORKS: { key: SocialNetwork; label: string; Icon: TablerIcon; placeholder: string }[] = [
  { key: 'linkedin', label: 'LinkedIn', Icon: IconBrandLinkedin, placeholder: 'username or full URL' },
  { key: 'instagram', label: 'Instagram', Icon: IconBrandInstagram, placeholder: 'username' },
  { key: 'x', label: 'X', Icon: IconBrandX, placeholder: 'username' },
  { key: 'facebook', label: 'Facebook', Icon: IconBrandFacebook, placeholder: 'username' },
  { key: 'youtube', label: 'YouTube', Icon: IconBrandYoutube, placeholder: 'channel' },
  { key: 'tiktok', label: 'TikTok', Icon: IconBrandTiktok, placeholder: 'username' },
  { key: 'github', label: 'GitHub', Icon: IconBrandGithub, placeholder: 'username' },
  { key: 'threads', label: 'Threads', Icon: IconBrandThreads, placeholder: 'username' },
]

export default function SocialSection({
  form,
  patch,
}: {
  form: EditorForm
  patch: (patch: Partial<EditorForm>) => void
}) {
  function setEnabled(network: SocialNetwork, enabled: boolean) {
    const next: SocialEnabledMap = { ...form.social_enabled, [network]: enabled }
    patch({ social_enabled: next })
  }

  return (
    <div className="flex flex-col gap-4">
      {NETWORKS.map(({ key, label, Icon, placeholder }) => {
        const fieldKey = SOCIAL_FIELD_KEYS[key]
        const value = String(form[fieldKey] ?? '')
        const enabled = form.social_enabled[key] !== false

        return (
          <SocialRow
            key={key}
            label={label}
            Icon={Icon}
            placeholder={placeholder}
            value={value}
            enabled={enabled}
            onValue={(next) => patch({ [fieldKey]: next } as Partial<EditorForm>)}
            onEnabled={(next) => setEnabled(key, next)}
          />
        )
      })}

      <p className="text-[12px] leading-[1.5] text-abc-muted">
        Paste a full URL or just the username. Networks you leave empty never appear on your card.
      </p>
    </div>
  )
}

function SocialRow({
  label,
  Icon,
  placeholder,
  value,
  enabled,
  onValue,
  onEnabled,
}: {
  label: string
  Icon: TablerIcon
  placeholder: string
  value: string
  enabled: boolean
  onValue: (value: string) => void
  onEnabled: (enabled: boolean) => void
}) {
  const id = useId()

  return (
    <div className="flex items-center gap-2.5">
      <span
        className="flex h-[48px] w-[48px] shrink-0 items-center justify-center rounded-inner border border-abc-border bg-abc-raised"
        aria-hidden="true"
      >
        <Icon size={18} stroke={1.7} className="text-abc-secondary" />
      </span>

      <div className="min-w-0 flex-1">
        <label htmlFor={id} className="sr-only">
          {label}
        </label>
        <input
          id={id}
          type="text"
          value={value}
          onChange={(e) => onValue(e.target.value)}
          placeholder={`${label} — ${placeholder}`}
          className="h-[48px] w-full rounded-inner border border-abc-border bg-abc-raised px-3 text-[16px] text-abc-text outline-none transition-colors duration-200 ease-abc placeholder:text-abc-muted focus:border-abc-gold-border"
        />
      </div>

      {value ? (
        <Toggle label={label} checked={enabled} onChange={onEnabled} onLabel="On" offLabel="Off" />
      ) : null}
    </div>
  )
}
