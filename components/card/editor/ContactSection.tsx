'use client'

import { Field, Toggle } from '@/components/card/editor/EditorPrimitives'
import { isValidIntlPhone } from '@/lib/card/social'
import type { EditorForm } from '@/lib/card/editor-form'

type Row = {
  key: string
  label: string
  valueKey: keyof EditorForm
  toggleKey: keyof EditorForm
  placeholder: string
  type?: string
  inputMode?: 'text' | 'tel' | 'email' | 'url'
  hint?: string
  validate?: (value: string) => string | null
}

const PHONE_HINT = 'Use the international format, e.g. +420 601 123 456.'

const ROWS: Row[] = [
  {
    key: 'phone',
    label: 'Phone',
    valueKey: 'phone',
    toggleKey: 'show_phone',
    placeholder: '+420 601 123 456',
    type: 'tel',
    inputMode: 'tel',
    validate: (v) => (v && !isValidIntlPhone(v) ? PHONE_HINT : null),
  },
  {
    key: 'whatsapp',
    label: 'WhatsApp',
    valueKey: 'whatsapp',
    toggleKey: 'show_whatsapp',
    placeholder: '+420 601 123 456',
    type: 'tel',
    inputMode: 'tel',
    validate: (v) => (v && !isValidIntlPhone(v) ? PHONE_HINT : null),
  },
  {
    key: 'email',
    label: 'Email',
    valueKey: 'public_email',
    toggleKey: 'show_email',
    placeholder: 'you@company.com',
    type: 'email',
    inputMode: 'email',
  },
  {
    key: 'website',
    label: 'Website',
    valueKey: 'website',
    toggleKey: 'show_website',
    placeholder: 'company.com',
    inputMode: 'url',
  },
  {
    key: 'calendar',
    label: 'Calendar',
    valueKey: 'calendar_url',
    toggleKey: 'show_calendar',
    placeholder: 'cal.com/you',
    inputMode: 'url',
    hint: 'A booking link, so people can grab a slot straight from your card.',
  },
  {
    key: 'location',
    label: 'Location',
    valueKey: 'location',
    toggleKey: 'show_location',
    placeholder: 'Prague, Czechia',
  },
]

export default function ContactSection({
  form,
  patch,
}: {
  form: EditorForm
  patch: (patch: Partial<EditorForm>) => void
}) {
  return (
    <div className="flex flex-col gap-5">
      {ROWS.map((row) => {
        const value = String(form[row.valueKey] ?? '')
        const shown = Boolean(form[row.toggleKey])
        const error = row.validate ? row.validate(value) : null

        return (
          <div key={row.key}>
            <Field
              label={row.label}
              value={value}
              onChange={(next) => patch({ [row.valueKey]: next } as Partial<EditorForm>)}
              placeholder={row.placeholder}
              type={row.type}
              inputMode={row.inputMode}
              hint={row.hint}
              error={error}
            />
            <div className="mt-2 flex items-center justify-between gap-3">
              <span className="text-[12px] text-abc-muted">
                {value ? 'On your public card' : 'Add a value to show this'}
              </span>
              <Toggle
                label={row.label}
                checked={shown}
                onChange={(next) => patch({ [row.toggleKey]: next } as Partial<EditorForm>)}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}
