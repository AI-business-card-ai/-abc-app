'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { IconArrowLeft } from '@tabler/icons-react'
import Button from '@/components/ui/abc/Button'
import { SectionLabel } from '@/components/ui/abc/Bits'
import ProductBrainCard from '@/components/event-intelligence/ProductBrainCard'
import type { BrainSummary } from '@/lib/event-intelligence/product-brain'
import type { CompanyIntentProfile, EventObjective, IntelEvent } from '@/lib/event-intelligence/types'

/**
 * Four questions, then as much detail as somebody feels like giving.
 *
 * The optional half stays collapsed. A first-time owner should be able to reach
 * their matches by answering what their company does and what they sell; the
 * rest sharpens the result and none of it is required to get one. This is the
 * difference between a product and a CRM onboarding form.
 *
 * Lists are typed as prose — one per line, or comma-separated — because asking
 * somebody to press a "+ Add" button eleven times on a phone is a worse
 * experience than letting them paste the list they already have.
 */

type Props = {
  event: IntelEvent
  profile: CompanyIntentProfile | null
  objective: EventObjective | null
  /** How ABC understands the business. Absent, the card is not shown. */
  brain?: { summary: BrainSummary; website: string | null }
}

const lines = (values: string[] | undefined) => (values ?? []).join('\n')

function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <label className="block">
      <span className="block text-[13px] font-semibold text-abc-text">{label}</span>
      {hint ? <span className="mt-0.5 block text-[12px] leading-[1.5] text-abc-muted">{hint}</span> : null}
      <span className="mt-2 block">{children}</span>
    </label>
  )
}

export default function SetupView({ event, profile, objective, brain }: Props) {
  const router = useRouter()

  const [companyName, setCompanyName] = useState(profile?.companyName ?? '')
  const [whatWeDo, setWhatWeDo] = useState(profile?.whatWeDo ?? '')
  const [whatWeSell, setWhatWeSell] = useState(lines(profile?.whatWeSell))
  const [whatWeBuy, setWhatWeBuy] = useState(lines(profile?.whatWeBuy))
  const [whoWeWantToMeet, setWhoWeWantToMeet] = useState(profile?.whoWeWantToMeet ?? '')

  const [showMore, setShowMore] = useState(false)
  const [targetIndustries, setTargetIndustries] = useState(lines(profile?.targetIndustries))
  const [targetCompanyTypes, setTargetCompanyTypes] = useState(lines(profile?.targetCompanyTypes))
  const [capabilities, setCapabilities] = useState(lines(profile?.capabilities))
  const [technologies, setTechnologies] = useState(lines(profile?.technologies))
  const [materials, setMaterials] = useState(lines(profile?.materials))
  const [certifications, setCertifications] = useState(lines(profile?.certifications))
  const [geographies, setGeographies] = useState(lines(profile?.geographies))

  const [goals, setGoals] = useState(objective?.goals ?? '')
  const [sellFocus, setSellFocus] = useState(lines(objective?.sellFocus))
  const [buyFocus, setBuyFocus] = useState(lines(objective?.buyFocus))
  const [partnerFocus, setPartnerFocus] = useState(lines(objective?.partnerFocus))

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    setSaving(true)
    setError(null)

    try {
      const profileResponse = await fetch('/api/event-intelligence/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyName,
          whatWeDo,
          whatWeSell,
          whatWeBuy,
          whoWeWantToMeet,
          targetIndustries,
          targetCompanyTypes,
          capabilities,
          technologies,
          materials,
          certifications,
          geographies,
        }),
      })

      const profileBody = await profileResponse.json().catch(() => null)
      if (!profileResponse.ok) {
        setError(profileBody?.error || 'Your company details could not be saved.')
        setSaving(false)
        return
      }

      const objectiveResponse = await fetch('/api/event-intelligence/objective', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventKey: event.eventKey,
          goals,
          sellFocus,
          buyFocus,
          partnerFocus,
        }),
      })

      const objectiveBody = await objectiveResponse.json().catch(() => null)
      if (!objectiveResponse.ok) {
        setError(objectiveBody?.error || 'Your goals for this event could not be saved.')
        setSaving(false)
        return
      }

      router.push(`/events/intelligence/${event.eventKey}`)
      router.refresh()
    } catch {
      setError('Nothing could be saved — check your connection and try again.')
      setSaving(false)
    }
  }

  const textarea = 'abc-input w-full px-3 py-2.5 text-[14px] leading-[1.55]'
  const input = 'abc-input w-full px-3 py-2.5 text-[14px]'

  return (
    <div className="mx-auto w-full max-w-[720px] abc-page-top px-4 pb-16 sm:px-6 lg:px-8">
      <Link
        href={`/events/intelligence/${event.eventKey}`}
        className="-my-3 inline-flex min-h-[44px] items-center gap-1.5 text-[13px] text-abc-secondary transition-colors hover:text-abc-text abc-focus-ring"
      >
        <IconArrowLeft size={16} stroke={1.8} aria-hidden="true" />
        {event.name}
      </Link>

      <header className="mt-4">
        <SectionLabel>Event Intelligence</SectionLabel>
        <h1 className="mt-2 text-[26px] font-bold leading-tight tracking-tight text-abc-text lg:text-[32px]">
          Tell ABC what you are looking for
        </h1>
        <p className="mt-1.5 text-[14px] leading-[1.6] text-abc-secondary">
          Two things decide which exhibitors are worth your time: what your company does, and what
          you want from this fair.
        </p>
      </header>

      {brain ? <ProductBrainCard summary={brain.summary} website={brain.website} /> : null}

      <section className={`abc-surface ${brain ? 'mt-4' : 'mt-6'} flex flex-col gap-5 p-4 sm:p-5`}>
        <SectionLabel>Your company</SectionLabel>

        <Field label="Company name">
          <input
            className={input}
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            placeholder="Nordfeld Precision"
            autoComplete="organization"
          />
        </Field>

        <Field label="What we do" hint="One or two sentences, in your own words.">
          <textarea
            className={textarea}
            rows={3}
            value={whatWeDo}
            onChange={(e) => setWhatWeDo(e.target.value)}
            placeholder="We manufacture precision CNC-machined aluminium parts."
          />
        </Field>

        <Field label="What we sell" hint="One per line.">
          <textarea
            className={textarea}
            rows={3}
            value={whatWeSell}
            onChange={(e) => setWhatWeSell(e.target.value)}
            placeholder={'CNC aluminium components\nMachined housings\nPrototype production'}
          />
        </Field>

        <Field label="What we need or buy" hint="One per line. Leave empty if you are only selling.">
          <textarea
            className={textarea}
            rows={2}
            value={whatWeBuy}
            onChange={(e) => setWhatWeBuy(e.target.value)}
            placeholder={'Special bearings\nSurface coating'}
          />
        </Field>

        <Field label="Who we want to meet" hint="The kind of company, not a name.">
          <textarea
            className={textarea}
            rows={2}
            value={whoWeWantToMeet}
            onChange={(e) => setWhoWeWantToMeet(e.target.value)}
            placeholder="Manufacturers of industrial robots, electric motors and automation systems."
          />
        </Field>

        <div>
          <button
            type="button"
            onClick={() => setShowMore((open) => !open)}
            className="touch-target inline-flex items-center text-[13px] font-medium text-abc-secondary transition-colors hover:text-abc-text abc-focus-ring"
          >
            {showMore ? 'Hide extra detail' : 'Add more detail (optional)'}
          </button>

          {showMore ? (
            <div className="mt-4 flex flex-col gap-5">
              <Field label="Target industries" hint="One per line.">
                <textarea className={textarea} rows={2} value={targetIndustries} onChange={(e) => setTargetIndustries(e.target.value)} />
              </Field>
              <Field label="Target company types" hint="Machine builders, integrators, OEMs…">
                <textarea className={textarea} rows={2} value={targetCompanyTypes} onChange={(e) => setTargetCompanyTypes(e.target.value)} />
              </Field>
              <Field label="Capabilities" hint="What you can actually make or do.">
                <textarea className={textarea} rows={2} value={capabilities} onChange={(e) => setCapabilities(e.target.value)} />
              </Field>
              <Field label="Technologies">
                <textarea className={textarea} rows={2} value={technologies} onChange={(e) => setTechnologies(e.target.value)} />
              </Field>
              <Field label="Materials">
                <textarea className={textarea} rows={2} value={materials} onChange={(e) => setMaterials(e.target.value)} />
              </Field>
              <Field label="Certifications">
                <textarea className={textarea} rows={2} value={certifications} onChange={(e) => setCertifications(e.target.value)} />
              </Field>
              <Field label="Countries you care about" hint="Two-letter codes or names, one per line.">
                <textarea className={textarea} rows={2} value={geographies} onChange={(e) => setGeographies(e.target.value)} />
              </Field>
            </div>
          ) : null}
        </div>
      </section>

      <section className="abc-surface mt-4 flex flex-col gap-5 p-4 sm:p-5">
        <div>
          <SectionLabel>At this event</SectionLabel>
          <p className="mt-1.5 text-[12.5px] leading-[1.55] text-abc-muted">
            Optional. Leave it empty and ABC uses your general profile for {event.name}.
          </p>
        </div>

        <Field label="What you want from this fair">
          <textarea
            className={textarea}
            rows={2}
            value={goals}
            onChange={(e) => setGoals(e.target.value)}
            placeholder="Find three serial-production customers in robotics."
          />
        </Field>

        <Field label="What to sell here" hint="One per line.">
          <textarea className={textarea} rows={2} value={sellFocus} onChange={(e) => setSellFocus(e.target.value)} />
        </Field>

        <Field label="What to source here" hint="One per line.">
          <textarea className={textarea} rows={2} value={buyFocus} onChange={(e) => setBuyFocus(e.target.value)} />
        </Field>

        <Field label="Partnerships to explore" hint="One per line.">
          <textarea className={textarea} rows={2} value={partnerFocus} onChange={(e) => setPartnerFocus(e.target.value)} />
        </Field>
      </section>

      {error ? (
        <p className="mt-4 text-[13px] leading-[1.55]" style={{ color: 'var(--abc-overdue)' }} role="alert">
          {error}
        </p>
      ) : null}

      <div className="mt-5">
        <Button onClick={save} disabled={saving} size="lg" fullWidth>
          {saving ? 'Saving…' : 'Save and see matches'}
        </Button>
      </div>
    </div>
  )
}
