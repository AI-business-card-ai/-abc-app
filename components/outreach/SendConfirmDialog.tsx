'use client'

import type { PendingOutreachSend } from '@/lib/hooks/useOutreachSendConfirm'

type Props = {
  pending: PendingOutreachSend | null
  onConfirm: () => void
  onDismiss: () => void
}

export default function SendConfirmDialog({ pending, onConfirm, onDismiss }: Props) {
  if (!pending) return null

  return (
    <div
      className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center p-4"
      style={{ background: 'rgba(7, 5, 14, 0.75)' }}
    >
      <div
        className="w-full max-w-sm rounded-2xl p-5"
        style={{ background: '#1a1a1a', border: '1px solid #2a2a2a' }}
      >
        <p className="text-sm font-semibold mb-1" style={{ color: '#ffffff' }}>
          Did you send the message to {pending.contactName}?
        </p>
        <p className="text-xs mb-4" style={{ color: '#666666' }}>
          via {pending.channel}
        </p>
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={onConfirm}
            className="w-full rounded-xl py-3 text-sm font-bold text-white"
            style={{ background: 'linear-gradient(135deg, #f0197d, #00d4d4)' }}
          >
            ✓ Yes, sent
          </button>
          <button
            type="button"
            onClick={onDismiss}
            className="w-full rounded-xl py-3 text-sm font-semibold"
            style={{ background: '#242424', border: '1px solid #2a2a2a', color: '#999999' }}
          >
            ✗ Not sent
          </button>
        </div>
      </div>
    </div>
  )
}
