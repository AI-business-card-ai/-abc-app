'use client'

import { Field, FieldRow, TextArea } from '@/components/card/editor/EditorPrimitives'
import type { EditorForm } from '@/lib/card/editor-form'

export default function IdentitySection({
  form,
  patch,
}: {
  form: EditorForm
  patch: (patch: Partial<EditorForm>) => void
}) {
  return (
    <FieldRow>
      <Field
        label="Name"
        value={form.full_name}
        onChange={(full_name) => patch({ full_name })}
        placeholder="Jane Doe"
        autoComplete="name"
      />
      <Field
        label="Job title"
        value={form.job_title}
        onChange={(job_title) => patch({ job_title })}
        placeholder="CEO & Founder"
        autoComplete="organization-title"
      />
      <Field
        label="Company"
        value={form.company_name}
        onChange={(company_name) => patch({ company_name })}
        placeholder="Acme"
        autoComplete="organization"
      />
      <Field
        label="Tagline"
        value={form.card_tagline}
        onChange={(card_tagline) => patch({ card_tagline })}
        placeholder="One line people remember you by"
        maxLength={80}
        hint="Shown under your name on the public card."
      />
      <TextArea
        label="About"
        value={form.what_i_do}
        onChange={(what_i_do) => patch({ what_i_do })}
        placeholder="What you do, in a sentence or two."
        maxLength={300}
        rows={3}
      />
    </FieldRow>
  )
}
