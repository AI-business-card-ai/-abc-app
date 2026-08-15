'use client'

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties,
  type DragEvent,
  type ReactNode,
} from 'react'
import {
  IconBrandFacebook,
  IconBrandGithub,
  IconBrandInstagram,
  IconBrandLinkedin,
  IconBrandThreads,
  IconBrandTiktok,
  IconBrandX,
  IconBrandYoutube,
  IconCopy,
  IconGripVertical,
  IconPlus,
  IconQrcode,
  IconTrash,
  IconUpload,
} from '@tabler/icons-react'
import DigitalCardView from '@/components/card/DigitalCardView'
import CardQrModal from '@/components/card/CardQrModal'
import { mapProfileToCardData } from '@/lib/card/public-data'
import { uploadCardMedia, type CardMediaKind } from '@/lib/card/media'
import { isValidCardSlug, normalizeCardSlug, slugifyName } from '@/lib/card/slug'
import {
  isValidIntlPhone,
  normalizeSocialUrl,
  normalizeWebsiteUrl,
  SOCIAL_META,
} from '@/lib/card/social'
import { initialsFromName } from '@/lib/card/theme'
import {
  CARD_ACCENTS,
  CARD_ACCENT_DEFAULT,
  CARD_PUBLIC_BASE,
  LANGUAGE_OPTIONS,
  LINK_ICON_OPTIONS,
  LOOKING_FOR_CHIPS,
  MAX_CARD_LINKS,
  PRESET_EVENTS,
  type CardAnalytics,
  type CardEvent,
  type CardLink,
  type CardLinkIcon,
  type CardTheme,
  type SocialEnabledMap,
  type SocialNetwork,
} from '@/lib/card/types'
import { createClientComponent } from '@/lib/supabase'

/* ─── Design tokens ─── */
const T = {
  bg: '#0f0f0f',
  surface: '#1a1a1a',
  surface2: '#242424',
  border: '#2a2a2a',
  text: '#fff',
  secondary: '#999',
  muted: '#555',
  pink: '#f0197d',
  turquoise: '#00d4d4',
  gradient: 'linear-gradient(135deg,#f0197d,#00d4d4)',
  font: 'system-ui, -apple-system, sans-serif',
  radius: 12,
} as const

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

type EditorForm = {
  full_name: string
  job_title: string
  company_name: string
  card_tagline: string
  what_i_do: string
  looking_for: string
  card_photo_url: string
  card_cover_url: string
  company_logo_url: string
  phone: string
  whatsapp: string
  public_email: string
  website: string
  calendar_url: string
  location: string
  languages: string[]
  show_phone: boolean
  show_whatsapp: boolean
  show_email: boolean
  show_website: boolean
  show_calendar: boolean
  show_location: boolean
  linkedin_url: string
  instagram_url: string
  x_url: string
  facebook_url: string
  youtube_url: string
  tiktok_url: string
  github_url: string
  threads_url: string
  social_enabled: SocialEnabledMap
  card_accent: string
  card_theme: CardTheme
  card_slug: string
  card_published: boolean
  card_branding_removed: boolean
  email: string
  avatar_url: string
}

type SlugStatus = 'idle' | 'checking' | 'ok' | 'bad'

const SOCIAL_ICONS: Record<SocialNetwork, typeof IconBrandLinkedin> = {
  linkedin: IconBrandLinkedin,
  instagram: IconBrandInstagram,
  x: IconBrandX,
  facebook: IconBrandFacebook,
  youtube: IconBrandYoutube,
  tiktok: IconBrandTiktok,
  github: IconBrandGithub,
  threads: IconBrandThreads,
}

const SOCIAL_FIELD_KEYS: Record<SocialNetwork, keyof EditorForm> = {
  linkedin: 'linkedin_url',
  instagram: 'instagram_url',
  x: 'x_url',
  facebook: 'facebook_url',
  youtube: 'youtube_url',
  tiktok: 'tiktok_url',
  github: 'github_url',
  threads: 'threads_url',
}

const emptyAnalytics: CardAnalytics = {
  views: 0,
  vcardSaves: 0,
  exchanges: 0,
  linkClicks: 0,
}

const defaultForm = (): EditorForm => ({
  full_name: '',
  job_title: '',
  company_name: '',
  card_tagline: '',
  what_i_do: '',
  looking_for: '',
  card_photo_url: '',
  card_cover_url: '',
  company_logo_url: '',
  phone: '',
  whatsapp: '',
  public_email: '',
  website: '',
  calendar_url: '',
  location: '',
  languages: [],
  show_phone: true,
  show_whatsapp: true,
  show_email: true,
  show_website: true,
  show_calendar: true,
  show_location: true,
  linkedin_url: '',
  instagram_url: '',
  x_url: '',
  facebook_url: '',
  youtube_url: '',
  tiktok_url: '',
  github_url: '',
  threads_url: '',
  social_enabled: {},
  card_accent: CARD_ACCENT_DEFAULT,
  card_theme: 'graphite',
  card_slug: '',
  card_published: false,
  card_branding_removed: false,
  email: '',
  avatar_url: '',
})

function asStr(v: unknown): string {
  return typeof v === 'string' ? v : ''
}

function asBool(v: unknown, fallback: boolean): boolean {
  return typeof v === 'boolean' ? v : fallback
}

function asLangs(v: unknown): string[] {
  if (!Array.isArray(v)) return []
  return v.filter((x): x is string => typeof x === 'string')
}

function asSocialEnabled(v: unknown): SocialEnabledMap {
  if (!v || typeof v !== 'object') return {}
  const out: SocialEnabledMap = {}
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    if (typeof val === 'boolean') out[k as SocialNetwork] = val
  }
  return out
}

function profileToForm(profile: Record<string, unknown>): EditorForm {
  const fullName = asStr(profile.full_name)
  const existingSlug = asStr(profile.card_slug)
  const slug = existingSlug || (fullName ? slugifyName(fullName) : '')

  return {
    full_name: fullName,
    job_title: asStr(profile.job_title) || asStr(profile.role),
    company_name: asStr(profile.company_name) || asStr(profile.company),
    card_tagline: asStr(profile.card_tagline) || asStr(profile.tagline),
    what_i_do: asStr(profile.what_i_do) || asStr(profile.product_description),
    looking_for: asStr(profile.looking_for) || asStr(profile.goals),
    card_photo_url: asStr(profile.card_photo_url) || asStr(profile.avatar_url) || asStr(profile.photo_url),
    card_cover_url: asStr(profile.card_cover_url) || asStr(profile.cover_url),
    company_logo_url: asStr(profile.company_logo_url) || asStr(profile.logo_url),
    phone: asStr(profile.phone),
    whatsapp: asStr(profile.whatsapp) || asStr(profile.whatsapp_number),
    public_email: asStr(profile.public_email) || asStr(profile.email),
    website: asStr(profile.website),
    calendar_url: asStr(profile.calendar_url),
    location: asStr(profile.location),
    languages: asLangs(profile.languages),
    show_phone: asBool(profile.show_phone, true),
    show_whatsapp: asBool(profile.show_whatsapp, true),
    show_email: asBool(profile.show_email, true),
    show_website: asBool(profile.show_website, true),
    show_calendar: asBool(profile.show_calendar, true),
    show_location: asBool(profile.show_location, true),
    linkedin_url: asStr(profile.linkedin_url),
    instagram_url: asStr(profile.instagram_url),
    x_url: asStr(profile.x_url),
    facebook_url: asStr(profile.facebook_url),
    youtube_url: asStr(profile.youtube_url),
    tiktok_url: asStr(profile.tiktok_url),
    github_url: asStr(profile.github_url),
    threads_url: asStr(profile.threads_url),
    social_enabled: asSocialEnabled(profile.social_enabled),
    card_accent: asStr(profile.card_accent) || CARD_ACCENT_DEFAULT,
    card_theme: asStr(profile.card_theme) === 'light' ? 'light' : 'graphite',
    card_slug: slug,
    card_published: asBool(profile.card_published, false),
    card_branding_removed: asBool(profile.card_branding_removed, false),
    email: asStr(profile.email),
    avatar_url: asStr(profile.avatar_url),
  }
}

function formToProfileRow(form: EditorForm, userId: string): Record<string, unknown> {
  return {
    id: userId,
    full_name: form.full_name || null,
    job_title: form.job_title || null,
    role: form.job_title || null,
    company_name: form.company_name || null,
    company: form.company_name || null,
    card_tagline: form.card_tagline || null,
    what_i_do: form.what_i_do || null,
    looking_for: form.looking_for || null,
    card_photo_url: form.card_photo_url || null,
    avatar_url: form.card_photo_url || form.avatar_url || null,
    card_cover_url: form.card_cover_url || null,
    company_logo_url: form.company_logo_url || null,
    phone: form.phone || null,
    whatsapp: form.whatsapp || null,
    public_email: form.public_email || null,
    email: form.email || form.public_email || null,
    website: form.website || null,
    calendar_url: form.calendar_url || null,
    location: form.location || null,
    languages: form.languages,
    show_phone: form.show_phone,
    show_whatsapp: form.show_whatsapp,
    show_email: form.show_email,
    show_website: form.show_website,
    show_calendar: form.show_calendar,
    show_location: form.show_location,
    linkedin_url: form.linkedin_url || null,
    instagram_url: form.instagram_url || null,
    x_url: form.x_url || null,
    facebook_url: form.facebook_url || null,
    youtube_url: form.youtube_url || null,
    tiktok_url: form.tiktok_url || null,
    github_url: form.github_url || null,
    threads_url: form.threads_url || null,
    social_enabled: form.social_enabled,
    card_accent: form.card_accent || CARD_ACCENT_DEFAULT,
    card_theme: form.card_theme,
    card_slug: form.card_slug || null,
    card_published: form.card_published,
    card_branding_removed: form.card_branding_removed,
  }
}

/* ─── Shared UI bits ─── */

function Section({
  title,
  open,
  onToggle,
  children,
}: {
  title: string
  open: boolean
  onToggle: () => void
  children: ReactNode
}) {
  return (
    <div
      style={{
        background: T.surface,
        border: `1px solid ${T.border}`,
        borderRadius: T.radius,
        overflow: 'hidden',
        marginBottom: 12,
      }}
    >
      <button
        type="button"
        onClick={onToggle}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '14px 16px',
          background: 'transparent',
          border: 'none',
          color: T.text,
          fontFamily: T.font,
          fontSize: 13,
          fontWeight: 800,
          letterSpacing: '0.06em',
          cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        <span>{title}</span>
        <span
          style={{
            color: T.secondary,
            transition: 'transform 0.2s ease',
            transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
            display: 'inline-block',
          }}
        >
          ▾
        </span>
      </button>
      <div
        style={{
          maxHeight: open ? 4000 : 0,
          opacity: open ? 1 : 0,
          overflow: 'hidden',
          transition: 'max-height 0.28s ease, opacity 0.2s ease',
        }}
      >
        <div style={{ padding: '0 16px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {children}
        </div>
      </div>
    </div>
  )
}

function Label({ children }: { children: ReactNode }) {
  return (
    <label
      style={{
        display: 'block',
        fontSize: 12,
        fontWeight: 600,
        color: T.secondary,
        marginBottom: 6,
        fontFamily: T.font,
      }}
    >
      {children}
    </label>
  )
}

const inputStyle: CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '10px 12px',
  borderRadius: 10,
  border: `1px solid ${T.border}`,
  background: T.surface2,
  color: T.text,
  fontSize: 14,
  fontFamily: T.font,
  outline: 'none',
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  maxLength,
  type = 'text',
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  maxLength?: number
  type?: string
}) {
  return (
    <div>
      <Label>
        {label}
        {typeof maxLength === 'number' ? (
          <span style={{ float: 'right', fontWeight: 500, color: T.muted }}>
            {value.length}/{maxLength}
          </span>
        ) : null}
      </Label>
      <input
        type={type}
        value={value}
        maxLength={maxLength}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        style={inputStyle}
      />
    </div>
  )
}

function TextArea({
  label,
  value,
  onChange,
  maxLength,
  rows = 3,
  placeholder,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  maxLength?: number
  rows?: number
  placeholder?: string
}) {
  return (
    <div>
      <Label>
        {label}
        {typeof maxLength === 'number' ? (
          <span style={{ float: 'right', fontWeight: 500, color: T.muted }}>
            {value.length}/{maxLength}
          </span>
        ) : null}
      </Label>
      <textarea
        value={value}
        maxLength={maxLength}
        rows={rows}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        style={{ ...inputStyle, resize: 'vertical', minHeight: rows * 22 }}
      />
    </div>
  )
}

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label?: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      style={{
        width: 44,
        height: 26,
        borderRadius: 13,
        border: 'none',
        padding: 2,
        cursor: 'pointer',
        background: checked ? T.turquoise : T.muted,
        transition: 'background 0.2s ease',
        flexShrink: 0,
      }}
    >
      <span
        style={{
          display: 'block',
          width: 22,
          height: 22,
          borderRadius: '50%',
          background: '#fff',
          transform: checked ? 'translateX(18px)' : 'translateX(0)',
          transition: 'transform 0.2s ease',
        }}
      />
    </button>
  )
}

function ContactRow({
  label,
  value,
  onChange,
  show,
  onShowChange,
  placeholder,
  error,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  show: boolean
  onShowChange: (v: boolean) => void
  placeholder?: string
  error?: string | null
}) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <Label>{label}</Label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 11, color: T.muted }}>Zobrazit</span>
          <Toggle checked={show} onChange={onShowChange} label={`Zobrazit ${label}`} />
        </div>
      </div>
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        style={{
          ...inputStyle,
          borderColor: error ? T.pink : T.border,
        }}
      />
      {error ? <p style={{ margin: '4px 0 0', fontSize: 12, color: T.pink }}>{error}</p> : null}
    </div>
  )
}

function Chip({
  active,
  onClick,
  children,
}: {
  active?: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: '6px 12px',
        borderRadius: 8,
        border: `1px solid ${active ? T.turquoise : T.border}`,
        background: active ? 'rgba(0,212,212,0.12)' : T.surface2,
        color: active ? T.turquoise : T.secondary,
        fontSize: 13,
        fontWeight: 600,
        fontFamily: T.font,
        cursor: 'pointer',
        transition: 'border-color 0.15s ease, background 0.15s ease',
      }}
    >
      {children}
    </button>
  )
}

/* ─── Main editor ─── */

export default function CardEditor() {
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [form, setForm] = useState<EditorForm>(defaultForm)
  const [links, setLinks] = useState<CardLink[]>([])
  const [events, setEvents] = useState<CardEvent[]>([])
  const [originalLinkIds, setOriginalLinkIds] = useState<string[]>([])
  const [originalEventIds, setOriginalEventIds] = useState<string[]>([])
  const [analytics, setAnalytics] = useState<CardAnalytics>(emptyAnalytics)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveTick, setSaveTick] = useState(0)
  const [slugStatus, setSlugStatus] = useState<SlugStatus>('idle')
  const [slugReason, setSlugReason] = useState<string | null>(null)
  const [qrOpen, setQrOpen] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(true)
  const [isDesktop, setIsDesktop] = useState(false)
  const [uploading, setUploading] = useState<CardMediaKind | null>(null)
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    identita: true,
    kontakty: true,
    social: false,
    odkazy: false,
    hledam: false,
    eventy: false,
    vzhled: false,
    publikace: true,
  })
  const [dragLinkId, setDragLinkId] = useState<string | null>(null)
  const [linkUpgradeHint, setLinkUpgradeHint] = useState(false)
  const [copied, setCopied] = useState(false)
  const [iconPickerFor, setIconPickerFor] = useState<string | null>(null)

  const photoRef = useRef<HTMLInputElement>(null)
  const coverRef = useRef<HTMLInputElement>(null)
  const logoRef = useRef<HTMLInputElement>(null)
  const savingRef = useRef(false)
  const readyRef = useRef(false)
  const formRef = useRef(form)
  const linksRef = useRef(links)
  const eventsRef = useRef(events)
  const originalLinkIdsRef = useRef(originalLinkIds)
  const originalEventIdsRef = useRef(originalEventIds)
  const userIdRef = useRef(userId)

  formRef.current = form
  linksRef.current = links
  eventsRef.current = events
  originalLinkIdsRef.current = originalLinkIds
  originalEventIdsRef.current = originalEventIds
  userIdRef.current = userId

  const markDirty = useCallback(() => {
    if (!readyRef.current) return
    setSaveTick((n) => n + 1)
    setSaveStatus('idle')
  }, [])

  const patchForm = useCallback(
    (patch: Partial<EditorForm>) => {
      setForm((prev) => ({ ...prev, ...patch }))
      markDirty()
    },
    [markDirty]
  )

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 960px)')
    const apply = () => setIsDesktop(mq.matches)
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [])

  /* Load */
  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setLoadError(null)
      try {
        const supabase = createClientComponent()
        const {
          data: { user },
          error: authError,
        } = await supabase.auth.getUser()
        if (authError) throw authError
        if (!user) {
          if (!cancelled) {
            setLoadError('Nejste přihlášeni. Přihlaste se a zkuste to znovu.')
            setLoading(false)
          }
          return
        }

        const [{ data: profile, error: profileError }, { data: linkRows, error: linksError }, { data: eventRows, error: eventsError }] =
          await Promise.all([
            supabase.from('abc_profiles').select('*').eq('id', user.id).maybeSingle(),
            supabase
              .from('card_links')
              .select('*')
              .eq('user_id', user.id)
              .order('sort_order', { ascending: true }),
            supabase.from('card_events').select('*').eq('user_id', user.id).order('date_from', { ascending: true }),
          ])

        if (profileError) throw profileError
        if (linksError) throw linksError
        if (eventsError) throw eventsError

        const nextForm = profileToForm((profile || { id: user.id, email: user.email }) as Record<string, unknown>)
        if (!nextForm.email && user.email) nextForm.email = user.email
        if (!nextForm.public_email && user.email) nextForm.public_email = user.email

        const nextLinks = ((linkRows || []) as CardLink[]).slice().sort((a, b) => a.sort_order - b.sort_order)
        const nextEvents = (eventRows || []) as CardEvent[]

        if (cancelled) return

        setUserId(user.id)
        setForm(nextForm)
        setLinks(nextLinks)
        setEvents(nextEvents)
        setOriginalLinkIds(nextLinks.map((l) => l.id))
        setOriginalEventIds(nextEvents.map((e) => e.id))
        setLoading(false)

        // Allow dirty tracking after paint
        requestAnimationFrame(() => {
          readyRef.current = true
        })

        // Analytics (non-blocking)
        try {
          const res = await fetch('/api/card/analytics')
          if (res.ok) {
            const json = (await res.json()) as Partial<CardAnalytics>
            if (!cancelled) {
              setAnalytics({
                views: typeof json.views === 'number' ? json.views : 0,
                vcardSaves: typeof json.vcardSaves === 'number' ? json.vcardSaves : 0,
                exchanges: typeof json.exchanges === 'number' ? json.exchanges : 0,
                linkClicks: typeof json.linkClicks === 'number' ? json.linkClicks : 0,
              })
            }
          }
        } catch (err) {
          console.error('[CardEditor] analytics load failed:', err)
        }
      } catch (err) {
        console.error('[CardEditor] load failed:', err)
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : 'Nepodařilo se načíst vizitku.')
          setLoading(false)
        }
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [])

  /* Slug check — 500ms debounce */
  useEffect(() => {
    if (!readyRef.current) return
    const raw = form.card_slug
    const slug = normalizeCardSlug(raw)
    if (!slug || !isValidCardSlug(slug)) {
      setSlugStatus(slug ? 'bad' : 'idle')
      setSlugReason(slug ? 'Slug musí mít 3–40 znaků: a-z, 0-9, pomlčka.' : null)
      return
    }

    setSlugStatus('checking')
    const t = window.setTimeout(() => {
      void (async () => {
        try {
          const res = await fetch(`/api/card/slug-check?slug=${encodeURIComponent(slug)}`)
          const json = (await res.json()) as { available?: boolean; reason?: string | null; slug?: string }
          if (!res.ok || json.available === false) {
            setSlugStatus('bad')
            setSlugReason(json.reason || 'Slug není dostupný.')
          } else {
            setSlugStatus('ok')
            setSlugReason(null)
            if (json.slug && json.slug !== form.card_slug) {
              setForm((prev) => ({ ...prev, card_slug: json.slug || prev.card_slug }))
            }
          }
        } catch (err) {
          console.error('[CardEditor] slug-check failed:', err)
          setSlugStatus('bad')
          setSlugReason('Kontrola slugu selhala.')
        }
      })()
    }, 500)
    return () => window.clearTimeout(t)
  }, [form.card_slug])

  const performSave = useCallback(async (): Promise<boolean> => {
    if (savingRef.current) return false
    const uid = userIdRef.current
    if (!uid) {
      setSaveStatus('error')
      setSaveError('Nejste přihlášeni.')
      return false
    }

    const current = formRef.current
    const currentLinks = linksRef.current
    const currentEvents = eventsRef.current

    if (current.phone && !isValidIntlPhone(current.phone)) {
      setSaveStatus('error')
      setSaveError('Telefon musí být v mezinárodním formátu (+420…).')
      return false
    }
    if (current.whatsapp && !isValidIntlPhone(current.whatsapp)) {
      setSaveStatus('error')
      setSaveError('WhatsApp musí být v mezinárodním formátu (+420…).')
      return false
    }

    const slug = normalizeCardSlug(current.card_slug)
    if (current.card_published && !isValidCardSlug(slug)) {
      setSaveStatus('error')
      setSaveError('Pro publikaci nastavte platný slug (3–40 znaků: a-z, 0-9, pomlčka).')
      return false
    }

    savingRef.current = true
    setSaveStatus('saving')
    setSaveError(null)

    try {
      const supabase = createClientComponent()

      const payload: Record<string, unknown> = {
        full_name: current.full_name.trim() || null,
        job_title: current.job_title.trim() || null,
        role: current.job_title.trim() || null,
        company_name: current.company_name.trim() || null,
        company: current.company_name.trim() || null,
        card_tagline: current.card_tagline.trim().slice(0, 80) || null,
        what_i_do: current.what_i_do.trim().slice(0, 300) || null,
        looking_for: current.looking_for.trim().slice(0, 200) || null,
        card_photo_url: current.card_photo_url || null,
        card_cover_url: current.card_cover_url || null,
        company_logo_url: current.company_logo_url || null,
        phone: current.phone.trim() || null,
        whatsapp: current.whatsapp.trim() || null,
        public_email: current.public_email.trim() || null,
        website: normalizeWebsiteUrl(current.website),
        calendar_url: normalizeWebsiteUrl(current.calendar_url),
        location: current.location.trim() || null,
        languages: current.languages,
        show_phone: current.show_phone,
        show_whatsapp: current.show_whatsapp,
        show_email: current.show_email,
        show_website: current.show_website,
        show_calendar: current.show_calendar,
        show_location: current.show_location,
        linkedin_url: normalizeSocialUrl('linkedin', current.linkedin_url),
        instagram_url: normalizeSocialUrl('instagram', current.instagram_url),
        x_url: normalizeSocialUrl('x', current.x_url),
        facebook_url: normalizeSocialUrl('facebook', current.facebook_url),
        youtube_url: normalizeSocialUrl('youtube', current.youtube_url),
        tiktok_url: normalizeSocialUrl('tiktok', current.tiktok_url),
        github_url: normalizeSocialUrl('github', current.github_url),
        threads_url: normalizeSocialUrl('threads', current.threads_url),
        social_enabled: current.social_enabled,
        card_accent: current.card_accent || CARD_ACCENT_DEFAULT,
        card_theme: current.card_theme,
        card_slug: slug || null,
        card_published: current.card_published,
      }

      if (current.card_photo_url) {
        payload.avatar_url = current.card_photo_url
      }

      const { error: profileError } = await supabase.from('abc_profiles').update(payload).eq('id', uid)
      if (profileError) throw profileError

      // Sync normalized values back into form (without dirty)
      readyRef.current = false
      setForm((prev) => ({
        ...prev,
        card_slug: slug,
        website: typeof payload.website === 'string' ? payload.website : prev.website,
        calendar_url: typeof payload.calendar_url === 'string' ? payload.calendar_url : prev.calendar_url,
        linkedin_url: typeof payload.linkedin_url === 'string' ? payload.linkedin_url : '',
        instagram_url: typeof payload.instagram_url === 'string' ? payload.instagram_url : '',
        x_url: typeof payload.x_url === 'string' ? payload.x_url : '',
        facebook_url: typeof payload.facebook_url === 'string' ? payload.facebook_url : '',
        youtube_url: typeof payload.youtube_url === 'string' ? payload.youtube_url : '',
        tiktok_url: typeof payload.tiktok_url === 'string' ? payload.tiktok_url : '',
        github_url: typeof payload.github_url === 'string' ? payload.github_url : '',
        threads_url: typeof payload.threads_url === 'string' ? payload.threads_url : '',
      }))
      requestAnimationFrame(() => {
        readyRef.current = true
      })

      /* Links */
      const keptLinkIds = new Set(currentLinks.map((l) => l.id))
      const toDeleteLinks = originalLinkIdsRef.current.filter((id) => !keptLinkIds.has(id))
      if (toDeleteLinks.length) {
        const { error } = await supabase.from('card_links').delete().in('id', toDeleteLinks)
        if (error) throw error
      }

      if (currentLinks.length) {
        const rows = currentLinks.map((l, idx) => ({
          id: l.id,
          user_id: uid,
          label: l.label.trim() || 'Odkaz',
          url: normalizeWebsiteUrl(l.url) || l.url,
          icon: l.icon || 'link',
          sort_order: idx,
          is_active: l.is_active,
        }))
        const { error } = await supabase.from('card_links').upsert(rows, { onConflict: 'id' })
        if (error) throw error
        setLinks((prev) =>
          prev.map((l, idx) => ({
            ...l,
            sort_order: idx,
            url: normalizeWebsiteUrl(l.url) || l.url,
          }))
        )
        setOriginalLinkIds(currentLinks.map((l) => l.id))
      } else {
        setOriginalLinkIds([])
      }

      /* Events */
      const keptEventIds = new Set(currentEvents.map((e) => e.id))
      const toDeleteEvents = originalEventIdsRef.current.filter((id) => !keptEventIds.has(id))
      if (toDeleteEvents.length) {
        const { error } = await supabase.from('card_events').delete().in('id', toDeleteEvents)
        if (error) throw error
      }

      if (currentEvents.length) {
        const rows = currentEvents.map((e) => ({
          id: e.id,
          user_id: uid,
          name: e.name.trim() || 'Event',
          city: e.city?.trim() || null,
          date_from: e.date_from || null,
          date_to: e.date_to || null,
          booth: e.booth?.trim() || null,
        }))
        const { error } = await supabase.from('card_events').upsert(rows, { onConflict: 'id' })
        if (error) throw error
        setOriginalEventIds(currentEvents.map((e) => e.id))
      } else {
        setOriginalEventIds([])
      }

      setSaveStatus('saved')
      setSaveError(null)
      return true
    } catch (err) {
      console.error('[CardEditor] save failed:', err)
      const message =
        err && typeof err === 'object' && 'message' in err && typeof (err as { message: unknown }).message === 'string'
          ? (err as { message: string }).message
          : 'Uložení selhalo. Zkuste to znovu.'
      setSaveStatus('error')
      setSaveError(message)
      return false
    } finally {
      savingRef.current = false
    }
  }, [])

  /* Autosave debounce 1s */
  useEffect(() => {
    if (saveTick === 0 || !readyRef.current) return
    const t = window.setTimeout(() => {
      void performSave()
    }, 1000)
    return () => window.clearTimeout(t)
  }, [saveTick, performSave])

  const previewData = useMemo(() => {
    const uid = userId || 'preview'
    const profileRow = formToProfileRow(form, uid)
    return mapProfileToCardData(profileRow, links, events)
  }, [form, links, events, userId])

  const publicUrl = form.card_slug ? `${CARD_PUBLIC_BASE}/${normalizeCardSlug(form.card_slug)}` : ''

  const analyticsAllZero =
    analytics.views === 0 &&
    analytics.vcardSaves === 0 &&
    analytics.exchanges === 0 &&
    analytics.linkClicks === 0

  async function handleUpload(kind: CardMediaKind, file: File | undefined) {
    if (!file || !userId) return
    setUploading(kind)
    try {
      const supabase = createClientComponent()
      const result = await uploadCardMedia(supabase, userId, kind, file)
      if ('error' in result) {
        setSaveStatus('error')
        setSaveError(result.error)
        return
      }
      if (kind === 'photo') patchForm({ card_photo_url: result.url, avatar_url: result.url })
      else if (kind === 'cover') patchForm({ card_cover_url: result.url })
      else patchForm({ company_logo_url: result.url })
    } catch (err) {
      console.error('[CardEditor] upload failed:', err)
      setSaveStatus('error')
      setSaveError('Upload selhal.')
    } finally {
      setUploading(null)
    }
  }

  function onFileChange(kind: CardMediaKind) {
    return (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      void handleUpload(kind, file)
      e.target.value = ''
    }
  }

  function toggleSection(key: string) {
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  function toggleLanguage(code: string) {
    setForm((prev) => {
      const has = prev.languages.includes(code)
      return {
        ...prev,
        languages: has ? prev.languages.filter((l) => l !== code) : [...prev.languages, code],
      }
    })
    markDirty()
  }

  function setSocialValue(network: SocialNetwork, value: string) {
    const field = SOCIAL_FIELD_KEYS[network]
    patchForm({ [field]: value } as Partial<EditorForm>)
  }

  function setSocialEnabled(network: SocialNetwork, enabled: boolean) {
    setForm((prev) => ({
      ...prev,
      social_enabled: { ...prev.social_enabled, [network]: enabled },
    }))
    markDirty()
  }

  function addLink() {
    if (links.length >= MAX_CARD_LINKS) {
      setLinkUpgradeHint(true)
      return
    }
    setLinkUpgradeHint(false)
    const id = crypto.randomUUID()
    setLinks((prev) => [
      ...prev,
      {
        id,
        user_id: userId || '',
        label: '',
        url: '',
        icon: 'link',
        sort_order: prev.length,
        is_active: true,
        click_count: 0,
      },
    ])
    markDirty()
  }

  function updateLink(id: string, patch: Partial<CardLink>) {
    setLinks((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)))
    markDirty()
  }

  function removeLink(id: string) {
    setLinks((prev) => prev.filter((l) => l.id !== id).map((l, i) => ({ ...l, sort_order: i })))
    markDirty()
  }

  function onLinkDragStart(id: string) {
    setDragLinkId(id)
  }

  function onLinkDragOver(e: DragEvent, overId: string) {
    e.preventDefault()
    if (!dragLinkId || dragLinkId === overId) return
    setLinks((prev) => {
      const from = prev.findIndex((l) => l.id === dragLinkId)
      const to = prev.findIndex((l) => l.id === overId)
      if (from < 0 || to < 0 || from === to) return prev
      const next = prev.slice()
      const [item] = next.splice(from, 1)
      next.splice(to, 0, item)
      return next.map((l, i) => ({ ...l, sort_order: i }))
    })
  }

  function onLinkDrop() {
    setDragLinkId(null)
    markDirty()
  }

  function addEvent(name = '') {
    const id = crypto.randomUUID()
    setEvents((prev) => [
      ...prev,
      {
        id,
        user_id: userId || '',
        name,
        city: null,
        date_from: null,
        date_to: null,
        booth: null,
      },
    ])
    markDirty()
  }

  function updateEvent(id: string, patch: Partial<CardEvent>) {
    setEvents((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)))
    markDirty()
  }

  function removeEvent(id: string) {
    setEvents((prev) => prev.filter((e) => e.id !== id))
    markDirty()
  }

  function insertLookingChip(chip: string) {
    setForm((prev) => {
      const current = prev.looking_for.trim()
      if (current.includes(chip)) return prev
      const next = current ? `${current}, ${chip}` : chip
      return { ...prev, looking_for: next.slice(0, 200) }
    })
    markDirty()
  }

  async function copyUrl() {
    if (!publicUrl) return
    try {
      await navigator.clipboard.writeText(publicUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('[CardEditor] copy failed:', err)
    }
  }

  const phoneError =
    form.phone && !isValidIntlPhone(form.phone) ? 'Použijte formát +420…' : null
  const whatsappError =
    form.whatsapp && !isValidIntlPhone(form.whatsapp) ? 'Použijte formát +420…' : null

  const statusLabel =
    saveStatus === 'saving'
      ? 'Ukládám…'
      : saveStatus === 'saved'
        ? 'Uloženo ✓'
        : saveStatus === 'error'
          ? saveError || 'Chyba při ukládání'
          : ''

  if (loading) {
    return (
      <div
        style={{
          minHeight: '100vh',
          background: T.bg,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: T.font,
        }}
      >
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: '50%',
            border: `3px solid ${T.border}`,
            borderTopColor: T.turquoise,
            animation: 'card-spin 0.8s linear infinite',
          }}
        />
        <style>{`@keyframes card-spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    )
  }

  if (loadError) {
    return (
      <div
        style={{
          minHeight: '100vh',
          background: T.bg,
          color: T.text,
          fontFamily: T.font,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
          textAlign: 'center',
        }}
      >
        <div>
          <p style={{ color: T.pink, fontWeight: 700, marginBottom: 8 }}>Nepodařilo se načíst editor</p>
          <p style={{ color: T.secondary, margin: 0 }}>{loadError}</p>
        </div>
      </div>
    )
  }

  const previewBlock = (
    <div style={{ width: '100%' }}>
      <div
        style={{
          width: '100%',
          maxWidth: 320,
          margin: '0 auto',
          borderRadius: 28,
          border: `1px solid ${T.border}`,
          overflow: 'hidden',
          background: T.bg,
          boxShadow: '0 12px 40px rgba(0,0,0,0.45)',
        }}
      >
        <div style={{ maxHeight: 640, overflowY: 'auto', overflowX: 'hidden' }}>
          <DigitalCardView card={previewData} preview />
        </div>
      </div>
    </div>
  )

  return (
    <div
      style={{
        minHeight: '100vh',
        background: T.bg,
        color: T.text,
        fontFamily: T.font,
        paddingBottom: 88,
      }}
    >
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '20px 16px 0' }}>
        <h1 style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 800 }}>Digitální vizitka</h1>
        <p style={{ margin: '0 0 16px', color: T.secondary, fontSize: 14 }}>
          Uprav kartu a sleduj živý náhled vpravo.
        </p>

        {/* Analytics */}
        <div
          style={{
            background: T.surface,
            border: `1px solid ${T.border}`,
            borderRadius: T.radius,
            padding: 14,
            marginBottom: 16,
          }}
        >
          {analyticsAllZero ? (
            <p style={{ margin: 0, fontSize: 13, color: T.secondary, lineHeight: 1.45 }}>
              Sdílej svou kartu QR kódem a sleduj výsledky.
            </p>
          ) : (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
                gap: 10,
              }}
            >
              {(
                [
                  ['Zobrazení', analytics.views],
                  ['Uložené kontakty', analytics.vcardSaves],
                  ['Přijaté vizitky', analytics.exchanges],
                  ['Kliknutí', analytics.linkClicks],
                ] as const
              ).map(([label, value]) => (
                <div key={label} style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 18, fontWeight: 800, color: T.text }}>{value}</div>
                  <div style={{ fontSize: 11, color: T.secondary, marginTop: 2 }}>{label}</div>
                </div>
              ))}
            </div>
          )}
          <div style={{ fontSize: 11, color: T.muted, marginTop: 8 }}>Posledních 30 dní</div>
        </div>

        {/* Mobile preview */}
        {!isDesktop ? (
          <div style={{ marginBottom: 16 }}>
            <button
              type="button"
              onClick={() => setPreviewOpen((v) => !v)}
              style={{
                width: '100%',
                padding: '12px 14px',
                borderRadius: T.radius,
                border: `1px solid ${T.border}`,
                background: T.surface,
                color: T.text,
                fontWeight: 700,
                fontSize: 14,
                fontFamily: T.font,
                cursor: 'pointer',
                display: 'flex',
                justifyContent: 'space-between',
                marginBottom: previewOpen ? 12 : 0,
              }}
            >
              <span>Náhled karty {previewOpen ? '▴' : '▾'}</span>
              <span style={{ color: T.turquoise, fontSize: 12 }}>LIVE</span>
            </button>
            <div
              style={{
                maxHeight: previewOpen ? 720 : 0,
                opacity: previewOpen ? 1 : 0,
                overflow: 'hidden',
                transition: 'max-height 0.3s ease, opacity 0.2s ease',
              }}
            >
              {previewBlock}
            </div>
          </div>
        ) : null}

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: isDesktop ? '1fr 340px' : '1fr',
            gap: 24,
            alignItems: 'start',
          }}
        >
          {/* Editor column */}
          <div>
            {/* 1 IDENTITA */}
            <Section title="IDENTITA" open={!!openSections.identita} onToggle={() => toggleSection('identita')}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                {(
                  [
                    ['photo', 'Foto', form.card_photo_url, photoRef],
                    ['cover', 'Cover', form.card_cover_url, coverRef],
                    ['logo', 'Logo', form.company_logo_url, logoRef],
                  ] as const
                ).map(([kind, label, url, ref]) => (
                  <div key={kind}>
                    <Label>{label}</Label>
                    <button
                      type="button"
                      onClick={() => ref.current?.click()}
                      disabled={uploading === kind}
                      style={{
                        width: '100%',
                        aspectRatio: kind === 'cover' ? '16/9' : '1',
                        borderRadius: 10,
                        border: `1px dashed ${T.border}`,
                        background: T.surface2,
                        color: T.secondary,
                        cursor: 'pointer',
                        overflow: 'hidden',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        position: 'relative',
                        padding: 0,
                      }}
                    >
                      {url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : kind === 'photo' ? (
                        <span
                          style={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            gap: 4,
                            fontSize: 11,
                          }}
                        >
                          <span style={{ fontSize: 18, fontWeight: 800, color: T.text }}>
                            {initialsFromName(form.full_name)}
                          </span>
                          {uploading === kind ? 'Nahrávám…' : 'Nahrát'}
                        </span>
                      ) : (
                        <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, fontSize: 11 }}>
                          <IconUpload size={18} />
                          {uploading === kind ? 'Nahrávám…' : 'Nahrát'}
                        </span>
                      )}
                    </button>
                    <input
                      ref={ref}
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      hidden
                      onChange={onFileChange(kind)}
                    />
                  </div>
                ))}
              </div>

              <Field
                label="Jméno"
                value={form.full_name}
                onChange={(v) => patchForm({ full_name: v })}
                placeholder="Jan Novák"
              />
              <Field
                label="Pozice"
                value={form.job_title}
                onChange={(v) => patchForm({ job_title: v })}
                placeholder="CEO"
              />
              <Field
                label="Firma"
                value={form.company_name}
                onChange={(v) => patchForm({ company_name: v })}
                placeholder="ABC s.r.o."
              />
              <Field
                label="Tagline"
                value={form.card_tagline}
                onChange={(v) => patchForm({ card_tagline: v.slice(0, 80) })}
                maxLength={80}
                placeholder="Pomáhám firmám růst"
              />
              <TextArea
                label="Co dělám"
                value={form.what_i_do}
                onChange={(v) => patchForm({ what_i_do: v.slice(0, 300) })}
                maxLength={300}
                rows={4}
                placeholder="Krátký popis toho, co nabízíš…"
              />
              <div>
                <Label>Jazyky</Label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {LANGUAGE_OPTIONS.map((code) => (
                    <Chip
                      key={code}
                      active={form.languages.includes(code)}
                      onClick={() => toggleLanguage(code)}
                    >
                      {code}
                    </Chip>
                  ))}
                </div>
              </div>
            </Section>

            {/* 2 KONTAKTY */}
            <Section title="KONTAKTY" open={!!openSections.kontakty} onToggle={() => toggleSection('kontakty')}>
              <ContactRow
                label="Telefon"
                value={form.phone}
                onChange={(v) => patchForm({ phone: v })}
                show={form.show_phone}
                onShowChange={(v) => patchForm({ show_phone: v })}
                placeholder="+420…"
                error={phoneError}
              />
              <ContactRow
                label="WhatsApp"
                value={form.whatsapp}
                onChange={(v) => patchForm({ whatsapp: v })}
                show={form.show_whatsapp}
                onShowChange={(v) => patchForm({ show_whatsapp: v })}
                placeholder="+420…"
                error={whatsappError}
              />
              <ContactRow
                label="E-mail"
                value={form.public_email}
                onChange={(v) => patchForm({ public_email: v })}
                show={form.show_email}
                onShowChange={(v) => patchForm({ show_email: v })}
                placeholder="jan@firma.cz"
              />
              <ContactRow
                label="Web"
                value={form.website}
                onChange={(v) => patchForm({ website: v })}
                show={form.show_website}
                onShowChange={(v) => patchForm({ show_website: v })}
                placeholder="https://…"
              />
              <ContactRow
                label="Kalendář"
                value={form.calendar_url}
                onChange={(v) => patchForm({ calendar_url: v })}
                show={form.show_calendar}
                onShowChange={(v) => patchForm({ show_calendar: v })}
                placeholder="https://cal.com/…"
              />
              <ContactRow
                label="Lokace"
                value={form.location}
                onChange={(v) => patchForm({ location: v })}
                show={form.show_location}
                onShowChange={(v) => patchForm({ show_location: v })}
                placeholder="Praha"
              />
            </Section>

            {/* 3 SOCIÁLNÍ SÍTĚ */}
            <Section title="SOCIÁLNÍ SÍTĚ" open={!!openSections.social} onToggle={() => toggleSection('social')}>
              {SOCIAL_META.map((meta) => {
                const Icon = SOCIAL_ICONS[meta.key]
                const field = SOCIAL_FIELD_KEYS[meta.key]
                const value = String(form[field] ?? '')
                const enabled = form.social_enabled[meta.key] !== false
                return (
                  <div
                    key={meta.key}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '28px 1fr auto',
                      gap: 10,
                      alignItems: 'center',
                    }}
                  >
                    <Icon size={22} color={meta.brandColor} />
                    <input
                      type="text"
                      value={value}
                      placeholder={`${meta.label} URL nebo @username`}
                      onChange={(e) => setSocialValue(meta.key, e.target.value)}
                      style={inputStyle}
                    />
                    <Toggle
                      checked={enabled}
                      onChange={(v) => setSocialEnabled(meta.key, v)}
                      label={`${meta.label} zapnuto`}
                    />
                  </div>
                )
              })}
              <p style={{ margin: 0, fontSize: 12, color: T.muted }}>
                Prázdné sítě se na kartě nezobrazí.
              </p>
            </Section>

            {/* 4 VLASTNÍ ODKAZY */}
            <Section title="VLASTNÍ ODKAZY" open={!!openSections.odkazy} onToggle={() => toggleSection('odkazy')}>
              {links.map((link) => (
                <div
                  key={link.id}
                  draggable
                  onDragStart={() => onLinkDragStart(link.id)}
                  onDragOver={(e) => onLinkDragOver(e, link.id)}
                  onDrop={onLinkDrop}
                  onDragEnd={() => {
                    setDragLinkId(null)
                    markDirty()
                  }}
                  style={{
                    background: T.surface2,
                    border: `1px solid ${dragLinkId === link.id ? T.turquoise : T.border}`,
                    borderRadius: 10,
                    padding: 12,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                    opacity: dragLinkId === link.id ? 0.7 : 1,
                    transition: 'border-color 0.15s ease, opacity 0.15s ease',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ color: T.muted, cursor: 'grab', display: 'flex' }} title="Přetáhnout">
                      <IconGripVertical size={18} />
                    </span>
                    <button
                      type="button"
                      onClick={() => setIconPickerFor((cur) => (cur === link.id ? null : link.id))}
                      style={{
                        border: `1px solid ${T.border}`,
                        background: T.bg,
                        borderRadius: 8,
                        padding: '4px 8px',
                        cursor: 'pointer',
                        fontSize: 16,
                      }}
                      title="Ikona"
                    >
                      {LINK_ICON_OPTIONS.find((o) => o.id === link.icon)?.emoji || '🔗'}
                    </button>
                    <input
                      type="text"
                      value={link.label}
                      placeholder="Název"
                      onChange={(e) => updateLink(link.id, { label: e.target.value })}
                      style={{ ...inputStyle, flex: 1 }}
                    />
                    <Toggle
                      checked={link.is_active}
                      onChange={(v) => updateLink(link.id, { is_active: v })}
                      label="Aktivní"
                    />
                    <button
                      type="button"
                      onClick={() => removeLink(link.id)}
                      style={{
                        border: 'none',
                        background: 'transparent',
                        color: T.pink,
                        cursor: 'pointer',
                        padding: 4,
                      }}
                      aria-label="Smazat odkaz"
                    >
                      <IconTrash size={18} />
                    </button>
                  </div>
                  {iconPickerFor === link.id ? (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {LINK_ICON_OPTIONS.map((opt) => (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => {
                            updateLink(link.id, { icon: opt.id as CardLinkIcon })
                            setIconPickerFor(null)
                          }}
                          style={{
                            padding: '6px 10px',
                            borderRadius: 8,
                            border: `1px solid ${link.icon === opt.id ? T.turquoise : T.border}`,
                            background: T.bg,
                            color: T.text,
                            cursor: 'pointer',
                            fontSize: 13,
                          }}
                        >
                          {opt.emoji} {opt.label}
                        </button>
                      ))}
                    </div>
                  ) : null}
                  <input
                    type="url"
                    value={link.url}
                    placeholder="https://…"
                    onChange={(e) => updateLink(link.id, { url: e.target.value })}
                    style={inputStyle}
                  />
                </div>
              ))}

              <button
                type="button"
                onClick={addLink}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '10px 14px',
                  borderRadius: 10,
                  border: `1px solid ${T.border}`,
                  background: T.surface2,
                  color: T.text,
                  fontWeight: 700,
                  fontSize: 13,
                  fontFamily: T.font,
                  cursor: 'pointer',
                }}
              >
                <IconPlus size={16} /> Přidat odkaz
              </button>
              {linkUpgradeHint || links.length >= MAX_CARD_LINKS ? (
                <p style={{ margin: 0, fontSize: 13, color: T.pink }}>
                  Maximum {MAX_CARD_LINKS} odkazů. Upgrade na STARTER pro více možností.
                </p>
              ) : null}
            </Section>

            {/* 5 CO HLEDÁM */}
            <Section title="CO HLEDÁM" open={!!openSections.hledam} onToggle={() => toggleSection('hledam')}>
              <TextArea
                label="Co hledám"
                value={form.looking_for}
                onChange={(v) => patchForm({ looking_for: v.slice(0, 200) })}
                maxLength={200}
                rows={3}
                placeholder="Investory, partnery…"
              />
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {LOOKING_FOR_CHIPS.map((chip) => (
                  <Chip key={chip} onClick={() => insertLookingChip(chip)}>
                    + {chip}
                  </Chip>
                ))}
              </div>
            </Section>

            {/* 6 KDE MĚ POTKÁŠ */}
            <Section title="KDE MĚ POTKÁŠ" open={!!openSections.eventy} onToggle={() => toggleSection('eventy')}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {PRESET_EVENTS.map((name) => (
                  <Chip key={name} onClick={() => addEvent(name)}>
                    + {name}
                  </Chip>
                ))}
                <Chip onClick={() => addEvent('')}>+ Vlastní</Chip>
              </div>

              {events.map((ev) => (
                <div
                  key={ev.id}
                  style={{
                    background: T.surface2,
                    border: `1px solid ${T.border}`,
                    borderRadius: 10,
                    padding: 12,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                  }}
                >
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input
                      type="text"
                      value={ev.name}
                      placeholder="Název eventu"
                      onChange={(e) => updateEvent(ev.id, { name: e.target.value })}
                      style={{ ...inputStyle, flex: 1 }}
                    />
                    <button
                      type="button"
                      onClick={() => removeEvent(ev.id)}
                      style={{
                        border: 'none',
                        background: 'transparent',
                        color: T.pink,
                        cursor: 'pointer',
                        padding: 4,
                      }}
                      aria-label="Smazat event"
                    >
                      <IconTrash size={18} />
                    </button>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <input
                      type="text"
                      value={ev.city || ''}
                      placeholder="Město"
                      onChange={(e) => updateEvent(ev.id, { city: e.target.value || null })}
                      style={inputStyle}
                    />
                    <input
                      type="text"
                      value={ev.booth || ''}
                      placeholder="Stánek"
                      onChange={(e) => updateEvent(ev.id, { booth: e.target.value || null })}
                      style={inputStyle}
                    />
                    <input
                      type="date"
                      value={ev.date_from || ''}
                      onChange={(e) => updateEvent(ev.id, { date_from: e.target.value || null })}
                      style={inputStyle}
                    />
                    <input
                      type="date"
                      value={ev.date_to || ''}
                      onChange={(e) => updateEvent(ev.id, { date_to: e.target.value || null })}
                      style={inputStyle}
                    />
                  </div>
                </div>
              ))}
            </Section>

            {/* 7 VZHLED */}
            <Section title="VZHLED" open={!!openSections.vzhled} onToggle={() => toggleSection('vzhled')}>
              <div>
                <Label>Akcent</Label>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  {CARD_ACCENTS.map((a) => (
                    <button
                      key={a.key}
                      type="button"
                      title={a.label}
                      onClick={() => patchForm({ card_accent: a.value })}
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: '50%',
                        background: a.value,
                        border:
                          form.card_accent === a.value
                            ? '2px solid #fff'
                            : `2px solid ${T.border}`,
                        cursor: 'pointer',
                        boxShadow: form.card_accent === a.value ? `0 0 0 2px ${a.value}` : 'none',
                        transition: 'box-shadow 0.15s ease',
                      }}
                    />
                  ))}
                </div>
              </div>
              <div>
                <Label>Téma</Label>
                <div style={{ display: 'flex', gap: 8 }}>
                  {(
                    [
                      ['graphite', 'Graphite'],
                      ['light', 'Light'],
                    ] as const
                  ).map(([value, label]) => (
                    <Chip
                      key={value}
                      active={form.card_theme === value}
                      onClick={() => patchForm({ card_theme: value })}
                    >
                      {label}
                    </Chip>
                  ))}
                </div>
              </div>
            </Section>

            {/* 8 PUBLIKACE */}
            <Section title="PUBLIKACE" open={!!openSections.publikace} onToggle={() => toggleSection('publikace')}>
              <div>
                <Label>Veřejná adresa (slug)</Label>
                <input
                  type="text"
                  value={form.card_slug}
                  onChange={(e) => patchForm({ card_slug: normalizeCardSlug(e.target.value) })}
                  placeholder="jan-novak"
                  style={{
                    ...inputStyle,
                    borderColor:
                      slugStatus === 'ok' ? '#10b981' : slugStatus === 'bad' ? T.pink : T.border,
                  }}
                />
                <p style={{ margin: '6px 0 0', fontSize: 12, color: slugStatus === 'ok' ? '#10b981' : slugStatus === 'bad' ? T.pink : T.muted }}>
                  {slugStatus === 'checking'
                    ? 'Kontroluji dostupnost…'
                    : slugStatus === 'ok'
                      ? 'Slug je volný ✓'
                      : slugReason || ' '}
                </p>
              </div>

              {publicUrl ? (
                <div
                  style={{
                    display: 'flex',
                    gap: 8,
                    alignItems: 'center',
                    background: T.surface2,
                    border: `1px solid ${T.border}`,
                    borderRadius: 10,
                    padding: '10px 12px',
                  }}
                >
                  <a
                    href={publicUrl}
                    target="_blank"
                    rel="noreferrer"
                    style={{ flex: 1, color: T.turquoise, fontSize: 13, wordBreak: 'break-all' }}
                  >
                    {publicUrl}
                  </a>
                  <button
                    type="button"
                    onClick={() => void copyUrl()}
                    style={{
                      border: 'none',
                      background: 'transparent',
                      color: T.text,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                      fontSize: 12,
                      fontWeight: 700,
                    }}
                  >
                    <IconCopy size={16} />
                    {copied ? 'OK' : 'Copy'}
                  </button>
                </div>
              ) : null}

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>Publikovat kartu</div>
                  <div style={{ fontSize: 12, color: T.secondary }}>
                    {form.card_published ? 'Karta je veřejná' : 'Karta je skrytá'}
                  </div>
                </div>
                <Toggle
                  checked={form.card_published}
                  onChange={(v) => patchForm({ card_published: v })}
                  label="Publikovat"
                />
              </div>

              <button
                type="button"
                onClick={() => setQrOpen(true)}
                disabled={!form.card_slug}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '10px 14px',
                  borderRadius: 10,
                  border: `1px solid rgba(0,212,212,0.4)`,
                  background: 'rgba(0,212,212,0.1)',
                  color: T.turquoise,
                  fontWeight: 700,
                  fontSize: 13,
                  fontFamily: T.font,
                  cursor: form.card_slug ? 'pointer' : 'not-allowed',
                  opacity: form.card_slug ? 1 : 0.5,
                }}
              >
                <IconQrcode size={18} /> QR kód
              </button>

              {!form.card_branding_removed ? (
                <p
                  style={{
                    margin: 0,
                    fontSize: 12,
                    color: T.secondary,
                    lineHeight: 1.45,
                    background: T.surface2,
                    border: `1px solid ${T.border}`,
                    borderRadius: 10,
                    padding: 12,
                  }}
                >
                  Na kartě se zobrazuje „Powered by ABC“. Odstranění brandingu je součástí plánu{' '}
                  <strong style={{ color: T.text }}>STARTER</strong>.
                </p>
              ) : null}
            </Section>
          </div>

          {/* Desktop sticky preview */}
          {isDesktop ? (
            <div style={{ position: 'sticky', top: 24 }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: 10,
                }}
              >
                <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.08em', color: T.secondary }}>
                  NÁHLED
                </span>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 800,
                    color: T.turquoise,
                    border: `1px solid rgba(0,212,212,0.35)`,
                    borderRadius: 999,
                    padding: '2px 8px',
                  }}
                >
                  LIVE
                </span>
              </div>
              {previewBlock}
            </div>
          ) : null}
        </div>
      </div>

      {/* Sticky bottom bar */}
      <div
        style={{
          position: 'fixed',
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 50,
          background: 'rgba(15,15,15,0.92)',
          borderTop: `1px solid ${T.border}`,
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          padding: '12px 16px',
        }}
      >
        <div
          style={{
            maxWidth: 1100,
            margin: '0 auto',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
          }}
        >
          <div
            style={{
              fontSize: 13,
              color:
                saveStatus === 'error' ? T.pink : saveStatus === 'saved' ? T.turquoise : T.secondary,
              minHeight: 18,
              flex: 1,
            }}
          >
            {statusLabel}
          </div>
          <button
            type="button"
            onClick={() => void performSave()}
            disabled={saveStatus === 'saving'}
            style={{
              padding: '12px 22px',
              borderRadius: 10,
              border: 'none',
              background: T.gradient,
              color: '#fff',
              fontWeight: 800,
              fontSize: 14,
              fontFamily: T.font,
              cursor: saveStatus === 'saving' ? 'wait' : 'pointer',
              opacity: saveStatus === 'saving' ? 0.7 : 1,
              minWidth: 120,
            }}
          >
            Uložit
          </button>
        </div>
      </div>

      <CardQrModal
        slug={normalizeCardSlug(form.card_slug)}
        open={qrOpen}
        onClose={() => setQrOpen(false)}
      />
    </div>
  )
}
