'use client'

import { IconAlertTriangle, IconCheck, IconLoader2 } from '@tabler/icons-react'

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

/**
 * Sticky save. On mobile it sits above the app's bottom navigation rather than
 * behind it; on desktop it pins to the bottom of the editor column.
 */
export default function SaveBar({
  dirty,
  status,
  error,
  onSave,
}: {
  dirty: boolean
  status: SaveStatus
  error: string | null
  onSave: () => void
}) {
  const saving = status === 'saving'

  return (
    <div
      className="sticky z-[60] -mx-4 mt-6 border-t border-abc-border bg-abc-bg/95 px-4 py-3 backdrop-blur-xl sm:-mx-6 sm:px-6 lg:mx-0 lg:rounded-card lg:border lg:px-4"
      style={{ bottom: 'calc(72px + env(safe-area-inset-bottom))' }}
    >
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1" aria-live="polite">
          {status === 'error' ? (
            <p
              className="flex items-start gap-1.5 text-[12.5px] leading-[1.4]"
              style={{ color: 'var(--abc-overdue)' }}
              role="alert"
            >
              <IconAlertTriangle size={14} stroke={1.9} className="mt-px shrink-0" />
              <span>{error || 'Could not save. Try again.'}</span>
            </p>
          ) : status === 'saved' ? (
            <p
              className="inline-flex items-center gap-1.5 text-[12.5px]"
              style={{ color: 'var(--abc-green)' }}
            >
              <IconCheck size={14} stroke={2.2} />
              Saved
            </p>
          ) : dirty ? (
            <p className="text-[12.5px] text-abc-secondary">Unsaved changes</p>
          ) : (
            <p className="text-[12.5px] text-abc-muted">Everything is saved</p>
          )}
        </div>

        {/* Gold only when pressing it would actually do something. */}
        <button
          type="button"
          onClick={onSave}
          disabled={saving || !dirty}
          className={`inline-flex h-[48px] shrink-0 items-center justify-center gap-2 rounded-btn px-5 text-[15px] font-semibold transition-colors duration-200 ease-abc abc-focus-ring ${
            dirty && !saving
              ? 'bg-abc-gold text-[#1a1205] hover:brightness-[1.06]'
              : 'cursor-not-allowed border border-abc-border bg-abc-raised text-abc-muted'
          }`}
        >
          {saving ? <IconLoader2 size={17} stroke={2} className="animate-spin" /> : null}
          {saving ? 'Saving…' : 'Save changes'}
        </button>
      </div>
    </div>
  )
}
