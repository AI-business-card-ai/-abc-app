'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { IconAlertTriangle, IconCheck, IconLoader2, IconMessage2, IconTarget } from '@tabler/icons-react'
import { Chip, Field, Section, TextArea } from '@/components/card/editor/EditorPrimitives'
import SettingsPageHeader from '@/components/settings/SettingsPageHeader'
import { normalizeAbcProfile, stripProfileSecrets, PROFILE_SAFE_COLUMNS } from '@/lib/profile-defaults'
import { createClientComponent } from '@/lib/supabase'
import type { ABCProfile } from '@/lib/types'

/**
 * Smart Follow-up preferences.
 *
 * The context and tone ABC writes follow-ups from, and nothing else. This was
 * the lower half of the old account screen, where it shared a Save button with
 * a plan summary and a sign-out button that had nothing to do with it; the save
 * only ever wrote these seven columns, so the button was always narrower than
 * the screen it sat on. Now the screen is as narrow as the save.
 *
 * Identity is still absent by design. Name, role, company, contact details,
 * photo, socials and card address belong to the card editor, and writing them
 * from a second form is what used to overwrite the editor's values with stale
 * ones.
 */

/** Only these reach the database — the save validates against the same list. */
const COMMUNICATION_STYLES = ['Direct', 'Formal', 'Casual'] as const
const OUTREACH_LANGUAGES = ['EN', 'CZ', 'DE', 'SK'] as const
const MESSAGE_GOALS = [
  'Schedule a meeting',
  'Get on a call',
  'Send our deck',
  'Start a conversation',
] as const
const MESSAGE_LENGTHS = ['Short', 'Medium', 'Long'] as const

type SaveState = 'idle' | 'saving' | 'saved' | 'error'

/** The follow-up fields only — identity lives on the card. */
const SNAPSHOT_KEYS = [
  'goals',
  'product_description',
  'icp',
  'communication_style',
  'outreach_language',
  'message_goal',
  'message_length',
]

function snapshotOf(profile: Record<string, unknown>): string {
  return JSON.stringify(SNAPSHOT_KEYS.map((k) => profile[k] ?? null))
}

export default function FollowUpSettingsView({
  initialProfile,
}: {
  initialProfile?: Partial<ABCProfile> | null
}) {
  const supabase = useMemo(() => createClientComponent(), [])

  const [loading, setLoading] = useState(!initialProfile)
  const [profile, setProfile] = useState<Record<string, unknown>>(() => initialProfile ?? {})
  // Seeded synchronously: computing this in an effect made the very first
  // render look dirty, so the server sent a gold, enabled Save button that
  // only corrected itself after hydration.
  const [savedSnapshot, setSavedSnapshot] = useState(() =>
    initialProfile ? snapshotOf(initialProfile as Record<string, unknown>) : ''
  )
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState<Record<string, boolean>>({
    goals: true,
    messages: false,
  })

  const snapshot = snapshotOf

  const loadProfile = useCallback(async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return

      const { data } = await supabase.from('abc_profiles').select(PROFILE_SAFE_COLUMNS).eq('id', user.id).maybeSingle()
      if (data) {
        /*
          Stripped for the same reason the server strips: PROFILE_SAFE_COLUMNS
          selects the whole row, and the whole row carries OAuth credentials.
          The server path has always stripped before handing the row to a client
          component; this fallback read it straight into component state. It is
          unreachable while the page supplies initialProfile, which is exactly
          why it was worth closing before it stops being unreachable.
        */
        const normalized = stripProfileSecrets(
          normalizeAbcProfile(data as Partial<ABCProfile>, user.email)
        ) as unknown as Record<string, unknown>
        setProfile(normalized)
        setSavedSnapshot(snapshot(normalized))
      }
    } catch (err) {
      console.error('[settings/follow-up] load failed:', err)
      setError('Your settings could not be loaded. Check your connection and try again.')
    } finally {
      setLoading(false)
    }
  }, [snapshot, supabase])

  useEffect(() => {
    if (initialProfile) {
      setSavedSnapshot(snapshot(initialProfile as Record<string, unknown>))
      return
    }
    void loadProfile()
  }, [initialProfile, loadProfile, snapshot])

  const dirty = !loading && snapshot(profile) !== savedSnapshot

  function patch(next: Record<string, unknown>) {
    setProfile((prev) => ({ ...prev, ...next }))
    setSaveState('idle')
  }

  const save = useCallback(async () => {
    setSaveState('saving')
    setError(null)
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) {
        setSaveState('error')
        setError('You are signed out. Sign in and try again.')
        return
      }

      const rawStyle = String(profile.communication_style || 'direct')
      const communicationStyle = ['direct', 'formal', 'casual'].includes(rawStyle) ? rawStyle : 'direct'

      // Identity columns are intentionally absent — the card editor owns them.
      const payload: Record<string, unknown> = {
        goals: profile.goals || null,
        product_description: profile.product_description || null,
        icp: profile.icp || null,
        communication_style: communicationStyle,
        outreach_language: profile.outreach_language || 'EN',
        message_length: profile.message_length || 'medium',
        message_goal: profile.message_goal || 'Schedule a meeting',
      }

      const { error: saveError } = await supabase.from('abc_profiles').update(payload).eq('id', user.id)

      if (saveError) throw saveError

      setSavedSnapshot(snapshot(profile))
      setSaveState('saved')
      setTimeout(() => setSaveState((s) => (s === 'saved' ? 'idle' : s)), 2500)
    } catch (err) {
      console.error('[settings/follow-up] save failed:', err)
      setSaveState('error')
      setError('Your settings could not be saved. Check your connection and try again.')
    }
  }, [profile, snapshot, supabase])

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-[560px] px-4 py-8 sm:px-6">
        <p className="text-[14px] text-abc-secondary">Loading your settings…</p>
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-[560px] px-4 pb-10 pt-5 sm:px-6 lg:pt-8">
      <SettingsPageHeader
        title="Smart Follow-up"
        description="Teach ABC how you want to communicate"
      />

      <div className="mt-6 flex flex-col gap-3">
        <Section
          id="goals"
          title="What you are looking for"
          description="Gives AI the context it writes from"
          icon={IconTarget}
          open={open.goals}
          onToggle={() => setOpen((o) => ({ ...o, goals: !o.goals }))}
        >
          <div className="flex flex-col gap-4">
            <TextArea
              label="Your goals"
              value={String(profile.goals || '')}
              onChange={(goals) => patch({ goals })}
              placeholder="Expo partners, B2B SaaS investors, EU market expansion…"
              rows={3}
            />
            <Field
              label="Your product or service"
              value={String(profile.product_description || '')}
              onChange={(product_description) => patch({ product_description })}
              placeholder="ABC AI Business Card — scan to CRM in seconds"
            />
            <Field
              label="Target customer"
              value={String(profile.icp || '')}
              onChange={(icp) => patch({ icp })}
              placeholder="Sales directors and founders at B2B tech companies"
            />
          </div>
        </Section>

        <Section
          id="messages"
          title="AI messages"
          description="How AI writes on your behalf"
          icon={IconMessage2}
          open={open.messages}
          onToggle={() => setOpen((o) => ({ ...o, messages: !o.messages }))}
        >
          <div className="flex flex-col gap-5">
            <fieldset>
              <legend className="text-[12.5px] font-medium text-abc-secondary">Tone</legend>
              <div className="mt-2.5 flex flex-wrap gap-2">
                {COMMUNICATION_STYLES.map((style) => (
                  <Chip
                    key={style}
                    active={String(profile.communication_style || 'direct') === style.toLowerCase()}
                    onClick={() => patch({ communication_style: style.toLowerCase() })}
                  >
                    {style}
                  </Chip>
                ))}
              </div>
            </fieldset>

            <fieldset>
              <legend className="text-[12.5px] font-medium text-abc-secondary">Outreach language</legend>
              <div className="mt-2.5 flex flex-wrap gap-2">
                {OUTREACH_LANGUAGES.map((lang) => (
                  <Chip
                    key={lang}
                    active={String(profile.outreach_language || 'EN') === lang}
                    onClick={() => patch({ outreach_language: lang })}
                  >
                    {lang}
                  </Chip>
                ))}
              </div>
            </fieldset>

            <fieldset>
              <legend className="text-[12.5px] font-medium text-abc-secondary">Goal of the message</legend>
              <div className="mt-2.5 flex flex-wrap gap-2">
                {MESSAGE_GOALS.map((goal) => (
                  <Chip
                    key={goal}
                    active={String(profile.message_goal || 'Schedule a meeting') === goal}
                    onClick={() => patch({ message_goal: goal })}
                  >
                    {goal}
                  </Chip>
                ))}
              </div>
            </fieldset>

            <fieldset>
              <legend className="text-[12.5px] font-medium text-abc-secondary">Length</legend>
              <div className="mt-2.5 flex flex-wrap gap-2">
                {MESSAGE_LENGTHS.map((len) => (
                  <Chip
                    key={len}
                    active={String(profile.message_length || 'medium') === len.toLowerCase()}
                    onClick={() => patch({ message_length: len.toLowerCase() })}
                  >
                    {len}
                  </Chip>
                ))}
              </div>
            </fieldset>
          </div>
        </Section>
      </div>

      {/* Save */}
      <div
        className="sticky z-[60] -mx-4 mt-6 border-t border-abc-border bg-abc-bg/95 px-4 py-3 backdrop-blur-xl sm:-mx-6 sm:px-6"
        style={{ bottom: 'calc(72px + env(safe-area-inset-bottom))' }}
      >
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1" aria-live="polite">
            {saveState === 'error' ? (
              <p
                className="flex items-start gap-1.5 text-[12.5px] leading-[1.4]"
                style={{ color: 'var(--abc-overdue)' }}
                role="alert"
              >
                <IconAlertTriangle size={14} stroke={1.9} className="mt-px shrink-0" />
                <span>{error || 'Could not save. Try again.'}</span>
              </p>
            ) : saveState === 'saved' ? (
              <p className="inline-flex items-center gap-1.5 text-[12.5px]" style={{ color: 'var(--abc-green)' }}>
                <IconCheck size={14} stroke={2.2} />
                Saved
              </p>
            ) : dirty ? (
              <p className="text-[12.5px] text-abc-secondary">Unsaved changes</p>
            ) : (
              <p className="text-[12.5px] text-abc-muted">Everything is saved</p>
            )}
          </div>

          <button
            type="button"
            onClick={() => void save()}
            disabled={saveState === 'saving' || !dirty}
            className={`inline-flex h-[48px] shrink-0 items-center justify-center gap-2 rounded-btn px-5 text-[15px] font-semibold transition-colors duration-200 ease-abc abc-focus-ring ${
              dirty && saveState !== 'saving'
                ? 'bg-abc-gold text-[#1a1205] hover:brightness-[1.06]'
                : 'cursor-not-allowed border border-abc-border bg-abc-raised text-abc-muted'
            }`}
          >
            {saveState === 'saving' ? <IconLoader2 size={17} stroke={2} className="animate-spin" /> : null}
            {saveState === 'saving' ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </div>
    </div>
  )
}
