'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  IconAddressBook,
  IconBrandLinkedin,
  IconCalendarEvent,
  IconEye,
  IconLink,
  IconPalette,
  IconPhoto,
  IconPhotoPlus,
  IconTarget,
  IconUser,
  IconWorld,
  IconX,
} from '@tabler/icons-react'
import CardQrModal from '@/components/card/CardQrModal'
import DigitalCardView from '@/components/card/DigitalCardView'
import AppearanceSection from '@/components/card/editor/AppearanceSection'
import CompactCardPreview from '@/components/card/CompactCardPreview'
import ContactSection from '@/components/card/editor/ContactSection'
import EventsSection from '@/components/card/editor/EventsSection'
import IdentitySection from '@/components/card/editor/IdentitySection'
import LinksSection from '@/components/card/editor/LinksSection'
import MediaSection from '@/components/card/editor/MediaSection'
import PublishSection, { type SlugStatus } from '@/components/card/editor/PublishSection'
import SaveBar, { type SaveStatus } from '@/components/card/editor/SaveBar'
import ShowcaseSection from '@/components/card/editor/ShowcaseSection'
import SocialSection from '@/components/card/editor/SocialSection'
import { Chip, Section, TextArea } from '@/components/card/editor/EditorPrimitives'
import StatusBar from '@/components/card/editor/StatusBar'
import Button from '@/components/ui/abc/Button'
import { mapProfileToCardData } from '@/lib/card/public-data'
import {
  buildCoverFramingPayload,
  buildMediaTransformPayload,
  buildSavePayload,
  buildShowcasePayload,
  isMissingColumnError,
  defaultForm,
  formToProfileRow,
  normalizedFormAfterSave,
  profileToForm,
  type EditorForm,
} from '@/lib/card/editor-form'
import { isValidCardSlug, normalizeCardSlug } from '@/lib/card/slug'
import {
  SHOWCASE_MAX_ITEMS,
  normalizeShowcaseRow,
  showcaseItemToRow,
  sortShowcaseItems,
  type ShowcaseItem,
} from '@/lib/card/showcase'
import { isValidIntlPhone } from '@/lib/card/social'
import {
  CARD_PUBLIC_BASE,
  LANGUAGE_OPTIONS,
  LOOKING_FOR_SUGGESTIONS,
  cardEventToRow,
  normalizeCardEventRow,
  type CardEvent,
  type CardLink,
} from '@/lib/card/types'
import { createClientComponent } from '@/lib/supabase'

function snapshotOf(
  form: EditorForm,
  links: CardLink[],
  events: CardEvent[],
  showcase: ShowcaseItem[]
): string {
  return JSON.stringify({ form, links, events, showcase })
}

export default function CardEditorShell() {
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)

  const [form, setForm] = useState<EditorForm>(defaultForm)
  const [links, setLinks] = useState<CardLink[]>([])
  const [events, setEvents] = useState<CardEvent[]>([])

  const [savedAt, setSavedAt] = useState<string>('')
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const [saveError, setSaveError] = useState<string | null>(null)

  const [slugStatus, setSlugStatus] = useState<SlugStatus>('idle')
  const [slugMessage, setSlugMessage] = useState<string | null>(null)

  const [qrOpen, setQrOpen] = useState(false)
  const [fullPreview, setFullPreview] = useState(false)
  const [copied, setCopied] = useState(false)
  const [coverFramingStored, setCoverFramingStored] = useState(true)
  const [heroFramingStored, setHeroFramingStored] = useState(true)
  const [showcaseItems, setShowcaseItems] = useState<ShowcaseItem[]>([])
  const [showcaseStored, setShowcaseStored] = useState(true)

  const [open, setOpen] = useState<Record<string, boolean>>({
    media: true,
    identity: true,
    contact: false,
    social: false,
    showcase: false,
    links: false,
    looking: false,
    events: false,
    appearance: false,
    publish: false,
  })

  const originalLinkIds = useRef<string[]>([])
  const originalEventIds = useRef<string[]>([])
  const originalShowcaseIds = useRef<string[]>([])
  const savingRef = useRef(false)

  /* ── Load ── */
  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const supabase = createClientComponent()
        const {
          data: { user },
        } = await supabase.auth.getUser()

        if (!user) {
          if (!cancelled) {
            setLoadError('You are signed out. Sign in and try again.')
            setLoading(false)
          }
          return
        }

        const [profileRes, linkRes, eventRes, showcaseRes] = await Promise.all([
          supabase.from('abc_profiles').select('*').eq('id', user.id).maybeSingle(),
          supabase
            .from('card_links')
            .select('*')
            .eq('user_id', user.id)
            .order('sort_order', { ascending: true }),
          supabase
            .from('card_events')
            .select('*')
            .eq('user_id', user.id)
            .order('date_from', { ascending: true }),
          // Its own query, and its error is never thrown: an editor that
          // refuses to open because one later migration is missing is a worse
          // failure than a card with no gallery.
          supabase
            .from('card_showcase_items')
            .select('*')
            .eq('user_id', user.id)
            .order('sort_order', { ascending: true }),
        ])

        if (cancelled) return
        if (profileRes.error) throw profileRes.error

        const nextForm = profileToForm((profileRes.data || {}) as Record<string, unknown>)
        const nextLinks = (linkRes.data || []) as CardLink[]
        const nextEvents = (eventRes.data || []).map((row) =>
          normalizeCardEventRow(row as Record<string, unknown>)
        )

        const nextShowcase = sortShowcaseItems(
          (showcaseRes.data || []).map((row) => normalizeShowcaseRow(row as Record<string, unknown>))
        )
        if (showcaseRes.error) {
          console.error('[card-editor] showcase load skipped:', showcaseRes.error.message)
          setShowcaseStored(false)
        }

        originalLinkIds.current = nextLinks.map((l) => l.id)
        originalEventIds.current = nextEvents.map((e) => e.id)
        originalShowcaseIds.current = nextShowcase.map((s) => s.id)

        setUserId(user.id)
        setForm(nextForm)
        setLinks(nextLinks)
        setEvents(nextEvents)
        setShowcaseItems(nextShowcase)
        setSavedAt(snapshotOf(nextForm, nextLinks, nextEvents, nextShowcase))
        setLoading(false)
      } catch (err) {
        console.error('[card-editor] load failed:', err)
        if (!cancelled) {
          setLoadError('Your card could not be loaded. Check your connection and try again.')
          setLoading(false)
        }
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [])

  const patch = useCallback((next: Partial<EditorForm>) => {
    setForm((prev) => ({ ...prev, ...next }))
    setSaveStatus('idle')
  }, [])

  /* ── Slug availability ── */
  useEffect(() => {
    if (loading) return
    const slug = normalizeCardSlug(form.card_slug)

    if (!slug) {
      setSlugStatus('idle')
      setSlugMessage(null)
      return
    }
    if (!isValidCardSlug(slug)) {
      setSlugStatus('bad')
      setSlugMessage('Use 3–40 characters: letters, numbers and dashes.')
      return
    }

    setSlugStatus('checking')
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const res = await fetch(`/api/card/slug-check?slug=${encodeURIComponent(slug)}`)
          const json = (await res.json()) as { available?: boolean }
          if (!res.ok || json.available === false) {
            setSlugStatus('bad')
            setSlugMessage('That address is already taken.')
          } else {
            setSlugStatus('ok')
            setSlugMessage(null)
          }
        } catch (err) {
          console.error('[card-editor] slug check failed:', err)
          setSlugStatus('idle')
          setSlugMessage(null)
        }
      })()
    }, 450)

    return () => window.clearTimeout(timer)
  }, [form.card_slug, loading])

  const dirty = !loading && snapshotOf(form, links, events, showcaseItems) !== savedAt

  /* ── Save ── */
  const save = useCallback(async () => {
    if (savingRef.current || !userId) return

    if (form.phone && !isValidIntlPhone(form.phone)) {
      setSaveStatus('error')
      setSaveError('Phone must be in international format, e.g. +420 601 123 456.')
      return
    }
    if (form.whatsapp && !isValidIntlPhone(form.whatsapp)) {
      setSaveStatus('error')
      setSaveError('WhatsApp must be in international format, e.g. +420 601 123 456.')
      return
    }

    const slug = normalizeCardSlug(form.card_slug)
    if (form.card_published && !isValidCardSlug(slug)) {
      setSaveStatus('error')
      setSaveError('Set a valid card address before publishing.')
      setOpen((o) => ({ ...o, publish: true }))
      return
    }
    if (form.card_published && slugStatus === 'bad') {
      setSaveStatus('error')
      setSaveError('That card address is not available.')
      setOpen((o) => ({ ...o, publish: true }))
      return
    }

    savingRef.current = true
    setSaveStatus('saving')
    setSaveError(null)

    try {
      const supabase = createClientComponent()

      const { error: profileError } = await supabase
        .from('abc_profiles')
        .update(buildSavePayload(form))
        .eq('id', userId)
      if (profileError) throw profileError

      // Cover framing and hero transforms live in later columns, and in
      // separate statements from each other: a database with one migration but
      // not the other must still store the half it can.
      const { error: framingError } = await supabase
        .from('abc_profiles')
        .update(buildCoverFramingPayload(form))
        .eq('id', userId)
      if (framingError && !isMissingColumnError(framingError)) throw framingError
      setCoverFramingStored(!framingError)

      const { error: transformError } = await supabase
        .from('abc_profiles')
        .update(buildMediaTransformPayload(form))
        .eq('id', userId)
      if (transformError && !isMissingColumnError(transformError)) throw transformError
      setHeroFramingStored(!transformError)

      /* Links — delete removed rows, then upsert the rest in display order */
      const keptLinks = new Set(links.map((l) => l.id))
      const removedLinks = originalLinkIds.current.filter((id) => !keptLinks.has(id))
      if (removedLinks.length) {
        const { error } = await supabase.from('card_links').delete().in('id', removedLinks)
        if (error) throw error
      }
      if (links.length) {
        const rows = links.map((l, index) => ({
          id: l.id,
          user_id: userId,
          label: l.label.trim() || 'Link',
          url: l.url.trim(),
          icon: l.icon || 'link',
          sort_order: index,
          is_active: l.is_active,
        }))
        const { error } = await supabase.from('card_links').upsert(rows, { onConflict: 'id' })
        if (error) throw error
      }

      /* Events */
      const keptEvents = new Set(events.map((e) => e.id))
      const removedEvents = originalEventIds.current.filter((id) => !keptEvents.has(id))
      if (removedEvents.length) {
        const { error } = await supabase.from('card_events').delete().in('id', removedEvents)
        if (error) throw error
      }
      if (events.length) {
        const rows = events.map((e) => cardEventToRow(e, userId))
        const { error } = await supabase.from('card_events').upsert(rows, { onConflict: 'id' })
        if (error) throw error
      }

      /*
        Showcase — settings and rows, both quarantined.

        Everything above this point has already been written by the time we get
        here, so a database without the Showcase migration costs the owner the
        gallery and nothing else. The section reports it in place rather than
        failing the save, and sort_order is rewritten from array position so
        the stored order always matches what the editor showed.
      */
      let showcaseOk = true

      const { error: showcaseSettingsError } = await supabase
        .from('abc_profiles')
        .update(buildShowcasePayload(form))
        .eq('id', userId)
      if (showcaseSettingsError) {
        if (!isMissingColumnError(showcaseSettingsError)) throw showcaseSettingsError
        showcaseOk = false
      }

      const keptShowcase = new Set(showcaseItems.map((s) => s.id))
      const removedShowcase = originalShowcaseIds.current.filter((id) => !keptShowcase.has(id))
      if (removedShowcase.length) {
        const { error } = await supabase
          .from('card_showcase_items')
          .delete()
          .in('id', removedShowcase)
        if (error) showcaseOk = false
      }
      if (showcaseItems.length) {
        const rows = showcaseItems
          .slice(0, SHOWCASE_MAX_ITEMS)
          .map((item, index) => showcaseItemToRow(item, userId, index))
        const { error } = await supabase
          .from('card_showcase_items')
          .upsert(rows, { onConflict: 'id' })
        if (error) {
          console.error('[card-editor] showcase save failed:', error.message)
          showcaseOk = false
        }
      }
      setShowcaseStored(showcaseOk)

      // Fold normalized values (https://, canonical social URLs, clean slug)
      // back in, so the form matches what is now stored and stops reading dirty.
      const normalized = { ...form, ...normalizedFormAfterSave(form) }
      const orderedLinks = links.map((l, index) => ({
        ...l,
        user_id: userId,
        sort_order: index,
        label: l.label.trim() || 'Link',
      }))

      const orderedShowcase = showcaseItems
        .slice(0, SHOWCASE_MAX_ITEMS)
        .map((item, index) => ({ ...item, user_id: userId, sort_order: index }))

      originalLinkIds.current = orderedLinks.map((l) => l.id)
      originalEventIds.current = events.map((e) => e.id)
      originalShowcaseIds.current = orderedShowcase.map((s) => s.id)

      setForm(normalized)
      setLinks(orderedLinks)
      setShowcaseItems(orderedShowcase)
      setSavedAt(snapshotOf(normalized, orderedLinks, events, orderedShowcase))
      setSaveStatus('saved')
      // "Saved" is a confirmation, not a resting state — settle back to clean.
      setTimeout(() => setSaveStatus((s) => (s === 'saved' ? 'idle' : s)), 2500)
    } catch (err) {
      console.error('[card-editor] save failed:', err)
      setSaveStatus('error')
      setSaveError('Your changes could not be saved. Check your connection and try again.')
    } finally {
      savingRef.current = false
    }
  }, [events, form, links, showcaseItems, slugStatus, userId])

  // No beforeunload guard: it does not fire on in-app navigation anyway, and
  // the sticky save bar states plainly whether there are unsaved changes.

  const previewCard = useMemo(
    () =>
      mapProfileToCardData(
        formToProfileRow(form, userId || 'preview'),
        links,
        events,
        showcaseItems
      ),
    [events, form, links, showcaseItems, userId]
  )

  const slug = normalizeCardSlug(form.card_slug)
  const publicUrl = slug ? `${CARD_PUBLIC_BASE}/${slug}` : ''

  const copyLink = useCallback(async () => {
    if (!publicUrl) return
    try {
      await navigator.clipboard.writeText(publicUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('[card-editor] copy failed:', err)
    }
  }, [publicUrl])

  function toggle(key: string) {
    setOpen((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  function toggleLanguage(code: string) {
    patch({
      languages: form.languages.includes(code)
        ? form.languages.filter((l) => l !== code)
        : [...form.languages, code],
    })
  }

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-[560px] px-4 py-10 sm:px-6">
        <p className="text-[14px] text-abc-secondary">Loading your card…</p>
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="mx-auto w-full max-w-[560px] px-4 py-10 sm:px-6">
        <div className="rounded-card border border-abc-border bg-abc-card p-6 text-center">
          <p className="text-[15px] font-semibold text-abc-text">Could not load your card</p>
          <p className="mt-1.5 text-[13px] leading-[1.5] text-abc-secondary">{loadError}</p>
          <div className="mt-5">
            <Button onClick={() => window.location.reload()} size="lg">
              Try again
            </Button>
          </div>
        </div>
      </div>
    )
  }

  const preview = (
    <div className="flex flex-col gap-3">
      <CompactCardPreview card={previewCard} />
      <button
        type="button"
        onClick={() => setFullPreview(true)}
        className="inline-flex h-[48px] w-full items-center justify-center gap-2 rounded-btn border border-abc-border bg-abc-raised text-[14px] font-medium text-abc-text transition-colors duration-200 ease-abc hover:border-abc-border-strong abc-focus-ring"
      >
        <IconEye size={17} stroke={1.8} />
        Preview full card
      </button>
    </div>
  )

  return (
    <div className="mx-auto w-full max-w-[1180px] px-4 pb-6 pt-5 sm:px-6 lg:px-8 lg:pt-8">
      <header className="lg:max-w-[640px]">
        <h1 className="text-[26px] font-bold leading-tight tracking-tight text-abc-text sm:text-[30px]">
          Edit my card
        </h1>
        <p className="mt-2 text-[14px] leading-[1.55] text-abc-secondary">
          Customize what people see when they scan you.
        </p>
      </header>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[1.2fr_0.8fr] lg:items-start lg:gap-8">
        {/* Preview first on mobile, right column on desktop */}
        <div className="lg:order-2 lg:sticky lg:top-6">{preview}</div>

        <div className="flex flex-col gap-3 lg:order-1">
          <StatusBar
            published={form.card_published}
            slug={slug}
            publicUrl={publicUrl}
            copied={copied}
            onCopy={() => void copyLink()}
            onShowQr={() => setQrOpen(true)}
          />

          <Section
            id="media"
            title="Images"
            description="Photo, cover and logo"
            icon={IconPhoto}
            open={open.media}
            onToggle={() => toggle('media')}
          >
            <MediaSection
              photoUrl={form.card_photo_url}
              coverUrl={form.card_cover_url}
              logoUrl={form.company_logo_url}
              coverPosition={form.card_cover_position}
              coverFit={form.card_cover_fit}
              transforms={form.card_media_transforms}
              theme={form.card_theme}
              fullName={form.full_name}
              onChange={patch}
            />
            {!coverFramingStored ? (
              <p className="mt-3 text-[12px] leading-[1.45] text-abc-muted">
                Cover framing could not be stored — your database is missing the
                card_cover_position and card_cover_fit columns. Everything else saved.
              </p>
            ) : null}
            {!heroFramingStored ? (
              <p className="mt-3 text-[12px] leading-[1.45] text-abc-muted">
                Zoom, position and darkening could not be stored — your database is missing the
                card_media_transforms column. Everything else saved.
              </p>
            ) : null}
          </Section>

          <Section
            id="identity"
            title="Identity"
            description="Name, role and company"
            icon={IconUser}
            open={open.identity}
            onToggle={() => toggle('identity')}
          >
            <IdentitySection form={form} patch={patch} />
          </Section>

          <Section
            id="contact"
            title="Contact"
            description="How people reach you"
            icon={IconAddressBook}
            open={open.contact}
            onToggle={() => toggle('contact')}
          >
            <ContactSection form={form} patch={patch} />

            <fieldset className="mt-6">
              <legend className="text-[12.5px] font-medium text-abc-secondary">Languages</legend>
              <div className="mt-2.5 flex flex-wrap gap-2">
                {LANGUAGE_OPTIONS.map((code) => (
                  <Chip
                    key={code}
                    active={form.languages.includes(code)}
                    onClick={() => toggleLanguage(code)}
                    ariaLabel={`${code}: ${form.languages.includes(code) ? 'shown' : 'hidden'}`}
                  >
                    {code}
                  </Chip>
                ))}
              </div>
            </fieldset>
          </Section>

          <Section
            id="social"
            title="Social"
            description="Profiles shown on your card"
            icon={IconBrandLinkedin}
            open={open.social}
            onToggle={() => toggle('social')}
          >
            <SocialSection form={form} patch={patch} />
          </Section>

          <Section
            id="showcase"
            title="Showcase"
            description="Optional — photos of your work"
            icon={IconPhotoPlus}
            open={open.showcase}
            onToggle={() => toggle('showcase')}
            badge={
              form.showcase_enabled && showcaseItems.length > 0 ? (
                <span className="rounded-full border border-abc-gold-border bg-abc-gold-soft px-2 py-0.5 text-[11px] font-medium text-abc-gold">
                  {showcaseItems.length}
                </span>
              ) : null
            }
          >
            <ShowcaseSection
              enabled={form.showcase_enabled}
              title={form.showcase_title}
              items={showcaseItems}
              userId={userId || ''}
              onToggle={(showcase_enabled) => patch({ showcase_enabled })}
              onTitle={(showcase_title) => patch({ showcase_title })}
              onItems={(next) => {
                setShowcaseItems(next)
                setSaveStatus('idle')
              }}
            />
            {!showcaseStored ? (
              <p className="mt-3 text-[12px] leading-[1.45] text-abc-muted">
                Showcase could not be saved — your database is missing the Showcase
                migration. Everything else on your card saved normally.
              </p>
            ) : null}
          </Section>

          <Section
            id="links"
            title="Custom links"
            description="Decks, portfolios, booking pages"
            icon={IconLink}
            open={open.links}
            onToggle={() => toggle('links')}
          >
            <LinksSection links={links} onChange={setLinks} />
          </Section>

          <Section
            id="looking"
            title="Looking for"
            description="Optional — useful at events"
            icon={IconTarget}
            open={open.looking}
            onToggle={() => toggle('looking')}
          >
            <TextArea
              label="What you are looking for"
              value={form.looking_for}
              onChange={(looking_for) => patch({ looking_for })}
              placeholder="Distributors in the DACH region, and a technical co-founder."
              maxLength={200}
              rows={2}
            />
            <div className="mt-3 flex flex-wrap gap-2">
              {LOOKING_FOR_SUGGESTIONS.map((suggestion) => (
                <Chip
                  key={suggestion}
                  onClick={() => {
                    const current = form.looking_for.trim()
                    if (current.toLowerCase().includes(suggestion.toLowerCase())) return
                    patch({
                      looking_for: (current ? `${current}, ${suggestion}` : suggestion).slice(0, 200),
                    })
                  }}
                  ariaLabel={`Add ${suggestion}`}
                >
                  + {suggestion}
                </Chip>
              ))}
            </div>
          </Section>

          <Section
            id="events"
            title="Where to find me"
            description="Fairs and conferences you attend"
            icon={IconCalendarEvent}
            open={open.events}
            onToggle={() => toggle('events')}
          >
            <EventsSection events={events} onChange={setEvents} />
          </Section>

          <Section
            id="appearance"
            title="Appearance"
            description="Accent and card theme"
            icon={IconPalette}
            open={open.appearance}
            onToggle={() => toggle('appearance')}
          >
            <AppearanceSection form={form} patch={patch} />
          </Section>

          <Section
            id="publish"
            title="Publish"
            description="Your card address and visibility"
            icon={IconWorld}
            open={open.publish}
            onToggle={() => toggle('publish')}
          >
            <PublishSection
              form={form}
              patch={patch}
              slugStatus={slugStatus}
              slugMessage={slugMessage}
            />
          </Section>

          <SaveBar dirty={dirty} status={saveStatus} error={saveError} onSave={() => void save()} />
        </div>
      </div>

      {slug ? (
        <CardQrModal
          slug={slug}
          open={qrOpen}
          onClose={() => setQrOpen(false)}
          name={form.full_name}
          company={form.company_name}
        />
      ) : null}

      {fullPreview ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Full card preview"
          className="fixed inset-0 z-[200] overflow-y-auto"
          style={{ background: 'rgba(4,4,5,0.92)' }}
        >
          <div
            className="sticky top-0 z-10 flex items-center justify-between border-b border-abc-border bg-abc-bg/95 px-4 py-3 backdrop-blur-xl"
            style={{ paddingTop: 'calc(0.75rem + env(safe-area-inset-top))' }}
          >
            <p className="text-[13px] font-medium text-abc-secondary">
              Preview {form.card_published ? '' : '— not published yet'}
            </p>
            <button
              type="button"
              onClick={() => setFullPreview(false)}
              aria-label="Close preview"
              className="flex h-[44px] w-[44px] items-center justify-center rounded-full text-abc-secondary transition-colors hover:text-abc-text abc-focus-ring"
            >
              <IconX size={20} stroke={1.8} />
            </button>
          </div>
          <DigitalCardView card={previewCard} preview />
        </div>
      ) : null}
    </div>
  )
}
