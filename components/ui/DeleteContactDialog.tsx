'use client'

import { motion, AnimatePresence } from 'framer-motion'

interface Props {
  open: boolean
  deleting?: boolean
  onCancel: () => void
  onConfirm: () => void
}

export default function DeleteContactDialog({
  open,
  deleting = false,
  onCancel,
  onConfirm,
}: Props) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center px-6"
          style={{ background: 'rgba(7, 5, 14, 0.85)', backdropFilter: 'blur(6px)' }}
          onClick={deleting ? undefined : onCancel}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 8 }}
            animate={{ opacity: deleting ? 0.6 : 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 8 }}
            transition={{ duration: 0.2 }}
            className="w-full max-w-sm rounded-xl p-6"
            style={{ background: '#0D0A18', border: '0.5px solid #1A0E30' }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-bold text-base mb-2" style={{ color: '#F0EAFF' }}>
              Delete contact?
            </h3>
            <p className="text-sm mb-6 leading-relaxed" style={{ color: '#8B6ABF' }}>
              This action cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={onCancel}
                disabled={deleting}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium disabled:opacity-40"
                style={{ border: '0.5px solid #1A0E30', color: '#F0EAFF' }}
              >
                Cancel
              </button>
              <button
                onClick={onConfirm}
                disabled={deleting}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-40"
                style={{ background: '#EF4444' }}
              >
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

async function deleteContactApi(contactId: string) {
  const res = await fetch('/api/card/delete', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contactId }),
  })
  const json = await res.json()
  if (!res.ok || !json.success) {
    throw new Error(json.error || 'Delete failed.')
  }
}

export { deleteContactApi }
